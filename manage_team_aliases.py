#!/usr/bin/env python3
"""Small GUI for manually resolving unmatched YBTY/Leisu team names."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tkinter as tk
from datetime import datetime
from pathlib import Path
from tkinter import messagebox, ttk
from typing import Any

from football_live import (
    MarketMatch,
    contextual_match_score,
    merge_alias_files,
    repair_leisu_event,
    team_score,
)


ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "output"
CANDIDATES = OUTPUT / "ybty_leisu_prematch_candidates.json"
LEISU_FALLBACK = OUTPUT / "leisu_prematch_latest.json"
AUTO_ALIASES = ROOT / "team_aliases_auto.json"
CURATED_ALIASES = ROOT / "team_aliases.json"
SUPPRESSED_ALIASES = ROOT / "team_aliases_suppressed.json"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def save_alias(canonical: str, variant: str) -> bool:
    try:
        payload = load_json(AUTO_ALIASES)
        if not isinstance(payload, dict):
            payload = {}
    except (OSError, ValueError):
        payload = {}
    variants = payload.setdefault(canonical, [])
    if variant in variants or canonical == variant:
        return False
    variants.append(variant)
    AUTO_ALIASES.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    try:
        suppressed = load_json(SUPPRESSED_ALIASES)
        if isinstance(suppressed, list):
            next_suppressed = [item for item in suppressed if item != canonical]
            if next_suppressed != suppressed:
                SUPPRESSED_ALIASES.write_text(json.dumps(next_suppressed, ensure_ascii=False, indent=2), encoding="utf-8")
    except (OSError, ValueError):
        pass
    return True


def latest_leisu_export() -> Path:
    downloads = Path(os.environ.get("USERPROFILE", str(Path.home()))) / "Downloads"
    files = sorted(
        downloads.glob("leisu_prematch_*.json"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    return files[0] if files else LEISU_FALLBACK


def load_data() -> tuple[list[MarketMatch], list[dict[str, Any]]]:
    leisu_file = latest_leisu_export()
    if not CANDIDATES.exists() or not leisu_file.exists():
        raise FileNotFoundError("请先运行一次非滚球分析，生成未匹配比赛列表。")
    candidate_data = load_json(CANDIDATES)
    unmatched = [
        MarketMatch(**item) for item in candidate_data.get("unmatched_markets", [])
    ]
    used_ids = {
        str(item.get("match", {}).get("sofascore_event_id"))
        for item in candidate_data.get("candidates", [])
    }
    events = [
        repair_leisu_event(item)
        for item in load_json(leisu_file).get("events", [])
        if str(item.get("id")) not in used_ids
    ]
    aliases = merge_alias_files(CURATED_ALIASES, AUTO_ALIASES)

    # The candidates file may be older than a newly saved alias. Apply the
    # current alias files immediately so reopening this window never asks the
    # user to resolve the same team pair again.
    unresolved: list[MarketMatch] = []
    for market in unmatched:
        already_resolved = any(
            (
                team_score(
                    market.home,
                    event.get("homeTeam", {}).get("name", ""),
                    aliases,
                )
                == 1.0
                and team_score(
                    market.away,
                    event.get("awayTeam", {}).get("name", ""),
                    aliases,
                )
                == 1.0
            )
            or (
                team_score(
                    market.home,
                    event.get("awayTeam", {}).get("name", ""),
                    aliases,
                )
                == 1.0
                and team_score(
                    market.away,
                    event.get("homeTeam", {}).get("name", ""),
                    aliases,
                )
                == 1.0
            )
            for event in events
        )
        if not already_resolved:
            unresolved.append(market)
    return unresolved, events


def ranked_suggestions(
    market: MarketMatch,
    events: list[dict[str, Any]],
    aliases: dict[str, str],
) -> list[dict[str, Any]]:
    output = []
    for event in events:
        home = event.get("homeTeam", {}).get("name", "")
        away = event.get("awayTeam", {}).get("name", "")
        league = event.get("tournament", {}).get("name", "")
        timestamp = event.get("startTimestamp")
        start_text = (
            datetime.fromtimestamp(int(timestamp)).strftime("%m-%d %H:%M")
            if timestamp
            else event.get("_start_time_text") or "时间未知"
        )
        score_text = (
            f"{event.get('homeScore', {}).get('current', 0)}-"
            f"{event.get('awayScore', {}).get('current', 0)}"
        )
        direct = (
            team_score(market.home, home, aliases)
            + team_score(market.away, away, aliases)
        ) / 2
        reverse = (
            team_score(market.home, away, aliases)
            + team_score(market.away, home, aliases)
        ) / 2
        direct_context = contextual_match_score(direct, market, event)
        reverse_context = contextual_match_score(
            reverse, market, event, reverse=True
        )
        if reverse_context > direct_context:
            output.append(
                {
                    "event": event,
                    "score": reverse_context,
                    "reverse": True,
                    "label": (
                        f"[{start_text}｜{score_text}｜{league}] "
                        f"{away} vs {home}（反向，综合{reverse_context:.0%}）"
                    ),
                }
            )
        else:
            output.append(
                {
                    "event": event,
                    "score": direct_context,
                    "reverse": False,
                    "label": (
                        f"[{start_text}｜{score_text}｜{league}] "
                        f"{home} vs {away}（综合{direct_context:.0%}）"
                    ),
                }
            )
    return sorted(output, key=lambda item: item["score"], reverse=True)


class AliasManager:
    def __init__(self, root: tk.Tk, unmatched: list[MarketMatch], events: list[dict[str, Any]]):
        self.root = root
        self.unmatched = unmatched
        self.events = events
        self.index = 0
        self.suggestions: list[dict[str, Any]] = []
        self.filtered_suggestions: list[dict[str, Any]] = []
        self.saved = 0

        root.title("未匹配球队管理器")
        root.geometry("820x520")
        root.minsize(720, 470)
        frame = ttk.Frame(root, padding=18)
        frame.pack(fill="both", expand=True)

        self.progress = ttk.Label(frame, font=("Microsoft YaHei UI", 10))
        self.progress.pack(anchor="w")
        self.league = ttk.Label(frame, font=("Microsoft YaHei UI", 11))
        self.league.pack(anchor="w", pady=(14, 2))
        self.source = ttk.Label(
            frame, font=("Microsoft YaHei UI", 15, "bold"), foreground="#174ea6"
        )
        self.source.pack(anchor="w", pady=(0, 18))
        ttk.Label(
            frame,
            text="搜索雷速球队或联赛：",
            font=("Microsoft YaHei UI", 10),
        ).pack(anchor="w")
        self.search_var = tk.StringVar()
        self.search = ttk.Entry(
            frame, textvariable=self.search_var, font=("Microsoft YaHei UI", 11)
        )
        self.search.pack(fill="x", pady=(7, 10))
        self.search.bind("<KeyRelease>", lambda _event: self.refresh_search())
        ttk.Label(
            frame,
            text="选择雷速中对应的比赛（时间和比分优先，文字相似度仅作辅助）：",
            font=("Microsoft YaHei UI", 10),
        ).pack(anchor="w")
        self.combo = ttk.Combobox(frame, state="readonly", font=("Microsoft YaHei UI", 11))
        self.combo.pack(fill="x", pady=(7, 14))

        note = ttk.Label(
            frame,
            text="确认后会同时保存主队和客队别名。无法确定时请点“跳过”，不要强行匹配。",
            foreground="#a15c00",
            wraplength=700,
        )
        note.pack(anchor="w", pady=(0, 20))

        manual = ttk.LabelFrame(frame, text="列表中没有时，手动输入雷速名称", padding=8)
        manual.pack(fill="x", pady=(0, 14))
        self.manual_home = ttk.Entry(manual, font=("Microsoft YaHei UI", 10))
        self.manual_home.pack(side="left", fill="x", expand=True, padx=(0, 6))
        self.manual_away = ttk.Entry(manual, font=("Microsoft YaHei UI", 10))
        self.manual_away.pack(side="left", fill="x", expand=True, padx=6)
        ttk.Button(manual, text="保存手动名称", command=self.accept_manual).pack(
            side="left", padx=(6, 0)
        )

        buttons = ttk.Frame(frame)
        buttons.pack(fill="x")
        ttk.Button(buttons, text="确认并保存这场", command=self.accept).pack(side="left")
        ttk.Button(buttons, text="跳过", command=self.skip).pack(side="left", padx=10)
        ttk.Button(
            buttons, text="保存后重新运行分析", command=self.rerun
        ).pack(side="right")
        self.status = ttk.Label(frame, foreground="#137333")
        self.status.pack(anchor="w", pady=(22, 0))
        self.show_current()

    def show_current(self) -> None:
        if self.index >= len(self.unmatched):
            self.progress.config(text=f"处理完成：新增别名 {self.saved} 个")
            self.league.config(text="")
            self.source.config(text="没有更多未匹配比赛")
            self.combo["values"] = []
            self.combo.set("")
            return
        market = self.unmatched[self.index]
        aliases = merge_alias_files(CURATED_ALIASES, AUTO_ALIASES)
        self.suggestions = ranked_suggestions(market, self.events, aliases)
        self.progress.config(text=f"第 {self.index + 1} / {len(self.unmatched)} 场")
        self.league.config(text=f"YBTY联赛：{market.league or '未知'}")
        self.source.config(text=f"{market.home}  vs  {market.away}")
        score = (
            f"{market.home_score}-{market.away_score}"
            if market.home_score is not None and market.away_score is not None
            else "未提供"
        )
        self.source.config(
            text=(
                f"{market.home}  vs  {market.away}\n"
                f"时间：{market.commence_time or market.clock or '未提供'}　比分：{score}"
            )
        )
        self.search_var.set("")
        self.manual_home.delete(0, "end")
        self.manual_away.delete(0, "end")
        self.refresh_search()
        self.status.config(text=f"本次已新增 {self.saved} 个别名")

    def refresh_search(self) -> None:
        query = self.search_var.get().strip().casefold()
        self.filtered_suggestions = [
            item
            for item in self.suggestions
            if not query or query in item["label"].casefold()
        ]
        self.combo["values"] = [
            item["label"] for item in self.filtered_suggestions
        ]
        self.combo.set("")
        if self.filtered_suggestions:
            self.combo.current(0)

    def accept(self) -> None:
        selected = self.combo.current()
        if selected < 0 or selected >= len(self.filtered_suggestions):
            messagebox.showwarning("未选择", "请先选择雷速中的对应比赛。")
            return
        market = self.unmatched[self.index]
        suggestion = self.filtered_suggestions[selected]
        event = suggestion["event"]
        event_home = event.get("homeTeam", {}).get("name", "")
        event_away = event.get("awayTeam", {}).get("name", "")
        if suggestion["reverse"]:
            pairs = ((event_away, market.home), (event_home, market.away))
        else:
            pairs = ((event_home, market.home), (event_away, market.away))
        self.saved += sum(save_alias(canonical, variant) for canonical, variant in pairs)
        self.index += 1
        self.show_current()

    def skip(self) -> None:
        self.index += 1
        self.show_current()

    def accept_manual(self) -> None:
        if self.index >= len(self.unmatched):
            return
        home = self.manual_home.get().strip()
        away = self.manual_away.get().strip()
        if not home or not away:
            messagebox.showwarning("名称不完整", "请同时输入雷速主队和客队名称。")
            return
        market = self.unmatched[self.index]
        self.saved += int(save_alias(home, market.home))
        self.saved += int(save_alias(away, market.away))
        self.index += 1
        self.show_current()

    def rerun(self) -> None:
        try:
            subprocess.Popen(
                [
                    "powershell.exe",
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    str(ROOT / "run_prematch.ps1"),
                ],
                cwd=ROOT,
                creationflags=getattr(subprocess, "CREATE_NEW_CONSOLE", 0),
            )
            messagebox.showinfo("已启动", "已保存别名并启动非滚球分析。")
        except OSError as exc:
            messagebox.showerror("启动失败", str(exc))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        unmatched, events = load_data()
    except (OSError, ValueError) as exc:
        if args.check:
            print(f"ERROR: {exc}", file=sys.stderr)
            return 1
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror("无法打开", str(exc))
        return 1
    if args.check:
        print(
            json.dumps(
                {
                    "unmatched": len(unmatched),
                    "available_events": len(events),
                    "events_with_time": sum(
                        bool(item.get("startTimestamp") or item.get("_start_time_text"))
                        for item in events
                    ),
                },
                ensure_ascii=False,
            )
        )
        return 0
    root = tk.Tk()
    AliasManager(root, unmatched, events)
    root.mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
