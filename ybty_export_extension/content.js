(() => {
  "use strict";

  const PANEL_ID = "codex-ybty-export-panel";
  const STATUS_ID = "codex-ybty-export-status";
  const MATCH_SELECTOR = ".c-match-item";
  const LEAGUE_SELECTOR = ".play-match-league";
  const COLUMN_SELECTOR = ".handicap-col";
  const BET_SELECTOR = ".c-bet-item";
  const MARKET_NAMES = [
    "full_h2h",
    "full_spread",
    "full_total",
    "half_h2h",
    "half_spread",
    "half_total"
  ];

  let scanning = false;

  const sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

  const clean = (value) =>
    String(value || "")
      .replace(/\s+/g, " ")
      .trim();

  function text(root, selector) {
    return clean(root.querySelector(selector)?.textContent);
  }

  function findLeague(match) {
    let node = match;
    while (node) {
      let sibling = node.previousElementSibling;
      while (sibling) {
        if (sibling.matches?.(LEAGUE_SELECTOR)) return leagueName(sibling);
        const nested = sibling.querySelector?.(LEAGUE_SELECTOR);
        if (nested) return leagueName(nested);
        sibling = sibling.previousElementSibling;
      }
      node = node.parentElement;
      if (!node || node === document.body) break;
    }
    return "";
  }

  function leagueName(element) {
    return clean(element.textContent).replace(/(?<=[\u3400-\u9fff])\d{1,3}$/, "");
  }

  function parseBet(item) {
    const selection = text(item, ".handicap-value-text");
    const odds = text(item, ".highlight-odds");
    const raw = clean(item.textContent);
    return {
      selection,
      odds,
      suspended: !odds || raw === "-",
      text: raw
    };
  }

  function scheduledTime(match) {
    const liveClock = text(match, ".timer-layout2");
    const attributes = [
      "data-start-time",
      "data-match-time",
      "data-commence-time",
      "data-start"
    ];
    for (const name of attributes) {
      const value = clean(match.getAttribute(name));
      if (value) return value;
    }
    const node = match.querySelector(
      "time[datetime], .match-time, .start-time, [class*='start-time']"
    );
    const direct = clean(node?.getAttribute?.("datetime") || node?.textContent);
    if (direct && direct !== liveClock) return direct;
    const canvasText = [...match.querySelectorAll("canvas")]
      .map((canvas) => {
        try {
          return JSON.parse(canvas.dataset.codexCanvasText || "[]")
            .map((command) => command.text)
            .join(" ");
        } catch {
          return "";
        }
      })
      .join(" ");
    const candidates =
      canvasText.match(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g) || [];
    return candidates.find((value) => value !== liveClock) || "";
  }

  function parseMatch(match) {
    const teams = [...match.querySelectorAll(".team-name")].map((node) =>
      clean(node.textContent)
    );
    if (teams.length < 2) return null;

    const scores = [...match.querySelectorAll(".score")].map((node) =>
      clean(node.textContent)
    );
    const reds = [...match.querySelectorAll(".red-ball")].map((node) =>
      clean(node.textContent)
    );
    const columns = [...match.querySelectorAll(COLUMN_SELECTOR)];
    const markets = columns.map((column, index) => ({
      line_index: Math.floor(index / MARKET_NAMES.length),
      market: MARKET_NAMES[index % MARKET_NAMES.length],
      options: [...column.querySelectorAll(BET_SELECTOR)].map(parseBet)
    }));

    return {
      source_match_id:
        match.getAttribute("data-match-id") ||
        match.getAttribute("data-id") ||
        match.id ||
        null,
      league: findLeague(match),
      home: teams[0],
      away: teams[1],
      home_score: scores[0] || null,
      away_score: scores[1] || null,
      home_red: reds[0] || "0",
      away_red: reds[1] || "0",
      clock: text(match, ".timer-layout2"),
      play_count: text(match, ".play-count"),
      commence_time: scheduledTime(match) || null,
      captured_at: new Date().toISOString(),
      markets
    };
  }

  function matchKey(match) {
    return [
      match.league,
      match.home,
      match.away,
      match.source_match_id || ""
    ].join("|");
  }

  function isExcludedElectronicMatch(match) {
    const value = [match.league, match.home, match.away]
      .filter(Boolean)
      .join(" ");
    return value.includes("梦幻对垒")
      || value.includes("瓦尔哈拉杯")
      || value.includes("开云")
      || /(?:^|\s)VS\s*[-－]/i.test(value)
      || /(?:^|\D)(?:8|10|12)分钟(?:\D|$)/.test(value);
  }

  function findScrollContainer(firstMatch) {
    let node = firstMatch?.parentElement;
    while (node && node !== document.documentElement) {
      const style = getComputedStyle(node);
      const scrollable =
        /(auto|scroll)/.test(style.overflowY) &&
        node.scrollHeight > node.clientHeight + 30;
      if (scrollable) return node;
      node = node.parentElement;
    }

    const candidates = [...document.querySelectorAll("div")].filter((element) => {
      const style = getComputedStyle(element);
      return (
        /(auto|scroll)/.test(style.overflowY) &&
        element.scrollHeight > element.clientHeight + 100 &&
        element.querySelector(MATCH_SELECTOR)
      );
    });
    candidates.sort((a, b) => b.scrollHeight - a.scrollHeight);
    return candidates[0] || document.scrollingElement;
  }

  function setStatus(message, error = false) {
    const node = document.getElementById(STATUS_ID);
    if (!node) return;
    node.textContent = message;
    node.style.background = error ? "#a61b1b" : "#162238";
  }

  function isLiveMatch(match) {
    const clock = clean(match.clock);
    return /(?:^\d{1,3}:\d{2}$|\d{1,3}\s*['′]|中场|半场|HT|加时|完场)/i.test(clock);
  }

  function downloadJson(matches, mode) {
    const payload = {
      schema_version: 1,
      source: location.href,
      export_mode: mode,
      captured_at: new Date().toISOString(),
      count: matches.length,
      matches
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8"
    });
    const link = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.href = URL.createObjectURL(blob);
    link.download = `ybty_${mode}_${stamp}.json`;
    document.documentElement.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  async function scanAll(mode) {
    if (scanning) return;
    scanning = true;
    const found = new Map();

    try {
      const firstMatch = document.querySelector(MATCH_SELECTOR);
      if (!firstMatch) {
        throw new Error("当前框架没有发现比赛列表，请打开滚球或今日赛事页");
      }
      setStatus("正在采集已手动展开的比赛…");
      const scroller = findScrollContainer(firstMatch);
      const originalTop = scroller.scrollTop;
      scroller.scrollTop = 0;
      await sleep(700);

      let unchangedRounds = 0;
      let previousTop = -1;
      for (let round = 0; round < 240; round += 1) {
        const visible = [...document.querySelectorAll(MATCH_SELECTOR)];
        const before = found.size;
        for (const node of visible) {
          const match = parseMatch(node);
          if (match) found.set(matchKey(match), match);
        }
        unchangedRounds = found.size === before ? unchangedRounds + 1 : 0;
        setStatus(`正在采集：${found.size}场（第${round + 1}屏）`);

        const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        const nextTop = Math.min(
          maxTop,
          scroller.scrollTop + Math.max(350, Math.floor(scroller.clientHeight * 0.72))
        );
        if (
          (nextTop >= maxTop && unchangedRounds >= 2) ||
          (nextTop === previousTop && unchangedRounds >= 2)
        ) {
          break;
        }
        previousTop = scroller.scrollTop;
        scroller.scrollTop = nextTop;
        scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
        await sleep(550);
      }

      scroller.scrollTop = originalTop;
      const allMatches = [...found.values()];
      const matches = allMatches.filter(
        (match) =>
          !isExcludedElectronicMatch(match) &&
          (mode === "live" ? isLiveMatch(match) : !isLiveMatch(match))
      );
      if (!matches.length) throw new Error("没有采集到有效比赛");
      downloadJson(matches, mode);
      setStatus(`完成：已导出${matches.length}场`);
    } catch (error) {
      setStatus(`失败：${error.message}`, true);
    } finally {
      scanning = false;
    }
  }

  function mount() {
    if (
      document.getElementById(PANEL_ID) ||
      !document.querySelector(MATCH_SELECTOR)
    ) {
      return;
    }
    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.style.cssText = [
      "position:fixed",
      "right:18px",
      "bottom:18px",
      "z-index:2147483647",
      "font:13px/1.4 Arial,sans-serif",
      "color:#fff",
      "box-shadow:0 4px 16px rgba(0,0,0,.28)"
    ].join(";");

    const button = document.createElement("button");
    button.id = "codex-ybty-live-export-button";
    button.type = "button";
    button.textContent = "一键导出盘口";
    button.style.cssText = [
      "display:block",
      "width:150px",
      "padding:10px 12px",
      "border:0",
      "border-radius:8px 8px 0 0",
      "background:#1677ff",
      "color:#fff",
      "cursor:pointer",
      "font-weight:700"
    ].join(";");
    button.textContent = "导出滚球盘口";
    button.addEventListener("click", () => scanAll("live"));

    const prematchButton = document.createElement("button");
    prematchButton.id = "codex-ybty-prematch-export-button";
    prematchButton.type = "button";
    prematchButton.textContent = "导出非滚球盘口";
    prematchButton.style.cssText = [
      "display:block",
      "width:150px",
      "padding:10px 12px",
      "border:0",
      "background:#0f9d58",
      "color:#fff",
      "cursor:pointer",
      "font-weight:700"
    ].join(";");
    prematchButton.addEventListener("click", () => scanAll("prematch"));

    const status = document.createElement("div");
    status.id = STATUS_ID;
    status.textContent = "等待采集";
    status.style.cssText = [
      "width:150px",
      "box-sizing:border-box",
      "padding:7px 9px",
      "border-radius:0 0 8px 8px",
      "background:#162238",
      "text-align:center"
    ].join(";");

    panel.append(button, prematchButton, status);
    document.documentElement.appendChild(panel);
  }

  const observer = new MutationObserver(mount);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  mount();
})();
