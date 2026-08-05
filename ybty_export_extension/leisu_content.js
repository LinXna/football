(() => {
  "use strict";

  const BUTTON_ID = "codex-leisu-live-export-button";
  const FULL_LIVE_BUTTON_ID = "codex-leisu-full-live-export-button";
  const PREMATCH_BUTTON_ID = "codex-leisu-prematch-export-button";
  const HISTORY_KEY = "codex_leisu_live_history_v1";
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  let collecting = false;

  function download(payload, mode) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8"
    });
    const link = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.href = URL.createObjectURL(blob);
    link.download = `leisu_${mode}_${stamp}.json`;
    document.documentElement.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function standaloneNumbers(value) {
    return [...value.matchAll(/(?:^|\s)(\d{1,2})(?=\s|$)/g)].map((item) =>
      Number(item[1])
    );
  }

  function scoreValues(rowText, home, away) {
    const homeIndex = rowText.indexOf(home);
    const awayIndex = rowText.indexOf(away, homeIndex + home.length);
    if (homeIndex < 0 || awayIndex < 0) return [0, 0];
    const beforeHome = rowText.slice(0, homeIndex);
    const afterAway = rowText
      .slice(awayIndex + away.length)
      .split("数据", 1)[0];
    const homeNumbers = standaloneNumbers(beforeHome);
    const awayNumbers = standaloneNumbers(afterAway);
    return [homeNumbers.at(-1) ?? 0, awayNumbers[0] ?? 0];
  }

  function canvasScoreValues(row) {
    const scoreText = capturedCanvasText(
      row.querySelector(".lier-score canvas.qcbf, .lier-score canvas, canvas.qcbf")
    );
    const match = scoreText.match(/(\d{1,2})\s*-\s*(\d{1,2})/);
    return match
      ? { values: [Number(match[1]), Number(match[2])], text: match[0] }
      : null;
  }

  function capturedCanvasText(canvas) {
    if (!canvas) return "";
    try {
      return JSON.parse(canvas.dataset.codexCanvasText || "[]")
        .map((command) => command.text)
        .join(" ")
        .trim();
    } catch {
      return "";
    }
  }

  const PHASE_LABELS = {
    即时: "live",
    即時: "live",
    赛前: "pre_match",
    賽前: "pre_match",
    初盘: "opening",
    初盤: "opening"
  };

  const MARKET_LABELS = {
    让球: "asian_handicap",
    讓球: "asian_handicap",
    胜平负: "match_winner",
    勝平負: "match_winner",
    总进球: "total_goals",
    總進球: "total_goals",
    角球: "corners"
  };

  function classifyLabel(textValue, labels) {
    const value = clean(textValue);
    for (const [label, key] of Object.entries(labels)) {
      if (value.includes(label)) return key;
    }
    return null;
  }

  function numericOdds(textValue) {
    return [...clean(textValue).matchAll(/(?:^|\s)(\d{1,3}(?:\.\d{1,3}))(?=\s|$)/g)]
      .map((match) => Number(match[1]))
      .filter((value) => value >= 1 && value <= 1000);
  }

  function selectedAttributes(element) {
    const output = {};
    for (const attribute of element.attributes || []) {
      if (
        attribute.name === "title" ||
        attribute.name === "data-type" ||
        attribute.name === "data-market" ||
        attribute.name === "data-name" ||
        attribute.name === "data-odd" ||
        attribute.name === "data-odds"
      ) {
        output[attribute.name] = attribute.value;
      }
    }
    return output;
  }

  function oddsContext(node, row) {
    const parts = [];
    let current = node;
    while (current && current !== row) {
      let sibling = current.previousElementSibling;
      let count = 0;
      while (sibling && count < 4) {
        const value = clean(sibling.textContent);
        if (value) parts.unshift(value);
        sibling = sibling.previousElementSibling;
        count += 1;
      }
      current = current.parentElement;
    }
    return clean(parts.join(" "));
  }

  function parseOddsPanels(row, extraPanels = []) {
    const nodes = [...row.querySelectorAll(".lier-odd")];
    let lastPhase = null;
    let lastMarket = null;
    const entries = nodes.map((node, index) => {
      const rawText = clean(node.textContent);
      const context = oddsContext(node, row);
      const combined = clean(`${context} ${rawText}`);
      const phase =
        classifyLabel(combined, PHASE_LABELS) ||
        classifyLabel(rawText, PHASE_LABELS) ||
        lastPhase;
      const market =
        classifyLabel(combined, MARKET_LABELS) ||
        classifyLabel(rawText, MARKET_LABELS) ||
        lastMarket;
      if (phase) lastPhase = phase;
      if (market) lastMarket = market;
      return {
        index,
        phase,
        market,
        text: rawText,
        context,
        odds: numericOdds(rawText),
        class_name: clean(node.className),
        attributes: selectedAttributes(node)
      };
    });

    const markets = {};
    for (const entry of entries) {
      const market = entry.market || "unclassified";
      const phase = entry.phase || "unclassified";
      markets[market] ||= {};
      markets[market][phase] ||= [];
      markets[market][phase].push(entry);
    }
    const panelEntries = extraPanels.map((panel, index) => {
      const rawText = clean(panel.text);
      return {
        index: entries.length + index,
        phase: classifyLabel(rawText, PHASE_LABELS),
        market: classifyLabel(rawText, MARKET_LABELS),
        text: rawText,
        context: panel.selector || "dynamic_overlay",
        odds: numericOdds(rawText),
        class_name: panel.class_name || "",
        attributes: panel.attributes || {}
      };
    });
    for (const entry of panelEntries) {
      const market = entry.market || "unclassified";
      const phase = entry.phase || "unclassified";
      markets[market] ||= {};
      markets[market][phase] ||= [];
      markets[market][phase].push(entry);
    }
    const canvasGroups = {};
    for (const group of row.querySelectorAll(
      ".lier-odd .asian_odds, .lier-odd .daxiao_odds"
    )) {
      const market = group.classList.contains("asian_odds")
        ? "asian_handicap"
        : "total_goals";
      canvasGroups[market] = [...group.querySelectorAll("canvas")].map(
        (canvas, index) => {
          let commands = [];
          try {
            commands = JSON.parse(canvas.dataset.codexCanvasText || "[]");
          } catch {
            commands = [];
          }
          return {
            index,
            width: canvas.width,
            height: canvas.height,
            text: commands.map((command) => command.text).join(" ").trim(),
            commands
          };
        }
      );
    }
    const values = (market) =>
      (canvasGroups[market] || []).map((item) => item.text || null);
    const asian = values("asian_handicap");
    const totals = values("total_goals");
    const current = {
      asian_handicap: {
        home: asian[0] || null,
        line: asian[1] || null,
        away: asian[2] || null
      },
      total_goals: {
        over: totals[0] || null,
        line: totals[1] || null,
        under: totals[2] || null
      }
    };
    return {
      count: entries.length + panelEntries.length,
      markets,
      entries: [...entries, ...panelEntries],
      current,
      coverage: {
        live_asian_handicap: Boolean(
          current.asian_handicap.home &&
          current.asian_handicap.line &&
          current.asian_handicap.away
        ),
        live_total_goals: Boolean(
          current.total_goals.over &&
          current.total_goals.line &&
          current.total_goals.under
        ),
        corner_score_only: true,
        corner_odds: false,
        pre_match_closing: false
      },
      canvas_markets: canvasGroups,
      diagnostics: nodes.map((node) => ({
        html: node.outerHTML.slice(0, 8000),
        parent_html: node.parentElement?.outerHTML.slice(0, 16000) || ""
      }))
    };
  }

  function visible(element) {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity || 1) > 0 &&
      rect.width > 2 &&
      rect.height > 2
    );
  }

  function dynamicOddsPanels() {
    const selectors = [
      '[role="tooltip"]',
      ".el-popper",
      ".el-popover",
      ".el-tooltip__popper",
      ".ant-popover",
      ".popover",
      ".tooltip",
      '[class*="odd-pop"]',
      '[class*="odds-pop"]',
      '[class*="odd-detail"]',
      '[class*="odds-detail"]'
    ];
    const seen = new Set();
    const output = [];
    for (const element of document.querySelectorAll(selectors.join(","))) {
      if (seen.has(element) || !visible(element)) continue;
      seen.add(element);
      const value = clean(element.innerText || element.textContent);
      const hasPhase = classifyLabel(value, PHASE_LABELS);
      const hasMarket = classifyLabel(value, MARKET_LABELS);
      if (!value || (!hasPhase && !hasMarket && !numericOdds(value).length)) continue;
      output.push({
        selector: selectors.find((selector) => element.matches(selector)) || "",
        text: value,
        class_name: clean(element.className),
        attributes: selectedAttributes(element)
      });
    }
    return output;
  }

  async function captureOdds(row) {
    return parseOddsPanels(row, dynamicOddsPanels());
  }

  async function enrichOddsDetail(event, index, total) {
    button.textContent = `读取赔率详情 ${index + 1}/${total}`;
    try {
      event.odds.detail = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "CODEX_COLLECT_ODDS_DETAIL",
            match_id: event.id
          },
          (response) => {
            if (chrome.runtime.lastError) {
              resolve({
                available: false,
                reason: chrome.runtime.lastError.message
              });
              return;
            }
            resolve(response || { available: false, reason: "empty_response" });
          }
        );
      });
    } catch (error) {
      event.odds.detail = {
        available: false,
        reason: error.message || "detail_failed"
      };
    }
  }

  async function enrichAllOddsDetails(events) {
    const detailConcurrency = 2;
    for (let index = 0; index < events.length; index += detailConcurrency) {
      const batch = events.slice(index, index + detailConcurrency);
      await Promise.all(
        batch.map((event, offset) =>
          enrichOddsDetail(event, index + offset, events.length)
        )
      );
      if (index + detailConcurrency < events.length) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }
  }

  async function enrichAllStatistics(events) {
    const statisticsConcurrency = 6;
    for (let index = 0; index < events.length; index += statisticsConcurrency) {
      const batch = events.slice(index, index + statisticsConcurrency);
      await Promise.all(
        batch.map((event, offset) =>
          enrichStatistics(event, index + offset, events.length)
        )
      );
      if (index + statisticsConcurrency < events.length) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
  }

  function parseRow(row) {
    let teamLinks = [...row.querySelectorAll(
      [
        'a[href*="/data/zuqiu/team-"]',
        'a[href*="/team-"]',
        ".team-name",
        '[class*="team-name"]',
        ".lab-team",
        '[class*="team-item"]'
      ].join(",")
    )]
      .map((link) => clean(link.textContent))
      .filter(Boolean);
    teamLinks = [...new Set(teamLinks)];
    if (teamLinks.length < 2) {
      const fallbackLinks = [...row.querySelectorAll("a")]
        .filter((link) => {
          const href = link.getAttribute("href") || "";
          return (
            !href.includes("/detail-") &&
            !href.includes("/comp-") &&
            clean(link.textContent).length >= 2
          );
        })
        .map((link) => clean(link.textContent))
        .filter(Boolean);
      teamLinks = [...new Set(fallbackLinks)].slice(-2);
    }
    if (teamLinks.length < 2) return null;

    const detail = row.querySelector('a[href*="/detail-"]');
    const detailUrl = detail?.href || "";
    const id =
      detailUrl.match(/detail-(\d+)/)?.[1] ||
      row.getAttribute("data-id") ||
      row.getAttribute("data-match-id") ||
      row.id ||
      `${teamLinks[0]}-${teamLinks[1]}`;
    if (!id) return null;

    const rowText = clean(row.innerText);
    const minuteMatch = rowText.match(/(?:^|\s)(\d{1,3})'/);
    const canvasScore = canvasScoreValues(row);
    const scores =
      canvasScore?.values || scoreValues(rowText, teamLinks[0], teamLinks[1]);
    const halftime = /(?:^|\s)中(?:\s|$)/.test(rowText);
    const notStarted = /(?:^|\s)未(?:\s|$)/.test(rowText);
    const league =
      clean(row.querySelector('a[href*="/data/zuqiu/comp-"]')?.textContent) ||
      rowText.split(" ")[0] ||
      "";
    const rowCanvasText = [...row.querySelectorAll("canvas")]
      .map(capturedCanvasText)
      .filter(Boolean)
      .join(" ");
    const visibleTime =
      rowCanvasText.match(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/)?.[0] || null;
    const startValue =
      row.getAttribute("data-start-time") ||
      row.getAttribute("data-match-time") ||
      row.querySelector("time[datetime]")?.getAttribute("datetime") ||
      null;
    let startTimestamp = null;
    if (startValue) {
      const numeric = Number(startValue);
      if (Number.isFinite(numeric)) {
        startTimestamp = numeric > 1e12 ? Math.floor(numeric / 1000) : numeric;
      } else {
        const parsed = Date.parse(startValue);
        if (Number.isFinite(parsed)) startTimestamp = Math.floor(parsed / 1000);
      }
    }
    const finished = /(?:^|\s)(?:完|完场)(?=\s|$)/.test(rowText);

    return {
      id,
      _provider: "leisu",
      _minute: minuteMatch ? Number(minuteMatch[1]) : halftime ? 45 : null,
      _statistics: {},
      _incidents: [],
      detail_url: detailUrl,
      startTimestamp,
      _start_time_text: visibleTime,
      _row_canvas_text: rowCanvasText,
      _row_score_text: canvasScore?.text || null,
      _score_source: canvasScore ? "score_canvas" : "row_text_fallback",
      tournament: { name: league },
      homeTeam: { name: teamLinks[0] },
      awayTeam: { name: teamLinks[1] },
      status: {
        type:
          finished
            ? "finished"
            : minuteMatch && !notStarted
            ? "inprogress"
            : halftime
              ? "halftime"
              : "notstarted"
      },
      homeScore: { current: scores[0] ?? 0 },
      awayScore: { current: scores[1] ?? 0 },
      corner_score: capturedCanvasText(row.querySelector(".lier-corner canvas")),
      time: {},
      odds: null,
      raw_text: rowText
    };
  }

  function metricPair(text, label) {
    const match = text.match(
      new RegExp(`(?:^|\\s)(\\d+(?:\\.\\d+)?)\\s*${label}\\s*(\\d+(?:\\.\\d+)?)(?=\\s|$)`)
    );
    return match ? { home: Number(match[1]), away: Number(match[2]) } : null;
  }

  function parseDetail(documentNode) {
    const text = clean(documentNode.body?.innerText);
    const shotMatch = text.match(
      /(?:^|\s)(\d+)\((\d+)\)\s*射门\(射正\)\s*(\d+)\((\d+)\)(?=\s|$)/
    );
    const possessionMatch = text.match(
      /(?:^|\s)(\d+(?:\.\d+)?)%\s*控球率\s*(\d+(?:\.\d+)?)%/
    );
    const statistics = {};
    if (shotMatch) {
      statistics.shots = {
        home: Number(shotMatch[1]),
        away: Number(shotMatch[3])
      };
      statistics.shots_on_target = {
        home: Number(shotMatch[2]),
        away: Number(shotMatch[4])
      };
    }
    if (possessionMatch) {
      statistics.possession = {
        home: Number(possessionMatch[1]),
        away: Number(possessionMatch[2])
      };
    }
    const attacks = metricPair(text, "进攻");
    const dangerous = metricPair(text, "危险进攻");
    const penalties = metricPair(text, "点球");
    if (attacks) statistics.attacks = attacks;
    if (dangerous) statistics.dangerous_attacks = dangerous;
    if (penalties) statistics.penalties = penalties;
    return statistics;
  }

  const NAMI_STAT_TYPES = {
    2: "corners",
    3: "yellow_cards",
    4: "red_cards",
    8: "penalties",
    21: "shots_on_target",
    22: "shots_off_target",
    23: "attacks",
    24: "dangerous_attacks",
    25: "possession"
  };

  function numberPair(home, away) {
    const left = Number(String(home ?? "").replace("%", ""));
    const right = Number(String(away ?? "").replace("%", ""));
    return Number.isFinite(left) && Number.isFinite(right)
      ? { home: left, away: right }
      : null;
  }

  function parseNamiStatistics(apiResult) {
    const statistics = {};
    const rawByEndpoint = {};
    const textTokens = new Set();
    const textRecords = [];
    const numberRecords = [];
    const namedKeys = {
      shots: "shots",
      shot: "shots",
      shots_total: "shots",
      shot_total: "shots",
      shots_on_target: "shots_on_target",
      shot_on_target: "shots_on_target",
      attacks: "attacks",
      attack: "attacks",
      dangerous_attacks: "dangerous_attacks",
      dangerous_attack: "dangerous_attacks",
      possession: "possession",
      ball_possession: "possession",
      corners: "corners",
      corner: "corners",
      penalties: "penalties",
      penalty: "penalties"
    };

    function decodeBase64(value) {
      const binary = atob(value);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return bytes;
    }

    function readableText(bytes) {
      try {
        const value = new TextDecoder("utf-8", { fatal: true })
          .decode(bytes)
          .replace(/\u0000/g, "")
          .trim();
        if (value.length < 2 || value.length > 240) return null;
        const visible = [...value].filter(
          (char) => !/[\u0000-\u0008\u000e-\u001f\u007f]/.test(char)
        ).length;
        return visible / value.length >= 0.92 ? value : null;
      } catch {
        return null;
      }
    }

    function collectProtoText(
      bytes,
      start = 0,
      end = bytes.length,
      depth = 0,
      path = [],
      endpoint = null
    ) {
      if (depth > 12 || start >= end) return;
      let position = start;
      while (position < end) {
        const key = readVarint(bytes, position, end);
        if (!key || !key.value) return;
        position = key.position;
        const field = Math.floor(key.value / 8);
        const wire = key.value % 8;
        if (wire === 0) {
          const item = readVarint(bytes, position, end);
          if (!item) return;
          numberRecords.push({
            endpoint,
            path: [...path, field].join("."),
            value: item.value
          });
          position = item.position;
        } else if (wire === 1) {
          position += 8;
        } else if (wire === 2) {
          const size = readVarint(bytes, position, end);
          if (!size) return;
          position = size.position;
          const nestedEnd = position + size.value;
          if (nestedEnd > end) return;
          const text = readableText(bytes.subarray(position, nestedEnd));
          if (text) {
            textTokens.add(text);
            textRecords.push({
              endpoint,
              path: [...path, field].join("."),
              text
            });
          }
          collectProtoText(
            bytes,
            position,
            nestedEnd,
            depth + 1,
            [...path, field],
            endpoint
          );
          position = nestedEnd;
        } else if (wire === 5) {
          position += 4;
        } else {
          return;
        }
        if (position > end) return;
      }
    }

    function readVarint(bytes, position, limit) {
      let value = 0;
      let shift = 0;
      let cursor = position;
      while (cursor < limit && shift <= 49) {
        const byte = bytes[cursor];
        value += (byte & 0x7f) * 2 ** shift;
        cursor += 1;
        if ((byte & 0x80) === 0) return { value, position: cursor };
        shift += 7;
      }
      return null;
    }

    function scanProtoMessage(bytes, start = 0, end = bytes.length, depth = 0) {
      if (depth > 12 || start >= end) return false;
      const fields = new Map();
      let position = start;
      while (position < end) {
        const key = readVarint(bytes, position, end);
        if (!key || !key.value) return false;
        position = key.position;
        const field = Math.floor(key.value / 8);
        const wire = key.value % 8;
        if (!field || field > 100000) return false;
        if (wire === 0) {
          const item = readVarint(bytes, position, end);
          if (!item) return false;
          position = item.position;
          if (!fields.has(field)) fields.set(field, item.value);
        } else if (wire === 1) {
          position += 8;
        } else if (wire === 2) {
          const size = readVarint(bytes, position, end);
          if (!size) return false;
          position = size.position;
          const nestedEnd = position + size.value;
          if (nestedEnd > end) return false;
          scanProtoMessage(bytes, position, nestedEnd, depth + 1);
          position = nestedEnd;
        } else if (wire === 5) {
          position += 4;
        } else {
          return false;
        }
        if (position > end) return false;
      }
      const type = Number(fields.get(1));
      if (
        NAMI_STAT_TYPES[type] &&
        (fields.has(2) || fields.has(3))
      ) {
        statistics[NAMI_STAT_TYPES[type]] = {
          home: Number(fields.get(2) || 0),
          away: Number(fields.get(3) || 0)
        };
      }
      return position === end;
    }

    function walk(value) {
      if (!value) return;
      if (Array.isArray(value)) {
        if (
          value.length >= 3 &&
          Number.isFinite(Number(value[0])) &&
          NAMI_STAT_TYPES[Number(value[0])]
        ) {
          const pair = numberPair(value[1], value[2]);
          if (pair) statistics[NAMI_STAT_TYPES[Number(value[0])]] = pair;
        }
        for (const item of value) walk(item);
        return;
      }
      if (typeof value === "string") {
        const text = value.trim();
        if (text.length >= 2 && text.length <= 240) textTokens.add(text);
        return;
      }
      if (typeof value !== "object") return;

      const type = Number(value.type ?? value.type_id ?? value.stat_type);
      const typedPair = numberPair(
        value.home ?? value.home_value ?? value.home_num,
        value.away ?? value.away_value ?? value.away_num
      );
      if (NAMI_STAT_TYPES[type] && typedPair) {
        statistics[NAMI_STAT_TYPES[type]] = typedPair;
      }

      for (const [key, item] of Object.entries(value)) {
        const normalized = key.toLowerCase().replace(/[^a-z0-9]+/g, "_");
        const target = namedKeys[normalized];
        if (target && item && typeof item === "object") {
          const pair = numberPair(
            item.home ?? item.home_value ?? item[0],
            item.away ?? item.away_value ?? item[1]
          );
          if (pair) statistics[target] = pair;
        }
        walk(item);
      }
    }

    for (const [endpoint, payload] of Object.entries(
      apiResult?.endpoints || {}
    )) {
      rawByEndpoint[endpoint] = payload;
      const data = payload?.data;
      if (data?.encoding === "base64" && data.body) {
        // `vd` is the live statistics payload. The detail and incident
        // payloads reuse the same protobuf field numbers for unrelated data.
        const bytes = decodeBase64(data.body);
        collectProtoText(bytes, 0, bytes.length, 0, [], endpoint);
        if (endpoint === "vd") scanProtoMessage(bytes);
      } else {
        walk(data);
      }
    }

    // Nami reports shots on/off target separately.
    if (statistics.shots_on_target || statistics.shots_off_target) {
      const onTarget = statistics.shots_on_target || { home: 0, away: 0 };
      const offTarget = statistics.shots_off_target || { home: 0, away: 0 };
      statistics.shots = {
        home: onTarget.home + offTarget.home,
        away: onTarget.away + offTarget.away
      };
    }
    const tokens = [...textTokens]
      .map((value) => value.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const weatherPattern =
      /^(?:晴|阴|多云|局部有云|阵雨|小雨|中雨|大雨|雷阵雨|小雪|中雪|大雪|雨夹雪|多云有雨)$|(?:天气|气温|温度|湿度|风速|风向|降雨)|^-?\d+(?:\.\d+)?\s*(?:°C|℃|m\/s|km\/h|mmHg|hPa|%)$/i;
    const incidentPattern =
      /进球|射门|射正|角球|黄牌|红牌|换人|替补|点球|受伤|伤停|中场|上半场|下半场|(?:^|\s)VAR(?:\s|$)/i;
    const lineupPattern =
      /首发|替补|阵容|阵型|守门员|门将|后卫|中场|前锋|教练|formation|lineup/i;
    const assetPattern =
      /(?:^|\/)[a-f0-9]{24,}\.(?:png|jpe?g|webp)$|football\/|jersey\//i;
    const metricPattern =
      /^-?\d+(?:\.\d+)?(?:%|°C|℃|m\/s|km\/h|mmHg|hPa)?$/i;
    const playerCandidates = tokens.filter((value) => {
      if (assetPattern.test(value) || metricPattern.test(value)) return false;
      if (weatherPattern.test(value) || lineupPattern.test(value)) return false;
      if (value.length < 2 || value.length > 48) return false;
      if (/https?:|足球|杯|联赛|超级|甲级|乙级|女足|U\d+/i.test(value)) {
        return false;
      }
      return /^[\p{L}][\p{L}\p{M} .·'’-]*$/u.test(value);
    });
    return {
      statistics,
      rawByEndpoint,
      context: {
        text_tokens: tokens,
        text_records: textRecords,
        number_records: numberRecords,
        weather_text: tokens.filter((value) => weatherPattern.test(value)),
        live_text: tokens.filter((value) => incidentPattern.test(value)),
        lineup_text: tokens.filter((value) => lineupPattern.test(value)),
        player_candidates: playerCandidates,
        coverage: {
          text_tokens: tokens.length > 0,
          weather: tokens.some((value) => weatherPattern.test(value)),
          live_text: tokens.some((value) => incidentPattern.test(value)),
          lineup: tokens.some((value) => lineupPattern.test(value)),
          player_candidates: playerCandidates.length > 0
        }
      }
    };
  }

  async function collectStatisticsApi(event) {
    return new Promise((resolve) => {
      const frame = document.createElement("iframe");
      frame.src = `https://widget.namitiyu.com/football?id=${encodeURIComponent(
        event.id
      )}`;
      frame.style.cssText =
        "position:fixed;width:2px;height:2px;left:-20px;bottom:-20px;opacity:.01;border:0";
      chrome.runtime.sendMessage(
        {
          type: "CODEX_COLLECT_LIVE_API",
          match_id: event.id
        },
        (response) => {
          frame.remove();
          if (chrome.runtime.lastError) {
            resolve({
              available: false,
              reason: chrome.runtime.lastError.message
            });
            return;
          }
          resolve(response || { available: false, reason: "empty_api_response" });
        }
      );
      document.documentElement.appendChild(frame);
    });
  }

  async function collectDetailApi(event) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: "CODEX_COLLECT_LEISU_DETAIL_API",
          match_id: event.id
        },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({
              available: false,
              reason: chrome.runtime.lastError.message,
              responses: {}
            });
            return;
          }
          resolve(response || {
            available: false,
            reason: "empty_detail_api_response",
            responses: {}
          });
        }
      );
    });
  }

  async function enrichDetailApi(event, index, total) {
    button.textContent = `事件接口 ${index + 1}/${total}`;
    try {
      const result = await collectDetailApi(event);
      event._detail_api_discovery = result;
      const domLive = result?.responses?.["dom:text-live"]?.data?.body;
      if (Array.isArray(domLive?.entries) && domLive.entries.length) {
        event._live_text = {
          available: true,
          source: "leisu_detail_dom",
          captured_at: domLive.captured_at || null,
          entries: domLive.entries
        };
      }
    } catch (error) {
      event._detail_api_discovery = {
        available: false,
        reason: error.message || "detail_api_failed",
        responses: {}
      };
    }
  }

  async function enrichAllDetailApis(events) {
    const detailConcurrency = 5;
    for (let index = 0; index < events.length; index += detailConcurrency) {
      const batch = events.slice(index, index + detailConcurrency);
      await Promise.all(
        batch.map((event, offset) =>
          enrichDetailApi(event, index + offset, events.length)
        )
      );
    }
  }

  async function enrichStatistics(event, index, total) {
    button.textContent = `接口读取 ${index + 1}/${total}`;
    try {
      const apiResult = await collectStatisticsApi(event);
      const parsed = parseNamiStatistics(apiResult);
      event._statistics_api = {
        available: apiResult.available,
        complete: apiResult.complete,
        reason: apiResult.reason || null,
        source: apiResult.source || null,
        endpoints: Object.fromEntries(
          Object.entries(parsed.rawByEndpoint).map(([name, payload]) => [
            name,
            {
              status: payload?.status || 0,
              encoding: payload?.data?.encoding || "json",
              size: payload?.data?.body?.length || 0
            }
          ])
        )
      };
      event._detail_context = parsed.context;
      event._weather = {
        available: parsed.context.coverage.weather,
        text: parsed.context.weather_text
      };
      event._live_text = {
        available: parsed.context.coverage.live_text,
        entries: parsed.context.live_text
      };
      const recordsAt = (path) =>
        parsed.context.text_records
          .filter((item) => item.path === path)
          .map((item) => item.text);
      const numbersAt = (path) =>
        parsed.context.number_records
          .filter((item) => item.path === path)
          .map((item) => Number(item.value));
      const uniqueNames = (items) =>
        [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))];
      const matchHomePlayers = uniqueNames(recordsAt("2.7.1.10"));
      const matchAwayPlayers = uniqueNames(recordsAt("2.7.2.10"));
      const squadHomePlayers = uniqueNames(recordsAt("2.11.2"));
      const squadAwayPlayers = uniqueNames(recordsAt("2.12.2"));
      const hasMatchLineup =
        matchHomePlayers.length >= 7 && matchAwayPlayers.length >= 7;
      const structuredPlayers = (side, names) => {
        const ids = numbersAt(`2.7.${side}.1`).slice(0, names.length);
        const shirts = numbersAt(`2.7.${side}.3`).slice(0, names.length);
        const x = numbersAt(`2.7.${side}.6`).slice(0, 11);
        const y = numbersAt(`2.7.${side}.7`).slice(0, 11);
        return names.map((name, index) => ({
          id: ids[index] || null,
          name,
          shirt_number: shirts[index] ?? null,
          starter: index < 11,
          substitute: index >= 11,
          formation_coordinate:
            index < 11 && x[index] != null && y[index] != null
              ? { x: x[index], y: y[index] }
              : null
        }));
      };
      const homeStructured = hasMatchLineup
        ? structuredPlayers(1, matchHomePlayers)
        : [];
      const awayStructured = hasMatchLineup
        ? structuredPlayers(2, matchAwayPlayers)
        : [];
      event._lineups = {
        available: hasMatchLineup,
        source: hasMatchLineup ? "namitiyu_api_match_lineup" : "namitiyu_api_squad",
        home: {
          team: event.homeTeam?.name || null,
          players: hasMatchLineup ? homeStructured : squadHomePlayers,
          starters: homeStructured.filter((item) => item.starter),
          substitutes: homeStructured.filter((item) => item.substitute)
        },
        away: {
          team: event.awayTeam?.name || null,
          players: hasMatchLineup ? awayStructured : squadAwayPlayers,
          starters: awayStructured.filter((item) => item.starter),
          substitutes: awayStructured.filter((item) => item.substitute)
        },
        entries: parsed.context.lineup_text,
        status: hasMatchLineup
          ? "home_away_mapped_role_mapping_pending"
          : squadHomePlayers.length || squadAwayPlayers.length
            ? "squad_only_no_confirmed_match_lineup"
            : "not_published_or_not_exposed"
      };
      event._player_candidates = {
        available: parsed.context.coverage.player_candidates,
        names: parsed.context.player_candidates,
        status: parsed.context.coverage.player_candidates
          ? "api_players_detected_needs_home_away_role_mapping"
          : "not_published_or_not_exposed"
      };
      if (Object.keys(parsed.statistics).length) {
        event._statistics = parsed.statistics;
        event._statistics_source = "namitiyu_api";
        return;
      }
    } catch (error) {
      event._statistics_api = {
        available: false,
        reason: error.message || "api_failed"
      };
    }
    event._statistics ||= {};
    event._statistics_source = "namitiyu_api_unavailable";
  }

  async function enrichDetail(event, index, total) {
    button.textContent = `读取详情 ${index + 1}/${total}`;
    const frame = document.createElement("iframe");
    frame.src = event.detail_url;
    frame.style.cssText =
      "position:fixed;width:2px;height:2px;left:-20px;bottom:-20px;opacity:.01;border:0";
    document.documentElement.appendChild(frame);
    try {
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 4000);
        frame.addEventListener(
          "load",
          () => {
            const started = Date.now();
            const poll = setInterval(() => {
              try {
                const bodyText = frame.contentDocument?.body?.innerText || "";
                if (
                  bodyText.includes("射门(射正)") ||
                  Date.now() - started > 3000
                ) {
                  clearInterval(poll);
                  clearTimeout(timeout);
                  resolve();
                }
              } catch {
                clearInterval(poll);
                clearTimeout(timeout);
                resolve();
              }
            }, 200);
          },
          { once: true }
        );
      });
      event._statistics = parseDetail(frame.contentDocument);
    } catch {
      event._statistics = {};
    } finally {
      frame.remove();
    }
  }

  function loadHistory() {
    try {
      const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function metricDelta(current, previous) {
    const output = {};
    for (const key of [
      "shots",
      "shots_on_target",
      "attacks",
      "dangerous_attacks",
      "penalties"
    ]) {
      if (!current[key] || !previous[key]) continue;
      const home = current[key].home - previous[key].home;
      const away = current[key].away - previous[key].away;
      if (home < 0 || away < 0) return null;
      output[key] = { home, away };
    }
    return output;
  }

  function attachTrends(events, history, now) {
    for (const event of events) {
      const snapshots = history.filter((item) => item.id === event.id);
      const trends = {};
      for (const minutes of [5, 15]) {
        const target = now - minutes * 60 * 1000;
        const prior = snapshots
          .filter((item) => item.timestamp <= target)
          .sort((a, b) => b.timestamp - a.timestamp)[0];
        const activeMinutes =
          prior && Number.isFinite(event._minute) && Number.isFinite(prior.minute)
            ? event._minute - prior.minute
            : 0;
        const hasEnoughActivePlay = activeMinutes >= Math.max(1, minutes - 2);
        const delta =
          prior && hasEnoughActivePlay
            ? metricDelta(event._statistics, prior.statistics)
            : {};
        trends[`last_${minutes}_minutes`] =
          prior && hasEnoughActivePlay && delta && Object.keys(delta).length
            ? {
                available: true,
                baseline_timestamp: prior.timestamp,
                ...delta
              }
            : {
                available: false,
                reason: !prior
                  ? "no_baseline"
                  : !hasEnoughActivePlay
                    ? "insufficient_active_play"
                    : "statistics_regressed"
              };
      }
      event._recent_trends = trends;
    }
  }

  function saveHistory(events, history, now) {
    const cutoff = now - 3 * 60 * 60 * 1000;
    const retained = history.filter((item) => item.timestamp >= cutoff);
    for (const event of events) {
      retained.push({
        id: event.id,
        timestamp: now,
        minute: event._minute,
        score: {
          home: event.homeScore.current,
          away: event.awayScore.current
        },
        statistics: event._statistics
      });
    }
    localStorage.setItem(HISTORY_KEY, JSON.stringify(retained.slice(-1200)));
  }

  function candidateRows() {
    const rows = new Set(document.querySelectorAll(".dd-item.data"));
    const anchors = document.querySelectorAll(
      [
        'a[href*="/detail-"]',
        'a[href*="/data/zuqiu/team-"]',
        'a[href*="/team-"]'
      ].join(",")
    );
    for (const anchor of anchors) {
      const row = anchor.closest(
        [
          ".dd-item",
          "tr",
          "li",
          '[class*="match-item"]',
          '[class*="event-item"]',
          '[class*="list-item"]'
        ].join(",")
      );
      if (row) rows.add(row);
    }
    return [...rows];
  }

  async function collect(mode, shouldDownload, includeOddsDetails = false) {
    if (collecting) return;
    collecting = true;
    const collectionStartedAt = Date.now();
    const rows = candidateRows();
    const byId = new Map();
    const rowById = new Map();
    const unparsedRows = [];
    for (const row of rows) {
      const event = parseRow(row);
      if (event) {
        byId.set(event.id, event);
        rowById.set(event.id, row);
      } else {
        unparsedRows.push({
          text: clean(row.innerText || row.textContent),
          html: row.outerHTML.slice(0, 16000)
        });
      }
    }
    const events = [...byId.values()].filter((event) => {
      const value = [
        event.tournament?.name,
        event.homeTeam?.name,
        event.awayTeam?.name
      ]
        .filter(Boolean)
        .join(" ");
      return !value.includes("梦幻对垒")
        && !value.includes("瓦尔哈拉杯")
        && !value.includes("开云")
        && !/(?:^|\s)VS\s*[-－]/i.test(value)
        && !/(?:^|\D)(?:8|10|12)分钟(?:\D|$)/.test(value);
    });
    const selectedEvents = events.filter((event) =>
      mode === "live"
        ? ["inprogress", "halftime"].includes(event.status.type)
        : event.status.type === "notstarted"
    );
    if (!selectedEvents.length) {
      button.textContent = "未发现比赛";
      collecting = false;
      return;
    }
    button.textContent = "正在读取赔率…";
    for (const event of selectedEvents) {
      event.odds = await captureOdds(rowById.get(event.id));
    }
    const liveEvents = mode === "live" ? selectedEvents : [];
    const detailEvents = mode === "prematch" ? selectedEvents : liveEvents;
    if (shouldDownload && mode === "live" && includeOddsDetails) {
      await Promise.all([
        enrichAllOddsDetails(liveEvents),
        enrichAllStatistics(liveEvents),
        enrichAllDetailApis(liveEvents)
      ]);
    } else if (mode === "live" && shouldDownload) {
      await Promise.all([
        enrichAllStatistics(liveEvents),
        enrichAllDetailApis(liveEvents)
      ]);
    } else if (mode === "live") {
      await enrichAllStatistics(liveEvents);
    } else if (mode === "prematch" && shouldDownload) {
      await Promise.all([
        enrichAllStatistics(detailEvents),
        enrichAllDetailApis(detailEvents)
      ]);
    }
    const now = Date.now();
    const history = loadHistory();
    attachTrends(liveEvents, history, now);
    saveHistory(liveEvents, history, now);
    if (shouldDownload) {
      const exportEvents = mode === "prematch" ? events : selectedEvents;
      download({
        schema_version: 2,
        provider: "leisu",
        export_mode: mode,
        export_profile:
          mode === "live"
            ? includeOddsDetails
              ? "full"
              : "fast"
            : "prematch",
        collection_started_at: new Date(collectionStartedAt).toISOString(),
        captured_at: new Date(now).toISOString(),
        collection_duration_seconds: Number(
          ((now - collectionStartedAt) / 1000).toFixed(1)
        ),
        count: exportEvents.length,
        prematch_count: mode === "prematch" ? selectedEvents.length : 0,
        live_count: liveEvents.length,
        candidate_row_count: rows.length,
        unparsed_count: unparsedRows.length,
        unparsed_rows: unparsedRows,
        events: exportEvents
      }, mode);
      button.textContent = `已导出${events.length}场`;
    } else {
      button.textContent = `监控中：${liveEvents.length}场`;
    }
    collecting = false;
    setTimeout(() => {
      button.textContent = "导出雷速实时数据";
    }, 3000);
  }

  const collectLive = (shouldDownload, includeOddsDetails = false) =>
    collect("live", shouldDownload, includeOddsDetails);
  const exportLive = () => collectLive(true, false);
  const exportFullLive = () => collectLive(true, true);
  const exportPrematch = () => collect("prematch", true);

  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.textContent = "极速导出雷速滚球";
  button.style.cssText = [
    "position:fixed",
    "right:18px",
    "bottom:18px",
    "z-index:2147483647",
    "padding:10px 14px",
    "border:0",
    "border-radius:8px",
    "background:#1677ff",
    "color:#fff",
    "font-weight:700",
    "cursor:pointer",
    "box-shadow:0 4px 16px rgba(0,0,0,.28)"
  ].join(";");
  button.addEventListener("click", exportLive);
  button.textContent = "极速导出雷速滚球";

  const fullLiveButton = document.createElement("button");
  fullLiveButton.id = FULL_LIVE_BUTTON_ID;
  fullLiveButton.type = "button";
  fullLiveButton.textContent = "完整导出雷速滚球";
  fullLiveButton.style.cssText = [
    "position:fixed",
    "right:18px",
    "bottom:66px",
    "z-index:2147483647",
    "padding:10px 14px",
    "border:0",
    "border-radius:8px",
    "background:#6f42c1",
    "color:#fff",
    "font-weight:700",
    "cursor:pointer",
    "box-shadow:0 4px 16px rgba(0,0,0,.28)"
  ].join(";");
  fullLiveButton.addEventListener("click", exportFullLive);

  const prematchButton = document.createElement("button");
  prematchButton.id = PREMATCH_BUTTON_ID;
  prematchButton.type = "button";
  prematchButton.textContent = "导出雷速非滚球数据";
  prematchButton.style.cssText = [
    "position:fixed",
    "right:18px",
    "bottom:114px",
    "z-index:2147483647",
    "padding:10px 14px",
    "border:0",
    "border-radius:8px",
    "background:#0f9d58",
    "color:#fff",
    "font-weight:700",
    "cursor:pointer",
    "box-shadow:0 4px 16px rgba(0,0,0,.28)"
  ].join(";");
  prematchButton.addEventListener("click", exportPrematch);

  if (!document.getElementById(BUTTON_ID)) {
    document.documentElement.appendChild(button);
  }
  if (!document.getElementById(FULL_LIVE_BUTTON_ID)) {
    document.documentElement.appendChild(fullLiveButton);
  }
  if (!document.getElementById(PREMATCH_BUTTON_ID)) {
    document.documentElement.appendChild(prematchButton);
  }
  // API collection is lightweight, so keep snapshots warm in the background.
  // This lets an export calculate 5/15-minute trends immediately from history
  // without repeatedly opening full Leisu detail pages.
  const AUTO_SNAPSHOT_INTERVAL = 2 * 60 * 1000;
  setTimeout(() => collectLive(false, false), 15000);
  setInterval(() => collectLive(false, false), AUTO_SNAPSHOT_INTERVAL);
})();
