/*
 * YBTY rendered-DOM extractor.
 *
 * Run this function inside the sportsbook iframe. The caller is responsible
 * for scrolling the virtual list and merging matches by league/home/away.
 * It reads rendered fields only and never accesses credentials or storage.
 */
function extractYbtyVisible(documentRoot = document) {
  let league = "";
  const matches = [];
  const marketNames = [
    "full_h2h",
    "full_spread",
    "full_total",
    "half_h2h",
    "half_spread",
    "half_total",
  ];

  const nodes = Array.from(
    documentRoot.querySelectorAll(".play-match-league, .c-match-item"),
  );

  for (const node of nodes) {
    if (node.matches(".play-match-league")) {
      league = (node.textContent || "").trim().replace(/\d+\s*$/, "").trim();
      continue;
    }

    const teams = Array.from(node.querySelectorAll(".team-name"));
    if (teams.length < 2) continue;

    const scores = Array.from(node.querySelectorAll(".score"));
    const redCards = Array.from(node.querySelectorAll(".red-ball"));
    const basic = node.querySelector(".basic-col") || node;
    const basicTexts = Array.from(basic.querySelectorAll("*")).map(
      (element) => (element.textContent || "").trim(),
    );
    const period =
      basicTexts.find((text) =>
        ["上半场", "下半场", "中场休息", "加时赛", "点球"].includes(text),
      ) || null;

    const markets = Array.from(node.querySelectorAll(".handicap-col")).map(
      (column, index) => ({
        market: marketNames[index % marketNames.length],
        line_index: Math.floor(index / marketNames.length),
        options: Array.from(column.querySelectorAll(".c-bet-item")).map(
          (cell) => ({
            text: (cell.textContent || "").trim(),
            selection: (
              cell.querySelector(".handicap-value-text")?.textContent || ""
            ).trim(),
            odds: (
              cell.querySelector(".highlight-odds")?.textContent || ""
            ).trim(),
            suspended: cell.classList.contains("empty"),
          }),
        ),
      }),
    );

    matches.push({
      league,
      home: (teams[0].textContent || "").trim(),
      away: (teams[1].textContent || "").trim(),
      home_score: scores[0] ? (scores[0].textContent || "").trim() : null,
      away_score: scores[1] ? (scores[1].textContent || "").trim() : null,
      home_red: redCards[0] ? (redCards[0].textContent || "").trim() : null,
      away_red: redCards[1] ? (redCards[1].textContent || "").trim() : null,
      period,
      clock:
        (node.querySelector(".timer-layout2")?.textContent || "").trim() || null,
      play_count:
        (node.querySelector(".play-count")?.textContent || "").trim() || null,
      markets,
    });
  }

  return {
    captured_at: new Date().toISOString(),
    count: matches.length,
    matches,
  };
}

