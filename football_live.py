#!/usr/bin/env python3
"""SofaScore live football collector and local odds-event matcher."""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

API = "https://www.sofascore.com/api/v1"
API_FALLBACKS = (
    "https://www.sofascore.com/api/v1",
    "https://api.sofascore.com/api/v1",
)
ESPN_LIVE = "https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard"
USER_AGENT = "Mozilla/5.0 (compatible; FootballLiveCollector/1.0)"


@dataclass
class MarketMatch:
    source_file: str
    source_match_id: str
    league: str
    home: str
    away: str
    commence_time: str | None
    captured_at: str | None
    markets: Any
    home_score: str | int | None = None
    away_score: str | int | None = None
    clock: str | None = None


def derive_commence_time(
    commence_time: str | None,
    clock: str | None,
    captured_at: str | None,
) -> str | None:
    """Return an ISO kickoff time, deriving YBTY relative countdowns when needed."""
    if commence_time:
        return str(commence_time)
    clock_text = str(clock or "").strip()
    captured_text = str(captured_at or "").strip()
    if not clock_text or not captured_text:
        return None
    try:
        captured = datetime.fromisoformat(captured_text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if captured.tzinfo is None:
        captured = captured.replace(tzinfo=timezone.utc)
    hours_match = re.search(r"(\d+)\s*小时", clock_text)
    minutes_match = re.search(r"(\d+)\s*分钟", clock_text)
    if "后开赛" not in clock_text or not (hours_match or minutes_match):
        return None
    hours = int(hours_match.group(1)) if hours_match else 0
    minutes = int(minutes_match.group(1)) if minutes_match else 0
    kickoff = captured + timedelta(hours=hours, minutes=minutes)
    return kickoff.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def is_excluded_electronic_match(league: str, home: str, away: str) -> bool:
    value = " ".join((league or "", home or "", away or ""))
    return (
        "梦幻对垒" in value
        or "瓦尔哈拉杯" in value
        or "开云" in value
        or bool(re.search(r"(?:^|\s)VS\s*[-－]", value, re.I))
        or bool(re.search(r"(?:^|\D)(?:8|10|12)分钟(?:\D|$)", value))
    )


def fetch_json(url: str, timeout: int = 15) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def fetch_api(path: str, timeout: int = 15) -> dict[str, Any]:
    errors: list[str] = []
    for base in API_FALLBACKS:
        try:
            return fetch_json(f"{base}/{path.lstrip('/')}", timeout)
        except (OSError, ValueError, urllib.error.URLError) as exc:
            errors.append(f"{base}: {exc}")
    raise urllib.error.URLError("; ".join(errors))


def espn_statistics(competitors: list[dict[str, Any]]) -> dict[str, Any]:
    names = {
        "totalShots": "shots",
        "shotsOnTarget": "shots_on_target",
        "possessionPct": "possession",
        "wonCorners": "corners",
        "yellowCards": "yellow_cards",
        "redCards": "red_cards",
    }
    result: dict[str, Any] = {}
    sides = {item.get("homeAway"): item for item in competitors}
    for side in ("home", "away"):
        for item in sides.get(side, {}).get("statistics", []):
            key = names.get(item.get("name"))
            if key:
                result.setdefault(key, {})[side] = item.get("displayValue")
    return result


def normalize_espn(payload: dict[str, Any]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for raw in payload.get("events", []):
        competition = (raw.get("competitions") or [{}])[0]
        competitors = competition.get("competitors", [])
        sides = {item.get("homeAway"): item for item in competitors}
        if "home" not in sides or "away" not in sides:
            continue
        status = competition.get("status") or raw.get("status") or {}
        state = status.get("type", {}).get("state")
        detail = status.get("type", {}).get("detail", "")
        status_type = (
            "halftime" if "Half" in detail
            else "inprogress" if state == "in"
            else "finished" if state == "post"
            else "notstarted"
        )
        clock = status.get("clock")
        minute = int(float(clock) // 60) if clock is not None else None
        incidents = []
        for item in competition.get("details", []):
            incidents.append(
                {
                    "incidentType": item.get("type", {}).get("text"),
                    "incidentClass": "red" if item.get("redCard") else None,
                    "yellowCard": bool(item.get("yellowCard")),
                    "isGoal": bool(item.get("scoringPlay")),
                    "time": item.get("clock", {}).get("displayValue"),
                    "teamId": item.get("team", {}).get("id"),
                }
            )
        output.append(
            {
                "id": raw.get("id"),
                "_provider": "espn",
                "_minute": minute,
                "_statistics": espn_statistics(competitors),
                "_incidents": incidents,
                "startTimestamp": parse_timestamp(raw.get("date")),
                "tournament": {"name": competition.get("altGameNote") or raw.get("season", {}).get("slug")},
                "homeTeam": {
                    "name": sides["home"].get("team", {}).get("displayName"),
                    "id": sides["home"].get("id"),
                },
                "awayTeam": {
                    "name": sides["away"].get("team", {}).get("displayName"),
                    "id": sides["away"].get("id"),
                },
                "status": {"type": status_type},
                "homeScore": {"current": int(sides["home"].get("score") or 0)},
                "awayScore": {"current": int(sides["away"].get("score") or 0)},
                "time": {},
            }
        )
    return output


def repair_leisu_event(event: dict[str, Any]) -> dict[str, Any]:
    if event.get("_provider") != "leisu" or not event.get("raw_text"):
        return event
    raw = str(event["raw_text"])
    home = str(event.get("homeTeam", {}).get("name") or "")
    away = str(event.get("awayTeam", {}).get("name") or "")
    canvas_score_text = str(
        event.get("_row_score_text") or event.get("_row_canvas_text") or ""
    )
    canvas_score = re.search(r"(?<!\d)(\d{1,2})\s*-\s*(\d{1,2})(?!\d)", canvas_score_text)
    if canvas_score:
        event["homeScore"] = {"current": int(canvas_score.group(1))}
        event["awayScore"] = {"current": int(canvas_score.group(2))}
        event["_score_source"] = "score_canvas"
    else:
        home_index = raw.find(home)
        away_index = raw.find(away, home_index + len(home))
        if home_index < 0 or away_index < 0:
            return event

        standalone = re.compile(r"(?:^|\s)(\d{1,2})(?=\s|$)")
        before_home = raw[:home_index]
        after_away = raw[away_index + len(away):].split("数据", 1)[0]
        home_numbers = [int(value) for value in standalone.findall(before_home)]
        away_numbers = [int(value) for value in standalone.findall(after_away)]
        event["homeScore"] = {"current": home_numbers[-1] if home_numbers else 0}
        event["awayScore"] = {"current": away_numbers[0] if away_numbers else 0}
        event["_score_source"] = "row_text_fallback"
    reconcile_leisu_text_live_score(event)
    if (
        event.get("_minute") is None
        and event.get("status", {}).get("type") not in {"halftime", "finished"}
    ):
        event["status"] = {"type": "notstarted"}
    normalize_leisu_odds_detail(event)
    return event


def reconcile_leisu_text_live_score(event: dict[str, Any]) -> None:
    """Correct stale list-row scores from named official text-live goal events.

    Leisu's list view occasionally leaves its canvas score at 0-0 while the
    corresponding detail page and live odds have already updated.  A named
    goal entry in the detail timeline is more specific than that stale canvas,
    so use it only when every detected goal can be attributed to one side.
    """
    entries = ((event.get("_live_text") or {}).get("entries") or [])
    home = str(event.get("homeTeam", {}).get("name") or "")
    away = str(event.get("awayTeam", {}).get("name") or "")
    if not entries or not home or not away:
        return

    def variants(name: str) -> list[str]:
        compact = re.sub(r"[（(].*?[）)]", "", name).strip()
        return [value for value in {name, compact} if len(value) >= 2]

    home_names, away_names = variants(home), variants(away)
    goal_pattern = re.compile(r"第\d+个进球|球进啦|gooooo+al|破门|乌龙球", re.I)
    home_goals = away_goals = unknown_goals = 0
    goal_entries: list[str] = []
    for entry in entries:
        text = str(entry).replace("\u00a0", " ").strip()
        if not goal_pattern.search(text):
            continue
        has_home = any(name in text for name in home_names)
        has_away = any(name in text for name in away_names)
        if has_home and not has_away:
            home_goals += 1
            goal_entries.append(text)
        elif has_away and not has_home:
            away_goals += 1
            goal_entries.append(text)
        else:
            unknown_goals += 1

    if not goal_entries or unknown_goals:
        return
    list_score = {
        "home": int(event.get("homeScore", {}).get("current") or 0),
        "away": int(event.get("awayScore", {}).get("current") or 0),
    }
    text_score = {"home": home_goals, "away": away_goals}
    event["_score_validation"] = {
        "list_score": list_score,
        "text_live_score": text_score,
        "goal_entries": goal_entries,
        "source": "leisu_text_live",
        "corrected": list_score != text_score,
    }
    if list_score != text_score:
        event["homeScore"] = {"current": home_goals}
        event["awayScore"] = {"current": away_goals}


def normalize_leisu_odds_detail(event: dict[str, Any]) -> None:
    odds = event.get("odds")
    if not isinstance(odds, dict):
        return
    detail = odds.get("detail")
    if not isinstance(detail, dict):
        return
    normalized = detail.get("normalized")
    if not detail.get("available") or (
        isinstance(normalized, dict) and normalized.get("companies")
    ):
        return

    def values(cell: dict[str, Any]) -> list[str | None]:
        return [
            canvas.get("text") or None
            for canvas in cell.get("canvases", [])
        ]

    def triplet(
        items: list[str | None], offset: int, labels: tuple[str, str, str]
    ) -> dict[str, str | None]:
        return {
            label: items[offset + index] if offset + index < len(items) else None
            for index, label in enumerate(labels)
        }

    companies: list[dict[str, Any]] = []
    for row in detail.get("rows", [])[1:]:
        cells = row.get("cells", [])
        if len(cells) < 5:
            continue
        company_values = values(cells[1])
        company = (company_values[0] if company_values else None) or cells[1].get("text")
        if not company:
            continue
        handicap, winner, totals = values(cells[2]), values(cells[3]), values(cells[4])
        companies.append(
            {
                "company": company,
                "asian_handicap": {
                    "opening": triplet(handicap, 0, ("home", "line", "away")),
                    "current": triplet(handicap, 3, ("home", "line", "away")),
                },
                "match_winner": {
                    "opening": triplet(winner, 0, ("home", "draw", "away")),
                    "current": triplet(winner, 3, ("home", "draw", "away")),
                },
                "total_goals": {
                    "opening": triplet(totals, 0, ("over", "line", "under")),
                    "current": triplet(totals, 3, ("over", "line", "under")),
                },
            }
        )
    detail["normalized"] = {
        "companies": companies,
        "phases": {
            "opening": "页面每个市场的前三项",
            "current": "页面每个市场的后三项",
        },
        "unavailable_markets": ["corners", "pre_match_closing"],
    }


def collect_live(provider: str) -> tuple[str, list[dict[str, Any]], list[str]]:
    errors: list[str] = []
    if provider in {"auto", "sofascore"}:
        try:
            payload = fetch_api("sport/football/events/live")
            return "sofascore", payload.get("events", []), errors
        except Exception as exc:
            errors.append(f"SofaScore: {exc}")
            if provider == "sofascore":
                raise
    if provider in {"auto", "espn"}:
        try:
            return "espn", normalize_espn(fetch_json(ESPN_LIVE)), errors
        except Exception as exc:
            errors.append(f"ESPN: {exc}")
            raise urllib.error.URLError("; ".join(errors))
    raise ValueError(f"Unsupported provider: {provider}")


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).casefold()
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.replace("&", " and ")
    value = re.sub(r"\b(fc|cf|sc|afc|club|fk|sk|ac|cd|deportivo)\b", " ", value)
    return re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "", value)


def repair_mojibake(value: str) -> str:
    if not isinstance(value, str):
        return value
    try:
        repaired = value.encode("latin-1").decode("utf-8")
        return repaired if repaired != value else value
    except (UnicodeEncodeError, UnicodeDecodeError):
        return value


def team_score(left: str, right: str, aliases: dict[str, str]) -> float:
    nl, nr = normalize(left), normalize(right)
    nl, nr = aliases.get(nl, nl), aliases.get(nr, nr)
    if not nl or not nr:
        return 0.0
    if nl == nr:
        return 1.0
    containment = min(len(nl), len(nr)) / max(len(nl), len(nr)) if nl in nr or nr in nl else 0
    return max(SequenceMatcher(None, nl, nr).ratio(), containment)


def parse_timestamp(value: str | None) -> int | None:
    if not value:
        return None
    try:
        return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp())
    except ValueError:
        return None


def score_value(value: Any) -> int | None:
    if value is None or str(value).strip() == "":
        return None
    match = re.search(r"\d+", str(value))
    return int(match.group()) if match else None


def authoritative_match_state(
    market: MarketMatch, event: dict[str, Any], mode: str
) -> dict[str, Any]:
    """Prefer YBTY state, with a reliable provider-score fallback."""
    ybty_home_score = score_value(market.home_score)
    ybty_away_score = score_value(market.away_score)
    ybty_minute = elapsed_minute(market.clock) if mode == "live" else None
    provider_score_source = event.get("_score_source") or (
        "provider_api" if event.get("_provider") != "leisu" else None
    )
    provider_score = {
        "home": score_value(event.get("homeScore", {}).get("current")),
        "away": score_value(event.get("awayScore", {}).get("current")),
    }
    ybty_score_complete = None not in (ybty_home_score, ybty_away_score)
    provider_score_reliable = (
        None not in (provider_score["home"], provider_score["away"])
        and (
            event.get("_provider") != "leisu"
            or provider_score_source in {"score_canvas", "leisu_text_live"}
        )
    )
    if ybty_score_complete:
        selected_score = {"home": ybty_home_score, "away": ybty_away_score}
        selected_score_source = "ybty_market"
    elif provider_score_reliable:
        selected_score = provider_score
        selected_score_source = provider_score_source
    else:
        selected_score = {"home": None, "away": None}
        selected_score_source = None
    provider_minute = event_minute(event, int(time.time())) if mode == "live" else None
    return {
        "minute": ybty_minute,
        "score": selected_score,
        "score_source": selected_score_source,
        "start_time": market.commence_time,
        "state_source": {
            "minute": "ybty",
            "score": "ybty" if selected_score_source == "ybty_market" else "provider",
            "start_time": "ybty",
        },
        "provider_state": {
            "minute": provider_minute,
            "score": provider_score,
            "score_source": provider_score_source,
            "start_time": event.get("_start_time_text"),
        },
    }


def time_of_day(value: Any) -> int | None:
    if not value:
        return None
    match = re.search(r"\b([01]?\d|2[0-3]):([0-5]\d)\b", str(value))
    if not match:
        return None
    return int(match.group(1)) * 60 + int(match.group(2))


def elapsed_minute(value: Any) -> int | None:
    """Read an in-play clock such as 51:47 without treating it as wall time."""
    if not value:
        return None
    match = re.search(r"(?<!\d)(\d{1,3}):[0-5]\d(?!\d)", str(value))
    if not match:
        return None
    minute = int(match.group(1))
    return minute if 0 <= minute <= 130 else None


def contextual_match_score(
    name_score: float,
    market: MarketMatch,
    event: dict[str, Any],
    reverse: bool = False,
) -> float:
    """Prioritize exact score and start time whenever both sources provide them."""
    score = name_score
    source_home = score_value(market.home_score)
    source_away = score_value(market.away_score)
    event_home = score_value(event.get("homeScore", {}).get("current"))
    event_away = score_value(event.get("awayScore", {}).get("current"))
    if reverse:
        event_home, event_away = event_away, event_home
    if None not in (source_home, source_away, event_home, event_away):
        if source_home == event_home and source_away == event_away:
            score += 0.22
        else:
            score_delta = abs(source_home - event_home) + abs(source_away - event_away)
            if name_score >= 0.95 and score_delta <= 2:
                score -= 0.10
            else:
                score -= 0.25

    source_minute = elapsed_minute(market.clock)
    event_minute_value = event.get("_minute")
    if source_minute is not None and event_minute_value is not None:
        minute_gap = abs(source_minute - int(event_minute_value))
        if minute_gap <= 3:
            score += 0.10
        elif minute_gap <= 8:
            score += 0.05
        elif minute_gap > 20:
            score -= 0.15

    source_start = parse_timestamp(market.commence_time)
    event_start = event.get("startTimestamp")
    if source_start and event_start:
        gap = abs(source_start - int(event_start))
        if gap <= 10 * 60:
            score += 0.20
        elif gap <= 30 * 60:
            score += 0.10
        elif gap > 90 * 60:
            score -= 0.35
    else:
        source_clock = time_of_day(market.commence_time or market.clock)
        event_clock = time_of_day(event.get("_start_time_text"))
        if source_clock is not None and event_clock is not None:
            gap_minutes = abs(source_clock - event_clock)
            gap_minutes = min(gap_minutes, 24 * 60 - gap_minutes)
            if gap_minutes <= 5:
                score += 0.20
            elif gap_minutes <= 20:
                score += 0.10
            elif gap_minutes > 60:
                score -= 0.30
    return max(0.0, min(1.0, score))


def load_aliases(path: Path | None) -> dict[str, str]:
    if not path or not path.exists():
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    aliases: dict[str, str] = {}
    for canonical, variants in raw.items():
        key = normalize(canonical)
        aliases[key] = key
        for variant in variants:
            aliases[normalize(variant)] = key
    return aliases


def merge_alias_files(*paths: Path | None) -> dict[str, str]:
    merged: dict[str, str] = {}
    for path in paths:
        merged.update(load_aliases(path))
    return merged


def infer_auto_aliases(
    markets: list[MarketMatch],
    events: list[dict[str, Any]],
    aliases: dict[str, str],
    used_event_ids: set[str],
    output_path: Path,
) -> int:
    """Learn only high-confidence aliases from reciprocal one-to-one pairs."""
    available = [
        event for event in events if str(event.get("id")) not in used_event_ids
    ]
    proposals: list[tuple[MarketMatch, dict[str, Any], float, float, float]] = []
    for market in markets:
        ranked: list[tuple[float, float, float, dict[str, Any]]] = []
        for event in available:
            home_score = team_score(
                market.home, event.get("homeTeam", {}).get("name", ""), aliases
            )
            away_score = team_score(
                market.away, event.get("awayTeam", {}).get("name", ""), aliases
            )
            pair_score = contextual_match_score(
                (home_score + away_score) / 2, market, event
            )
            ranked.append(
                (pair_score, home_score, away_score, event)
            )
        ranked.sort(key=lambda item: item[0], reverse=True)
        if not ranked:
            continue
        best = ranked[0]
        margin = best[0] - (ranked[1][0] if len(ranked) > 1 else 0)
        anchored = max(best[1], best[2]) >= 0.92
        both_similar = min(best[1], best[2]) >= 0.45 and best[0] >= 0.58
        if margin >= 0.15 and (anchored or both_similar):
            proposals.append((market, best[3], best[1], best[2], best[0]))

    # An event must also choose this market as its strongest proposal.
    best_for_event: dict[str, tuple[MarketMatch, float]] = {}
    for market, event, _, _, pair_score in proposals:
        event_id = str(event.get("id"))
        existing = best_for_event.get(event_id)
        if not existing or pair_score > existing[1]:
            best_for_event[event_id] = (market, pair_score)

    try:
        stored = json.loads(output_path.read_text(encoding="utf-8"))
        if not isinstance(stored, dict):
            stored = {}
    except (OSError, ValueError):
        stored = {}
    added = 0
    for market, event, home_score, away_score, _ in proposals:
        selected = best_for_event.get(str(event.get("id")))
        if not selected or selected[0] is not market:
            continue
        for source_name, reference_name, score in (
            (market.home, event.get("homeTeam", {}).get("name", ""), home_score),
            (market.away, event.get("awayTeam", {}).get("name", ""), away_score),
        ):
            if not source_name or not reference_name or score >= 0.98:
                continue
            variants = stored.setdefault(reference_name, [])
            if source_name not in variants:
                variants.append(source_name)
                added += 1
    if added:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(stored, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    return added


def extract_markets(path: Path) -> list[MarketMatch]:
    if path.suffix.casefold() in {".txt", ".csv"}:
        return extract_text_markets(path)
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    rows = data if isinstance(data, list) else data.get("matches", data.get("events", []))
    captured_at = None if isinstance(data, list) else data.get("captured_at")
    output: list[MarketMatch] = []
    for index, row in enumerate(rows):
        teams = row.get("teams") or {}
        home = teams.get("home") or row.get("home_team") or row.get("home")
        away = teams.get("away") or row.get("away_team") or row.get("away")
        if not home or not away:
            continue
        league = repair_mojibake(str(row.get("league_title") or row.get("league") or ""))
        home = repair_mojibake(str(home))
        away = repair_mojibake(str(away))
        if is_excluded_electronic_match(league, home, away):
            continue
        row_captured_at = row.get("captured_at") or captured_at
        row_clock = row.get("clock")
        commence_time = derive_commence_time(
            row.get("commence_time_utc") or row.get("commence_time"),
            row_clock,
            row_captured_at,
        )
        output.append(
            MarketMatch(
                source_file=path.name,
                source_match_id=str(
                    row.get("match_id") or row.get("source_match_id") or index
                ),
                league=league,
                home=home,
                away=away,
                commence_time=commence_time,
                captured_at=row_captured_at,
                markets=row.get("market_odds") or row.get("bookmakers") or row.get("markets") or {},
                home_score=row.get("home_score"),
                away_score=row.get("away_score"),
                clock=row_clock,
            )
        )
    return output


def extract_text_markets(path: Path) -> list[MarketMatch]:
    """Parse common human-readable live-odds exports without assuming one vendor."""
    text = path.read_text(encoding="utf-8-sig", errors="replace")
    pair_patterns = (
        re.compile(r"^\s*(.+?)\s+(?:vs\.?|v\.?)\s+(.+?)\s*$", re.I),
        re.compile(r"^\s*(.+?)\s+[—–]\s+(.+?)\s*$"),
        re.compile(r"^\s*(.+?)\s+对阵\s+(.+?)\s*$"),
    )
    rows: list[tuple[int, str, str]] = []
    lines = text.splitlines()
    for index, line in enumerate(lines):
        for pattern in pair_patterns:
            match = pattern.match(line)
            if match:
                rows.append((index, match.group(1).strip(), match.group(2).strip()))
                break
    output: list[MarketMatch] = []
    for position, (index, home, away) in enumerate(rows):
        end = rows[position + 1][0] if position + 1 < len(rows) else min(len(lines), index + 30)
        block = "\n".join(lines[index:end]).strip()
        if is_excluded_electronic_match("", home, away) or "梦幻对垒" in block:
            continue
        time_match = re.search(r"20\d{2}[-/]\d{1,2}[-/]\d{1,2}[ T]\d{1,2}:\d{2}(?::\d{2})?", block)
        output.append(
            MarketMatch(
                source_file=path.name,
                source_match_id=f"text-{index + 1}",
                league="",
                home=home,
                away=away,
                commence_time=time_match.group(0).replace("/", "-") if time_match else None,
                captured_at=datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat(),
                markets={"raw_text": block},
            )
        )
    return output


def event_minute(event: dict[str, Any], now: int) -> int | None:
    if event.get("_minute") is not None:
        return int(event["_minute"])
    status = event.get("status", {}).get("type")
    if status not in {"inprogress", "halftime"}:
        return None
    if status == "halftime":
        return 45
    period_start = event.get("time", {}).get("currentPeriodStartTimestamp")
    if not period_start:
        return None
    elapsed = max(0, (now - int(period_start)) // 60)
    period = event.get("time", {}).get("periodLength", 45)
    if event.get("lastPeriod") in {"period2", "extra1", "extra2"}:
        elapsed += int(period)
    return int(elapsed)


def flatten_statistics(payload: dict[str, Any]) -> dict[str, Any]:
    wanted = {
        "Total shots": "shots",
        "Shots on target": "shots_on_target",
        "Ball possession": "possession",
        "Corner kicks": "corners",
        "Yellow cards": "yellow_cards",
        "Red cards": "red_cards",
        "Big chances": "big_chances",
    }
    result: dict[str, Any] = {}
    periods = payload.get("statistics", [])
    period = next((p for p in periods if p.get("period") == "ALL"), periods[0] if periods else {})
    for group in period.get("groups", []):
        for item in group.get("statisticsItems", []):
            key = wanted.get(item.get("name"))
            if key:
                result[key] = {"home": item.get("home"), "away": item.get("away")}
    return result


def score_candidate(
    event: dict[str, Any],
    stats: dict[str, Any],
    minute: int | None,
    match_score: dict[str, Any] | None = None,
) -> tuple[int, list[str]]:
    score, reasons = 0, []
    if minute is not None and 20 <= minute <= 75:
        score += 25
        reasons.append("处于20–75分钟观察窗口")
    authoritative_score = match_score or {}
    home = authoritative_score.get("home")
    away = authoritative_score.get("away")
    home = event.get("homeScore", {}).get("current", 0) if home is None else home
    away = event.get("awayScore", {}).get("current", 0) if away is None else away
    home = home or 0
    away = away or 0
    if abs(home - away) <= 1:
        score += 20
        reasons.append("分差不超过1球")
    for key, weight in (
        ("shots_on_target", 15),
        ("shots", 10),
        ("dangerous_attacks", 8),
        ("attacks", 5),
        ("corners", 8),
        ("possession", 5),
        ("penalties", 4),
    ):
        if key in stats:
            score += weight
    if stats:
        reasons.append("已取得实时技术统计")
    incidents = event.get("_incidents", [])
    if any(i.get("incidentClass") == "red" for i in incidents):
        score += 7
        reasons.append("存在红牌事件，需重新评估走势")
    return min(score, 90), reasons


def score_prematch_candidate(
    event: dict[str, Any], match_confidence: float
) -> tuple[int, list[str]]:
    """Score prematch data completeness; this is not a betting grade."""
    score = int(round(match_confidence * 45))
    reasons = [f"赛事名称匹配置信度 {match_confidence:.0%}"]
    odds = event.get("odds")
    odds = odds if isinstance(odds, dict) else {}
    current = odds.get("current")
    current = current if isinstance(current, dict) else {}
    if current.get("asian_handicap"):
        score += 12
        reasons.append("已取得赛前让球参考盘")
    if current.get("total_goals"):
        score += 12
        reasons.append("已取得赛前大小球参考盘")
    if current.get("h2h"):
        score += 8
        reasons.append("已取得赛前胜平负参考盘")
    detail = odds.get("detail")
    detail = detail if isinstance(detail, dict) else {}
    normalized = detail.get("normalized")
    if isinstance(normalized, dict) and normalized.get("companies"):
        score += 8
        reasons.append("已取得多公司初盘与即时盘")
    return min(score, 90), reasons


def numeric(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(str(value).replace("%", ""))
    except ValueError:
        return None


def load_history(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, list) else []
    except (OSError, ValueError):
        return []


def calculate_trends(
    event_id: Any,
    stats: dict[str, Any],
    history: list[dict[str, Any]],
    now: int,
    current_minute: int | None = None,
) -> dict[str, Any]:
    snapshots = [x for x in history if str(x.get("event_id")) == str(event_id)]
    result: dict[str, Any] = {}
    for window in (5, 15):
        target = now - window * 60
        older = [x for x in snapshots if int(x.get("timestamp", 0)) <= target]
        if not older:
            result[f"last_{window}_minutes"] = {"available": False}
            continue
        baseline = max(older, key=lambda x: int(x.get("timestamp", 0)))
        baseline_minute = baseline.get("minute")
        minimum_played_minutes = max(1, window - 2)
        if (
            current_minute is None
            or not isinstance(baseline_minute, (int, float))
            or current_minute - baseline_minute < minimum_played_minutes
        ):
            result[f"last_{window}_minutes"] = {
                "available": False,
                "reason": "insufficient_active_play",
                "baseline_timestamp": baseline["timestamp"],
                "baseline_minute": baseline_minute,
                "current_minute": current_minute,
            }
            continue
        delta: dict[str, Any] = {"available": True, "baseline_timestamp": baseline["timestamp"]}
        regressed = False
        for key in (
            "shots",
            "shots_on_target",
            "attacks",
            "dangerous_attacks",
            "corners",
            "yellow_cards",
            "red_cards",
            "penalties",
        ):
            if key not in stats or key not in baseline.get("statistics", {}):
                continue
            values: dict[str, Any] = {}
            for side in ("home", "away"):
                current = numeric(stats[key].get(side))
                previous = numeric(baseline["statistics"][key].get(side))
                if current is not None and previous is not None:
                    if current < previous:
                        regressed = True
                    values[side] = current - previous
            if values:
                delta[key] = values
        if regressed:
            delta = {
                "available": False,
                "reason": "statistics_regressed",
                "baseline_timestamp": baseline["timestamp"],
            }
        result[f"last_{window}_minutes"] = delta
    return result


def timeline_trends(
    event: dict[str, Any], current_minute: int | None
) -> dict[str, Any]:
    """Build immediate 5/15-minute incident trends from Leisu's timeline.

    Leisu detail exports already contain minute-stamped text-live incidents.  They
    are useful on the first export and must not be confused with a full
    cumulative-statistics delta: the output therefore declares its source and
    partial coverage explicitly.
    """
    entries = ((event.get("_live_text") or {}).get("entries") or [])
    if current_minute is None or not entries:
        return {}

    home = str(event.get("homeTeam", {}).get("name") or "")
    away = str(event.get("awayTeam", {}).get("name") or "")
    minute_pattern = re.compile(r"(?<!\d)(\d{1,3})\s*['’分钟]")
    clock_only = re.compile(r"^\s*(\d{1,3})\s*['’]\s*$")
    timeline: list[tuple[int, str]] = []
    pending_minute: int | None = None
    for raw_entry in entries:
        text = str(raw_entry or "").replace("\u00a0", " ").strip()
        if not text:
            continue
        only = clock_only.match(text)
        if only:
            pending_minute = int(only.group(1))
            continue
        embedded = minute_pattern.search(text)
        minute = int(embedded.group(1)) if embedded else pending_minute
        if minute is None or minute > current_minute:
            continue
        if not embedded and not re.search(
            r"进球|破门|射门|射正|扑|角球|黄牌|红牌|换人|替补|点球|VAR|受伤",
            text,
            re.I,
        ):
            continue
        timeline.append((minute, text))
        pending_minute = None

    def side_for(text: str) -> str | None:
        has_home = bool(home and home in text)
        has_away = bool(away and away in text)
        if has_home != has_away:
            return "home" if has_home else "away"
        if has_home and has_away:
            action = re.search(r"进球|破门|射门|射正|打门|攻门|头球|单刀|角球|黄牌|红牌", text)
            if action:
                prefix = text[: action.start()]
                home_at = prefix.rfind(home)
                away_at = prefix.rfind(away)
                if home_at != away_at:
                    return "home" if home_at > away_at else "away"
        return None

    output: dict[str, Any] = {}
    for window in (5, 15):
        start = max(0, current_minute - window)
        selected = [(minute, text) for minute, text in timeline if start < minute <= current_minute]
        metrics = {
            key: {"home": 0, "away": 0}
            for key in (
                "shots",
                "shots_on_target",
                "corners",
                "goals",
                "yellow_cards",
                "red_cards",
                "substitutions",
            )
        }
        observed: list[dict[str, Any]] = []
        for minute, text in selected:
            side = side_for(text)
            categories: list[str] = []
            if re.search(r"进球|破门|球进啦|乌龙球", text, re.I):
                categories.append("goals")
            if re.search(r"射门|打门|攻门|头球|单刀", text, re.I):
                categories.append("shots")
                if re.search(r"扑住|扑出|破门|进球|球进啦", text, re.I):
                    categories.append("shots_on_target")
            if "射正" in text:
                categories.extend(["shots", "shots_on_target"])
            if "角球" in text:
                categories.append("corners")
            if "黄牌" in text:
                categories.append("yellow_cards")
            if "红牌" in text:
                categories.append("red_cards")
            if re.search(r"换人|替补", text):
                categories.append("substitutions")
            categories = list(dict.fromkeys(categories))
            if side:
                for category in categories:
                    metrics[category][side] += 1
            if categories:
                observed.append(
                    {"minute": minute, "side": side, "categories": categories, "text": text}
                )
        output[f"last_{window}_minutes"] = {
            "available": True,
            "source": "leisu_text_timeline",
            "coverage": "incident_timeline",
            "window_start_minute": start,
            "window_end_minute": current_minute,
            "events_observed": len(observed),
            "events": observed,
            **metrics,
        }
    return output


def resolved_trends(
    event: dict[str, Any],
    stats: dict[str, Any],
    history: list[dict[str, Any]],
    now: int,
    current_minute: int | None,
) -> dict[str, Any]:
    """Prefer full statistical deltas, then use Leisu's existing timeline."""
    snapshot = event.get("_recent_trends") or calculate_trends(
        event.get("id"), stats, history, now, current_minute
    )
    timeline = timeline_trends(event, current_minute)
    result: dict[str, Any] = {}
    for window in (5, 15):
        key = f"last_{window}_minutes"
        statistical = snapshot.get(key, {}) if isinstance(snapshot, dict) else {}
        result[key] = statistical if statistical.get("available") else timeline.get(key, statistical)
    return result


def save_history(
    path: Path,
    events: list[dict[str, Any]],
    now: int,
    existing: list[dict[str, Any]],
) -> None:
    cutoff = now - 24 * 3600
    retained = [x for x in existing if int(x.get("timestamp", 0)) >= cutoff]
    for event in events:
        retained.append(
            {
                "timestamp": now,
                "event_id": event.get("id"),
                "minute": event_minute(event, now),
                "score": {
                    "home": event.get("homeScore", {}).get("current"),
                    "away": event.get("awayScore", {}).get("current"),
                },
                "statistics": event.get("_statistics", {}),
            }
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(retained, ensure_ascii=False, indent=2), encoding="utf-8")


def match_events(
    markets: list[MarketMatch],
    events: list[dict[str, Any]],
    aliases: dict[str, str],
    threshold: float,
    history: list[dict[str, Any]],
    mode: str = "live",
) -> tuple[list[dict[str, Any]], list[MarketMatch]]:
    matched, unmatched = [], []
    now = int(time.time())
    for market in markets:
        best: tuple[float, dict[str, Any] | None] = (0.0, None)
        for event in events:
            source_start = parse_timestamp(market.commence_time)
            live_start = event.get("startTimestamp")
            if source_start and live_start and abs(source_start - int(live_start)) > 18 * 3600:
                continue
            direct = (
                team_score(market.home, event["homeTeam"]["name"], aliases)
                + team_score(market.away, event["awayTeam"]["name"], aliases)
            ) / 2
            reverse = (
                team_score(market.home, event["awayTeam"]["name"], aliases)
                + team_score(market.away, event["homeTeam"]["name"], aliases)
            ) / 2
            direct = contextual_match_score(direct, market, event)
            reverse = contextual_match_score(reverse, market, event, reverse=True) - 0.12
            candidate = max(direct, reverse)
            if candidate > best[0]:
                best = (candidate, event)
        if best[0] < threshold or best[1] is None:
            unmatched.append(market)
            continue
        event = best[1]
        event_id = event["id"]
        stats = event.get("_statistics", {}) if mode == "live" else {}
        incidents = event.get("_incidents", []) if mode == "live" else []
        if mode == "live" and event.get("_provider") not in {"espn", "leisu"}:
            try:
                stats = flatten_statistics(fetch_api(f"event/{event_id}/statistics"))
            except Exception:
                stats = {}
            try:
                incidents = fetch_api(f"event/{event_id}/incidents").get("incidents", [])
            except Exception:
                incidents = []
        event["_incidents"] = incidents
        state = authoritative_match_state(market, event, mode)
        minute = state["minute"]
        if mode == "live":
            candidate_score, reasons = score_candidate(
                event, stats, minute, state["score"]
            )
        else:
            candidate_score, reasons = score_prematch_candidate(event, best[0])
        matched.append(
            {
                "match": {
                    "sofascore_event_id": event_id,
                    "provider": event.get("_provider", "sofascore"),
                    "league": event.get("tournament", {}).get("name"),
                    "home": event["homeTeam"]["name"],
                    "away": event["awayTeam"]["name"],
                    "minute": minute,
                    "status": event.get("status", {}).get("type"),
                    "score": state["score"],
                    "score_source": state["score_source"],
                    "state_source": state["state_source"],
                    "start_time": state["start_time"],
                    "provider_state": state["provider_state"],
                    "provider_start_time": event.get("_start_time_text"),
                },
                "market_source": asdict(market),
                "match_confidence": round(best[0], 4),
                "live_statistics": stats,
                "reference_odds": event.get("odds", {}),
                "recent_trends": resolved_trends(
                    event, stats, history, now, minute
                ),
                "incidents": incidents,
                "weather": event.get("_weather", {}),
                "lineups": event.get("_lineups", {}),
                "player_candidates": event.get("_player_candidates", {}),
                "live_text": event.get("_live_text", {}),
                "detail_context": event.get("_detail_context", {}),
                "statistics_source": event.get("_statistics_source"),
                "detail_api": event.get("_detail_api_discovery", {}),
                "candidate": {
                    "score": candidate_score,
                    "grade": "B" if candidate_score >= 65 else "C",
                    "reasons": reasons,
                    "notice": "第一阶段仅输出候选，不构成投注建议；尚未接入实时赔率。",
                },
            }
        )
    return matched, unmatched


def main() -> int:
    parser = argparse.ArgumentParser(description="Collect SofaScore live football and match local market JSON.")
    parser.add_argument("market_files", nargs="+", type=Path)
    parser.add_argument("-o", "--output", type=Path, default=Path("output/live_candidates.json"))
    parser.add_argument("--aliases", type=Path, default=Path("team_aliases.json"))
    parser.add_argument(
        "--auto-aliases",
        type=Path,
        default=Path("team_aliases_auto.json"),
    )
    parser.add_argument("--threshold", type=float, default=0.72)
    parser.add_argument("--provider", choices=("auto", "sofascore", "espn"), default="auto")
    parser.add_argument("--live-fixture", type=Path, help="Use saved SofaScore live JSON for offline testing.")
    parser.add_argument("--history", type=Path, default=Path("output/live_history.json"))
    parser.add_argument("--mode", choices=("live", "prematch"), default="live")
    args = parser.parse_args()

    try:
        markets = [item for path in args.market_files for item in extract_markets(path)]
        if args.live_fixture:
            provider_used = "fixture"
            provider_errors: list[str] = []
            all_events = [
                repair_leisu_event(event)
                for event in json.loads(args.live_fixture.read_text(encoding="utf-8")).get("events", [])
            ]
        else:
            provider_used, all_events, provider_errors = collect_live(args.provider)
        allowed_statuses = (
            {"inprogress", "halftime"} if args.mode == "live" else {"notstarted"}
        )
        selected_events = [
            event for event in all_events
            if event.get("status", {}).get("type") in allowed_statuses
        ]
        history = load_history(args.history)
        aliases = merge_alias_files(args.aliases, args.auto_aliases)
        matched, unmatched = match_events(
            markets,
            selected_events,
            aliases,
            args.threshold,
            history,
            args.mode,
        )
        learned_aliases = 0
        if args.mode == "prematch" and unmatched:
            used_event_ids = {
                str(item.get("match", {}).get("sofascore_event_id"))
                for item in matched
            }
            learned_aliases = infer_auto_aliases(
                unmatched,
                selected_events,
                aliases,
                used_event_ids,
                args.auto_aliases,
            )
            if learned_aliases:
                aliases = merge_alias_files(args.aliases, args.auto_aliases)
                matched, unmatched = match_events(
                    markets,
                    selected_events,
                    aliases,
                    args.threshold,
                    history,
                    args.mode,
                )
        try:
            auto_alias_payload = json.loads(
                args.auto_aliases.read_text(encoding="utf-8")
            )
            auto_aliases_total = sum(
                len(values)
                for values in auto_alias_payload.values()
                if isinstance(values, list)
            )
        except (OSError, ValueError):
            auto_aliases_total = 0
        now_timestamp = int(time.time())
        result = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "mode": args.mode,
            "provider": provider_used,
            "provider_warnings": provider_errors,
            "summary": {
                "market_events": len(markets),
                "live_events": len(selected_events) if args.mode == "live" else 0,
                "prematch_events": len(selected_events) if args.mode == "prematch" else 0,
                "matched": len(matched),
                "unmatched": len(unmatched),
                "b_candidates": sum(x["candidate"]["grade"] == "B" for x in matched),
                "learned_aliases": learned_aliases,
                "auto_aliases_total": auto_aliases_total,
            },
            "candidates": sorted(matched, key=lambda x: x["candidate"]["score"], reverse=True),
            "live_events": [
                {
                    "sofascore_event_id": event.get("id"),
                    "league": event.get("tournament", {}).get("name"),
                    "home": event.get("homeTeam", {}).get("name"),
                    "away": event.get("awayTeam", {}).get("name"),
                    "status": event.get("status", {}).get("type"),
                    "minute": event_minute(event, int(time.time())),
                    "score": {
                        "home": event.get("homeScore", {}).get("current"),
                        "away": event.get("awayScore", {}).get("current"),
                    },
                    "live_statistics": event.get("_statistics", {}),
                    "reference_odds": event.get("odds", {}),
                    "recent_trends": resolved_trends(
                        event,
                        event.get("_statistics", {}),
                        history,
                        now_timestamp,
                        event_minute(event, now_timestamp),
                    ),
                }
                for event in selected_events
            ],
            "unmatched_markets": [asdict(item) for item in unmatched],
        }
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        if args.mode == "live":
            save_history(args.history, selected_events, now_timestamp, history)
        print(json.dumps(result["summary"], ensure_ascii=False))
        print(f"Output: {args.output.resolve()}")
        return 0
    except (OSError, ValueError, urllib.error.URLError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
