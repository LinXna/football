#!/usr/bin/env python3
"""中文图形入口：运行分析并导出完整整合数据。"""

from __future__ import annotations

import subprocess
import tkinter as tk
from datetime import datetime
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

from export_combined_data import ExportDataError, export_bundle


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_ROOT = Path(__file__).resolve().parent
NEW_CONSOLE = getattr(subprocess, "CREATE_NEW_CONSOLE", 0)


def launch_powershell(script: str) -> None:
    try:
        subprocess.Popen(
            [
                "powershell.exe",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(PROJECT_ROOT / script),
            ],
            cwd=PROJECT_ROOT,
            creationflags=NEW_CONSOLE,
        )
    except OSError as exc:
        messagebox.showerror("启动失败", str(exc))


def launch_alias_manager() -> None:
    try:
        subprocess.Popen(
            ["pythonw.exe", str(PROJECT_ROOT / "manage_team_aliases.py")],
            cwd=PROJECT_ROOT,
        )
    except OSError as exc:
        messagebox.showerror("启动失败", str(exc))


def choose_and_export(mode: str, raw_only: bool = False) -> None:
    label = "滚球" if mode == "live" else "非滚球"
    content_label = "仅YBTY＋雷速" if raw_only else "完整分析"
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    destination = filedialog.asksaveasfilename(
        title=f"保存{label}{content_label}整合数据",
        defaultextension=".zip",
        initialfile=f"{label}_{content_label}_整合数据_{stamp}.zip",
        filetypes=[
            ("ZIP压缩整合数据（推荐）", "*.zip"),
            ("JSON数据文件（体积较大）", "*.json"),
            ("所有文件", "*.*"),
        ],
    )
    if not destination:
        return
    root.config(cursor="watch")
    root.update_idletasks()
    try:
        bundle = export_bundle(
            mode,
            Path(destination),
            raw_only=raw_only,
        )
    except (ExportDataError, OSError) as exc:
        messagebox.showerror("导出失败", str(exc))
        return
    finally:
        root.config(cursor="")
    summary = bundle["summary"]
    warning_text = ""
    if bundle["completeness"]["warnings"]:
        warning_text = "\n\n完整性提醒：\n- " + "\n- ".join(
            bundle["completeness"]["warnings"]
        )
    messagebox.showinfo(
        "导出完成",
        (
            f"{label}{content_label}整合数据已保存。\n\n"
            f"YBTY原始赛事：{summary.get('ybty_raw_count', 0)}场\n"
            f"雷速原始赛事：{summary.get('leisu_raw_count', 0)}场\n"
            f"成功匹配：{summary.get('matched', 0)}场\n"
            f"未匹配明细：{summary.get('unmatched_detail_count', 0)}场\n\n"
            f"文件格式：{'ZIP压缩包' if Path(destination).suffix.lower() == '.zip' else 'JSON'}\n"
            f"保存位置：\n{destination}"
            f"{warning_text}"
        ),
    )


root = tk.Tk()
root.title("足球比赛分析系统")
root.geometry("520x690")
root.resizable(False, False)

frame = ttk.Frame(root, padding=24)
frame.pack(fill="both", expand=True)
ttk.Label(
    frame,
    text="足球比赛分析系统",
    font=("Microsoft YaHei UI", 18, "bold"),
).pack(pady=(0, 8))
ttk.Label(
    frame,
    text="请选择要执行的任务",
    font=("Microsoft YaHei UI", 10),
).pack(pady=(0, 16))

style = ttk.Style()
style.configure("Menu.TButton", font=("Microsoft YaHei UI", 11), padding=10)

ttk.Label(frame, text="分析", font=("Microsoft YaHei UI", 11, "bold")).pack(
    anchor="w", pady=(0, 3)
)
ttk.Button(
    frame,
    text="滚球分析（正在比赛）",
    style="Menu.TButton",
    command=lambda: launch_powershell("run_latest_ybty.ps1"),
).pack(fill="x", pady=4)
ttk.Button(
    frame,
    text="非滚球分析（尚未开赛）",
    style="Menu.TButton",
    command=lambda: launch_powershell("run_prematch.ps1"),
).pack(fill="x", pady=4)
ttk.Button(
    frame,
    text="同时运行滚球和非滚球",
    style="Menu.TButton",
    command=lambda: launch_powershell("run_both.ps1"),
).pack(fill="x", pady=4)

ttk.Separator(frame).pack(fill="x", pady=14)
ttk.Label(
    frame,
    text="导出完整整合数据",
    font=("Microsoft YaHei UI", 11, "bold"),
).pack(anchor="w", pady=(0, 3))
ttk.Button(
    frame,
    text="导出滚球完整数据（全部内容）",
    style="Menu.TButton",
    command=lambda: choose_and_export("live"),
).pack(fill="x", pady=4)
ttk.Button(
    frame,
    text="导出滚球基础数据（仅YBTY + 雷速）",
    style="Menu.TButton",
    command=lambda: choose_and_export("live", raw_only=True),
).pack(fill="x", pady=4)
ttk.Button(
    frame,
    text="导出非滚球完整数据（全部内容）",
    style="Menu.TButton",
    command=lambda: choose_and_export("prematch"),
).pack(fill="x", pady=4)
ttk.Button(
    frame,
    text="导出非滚球基础数据（仅YBTY + 雷速）",
    style="Menu.TButton",
    command=lambda: choose_and_export("prematch", raw_only=True),
).pack(fill="x", pady=4)

ttk.Separator(frame).pack(fill="x", pady=14)
ttk.Button(
    frame,
    text="手动处理未匹配球队",
    style="Menu.TButton",
    command=launch_alias_manager,
).pack(fill="x", pady=4)

ttk.Label(
    frame,
    text=(
        "提示：先导出YBTY和雷速数据并运行对应分析，"
        "再点击整合导出。\n保存位置由你在弹出的窗口中选择。"
    ),
    foreground="#666666",
    justify="left",
).pack(pady=(18, 0), anchor="w")

root.mainloop()
