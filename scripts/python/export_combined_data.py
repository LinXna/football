#!/usr/bin/env python3
"""Export one self-contained YBTY + Leisu analysis bundle."""

from __future__ import annotations

import hashlib
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from scripts.python.json_store_lock import atomic_write_json, locked_json_operation
except ModuleNotFoundError:
    from json_store_lock import atomic_write_json, locked_json_operation


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "output"

MODE_FILES = {
    "live": {
        "label": "滚球",
        "status": OUTPUT / "pipeline_status.json",
        "ybty_fallback": OUTPUT / "ybty_latest.json",
        "leisu_fallback": OUTPUT / "leisu_latest.json",
        "candidates": OUTPUT / "ybty_leisu_candidates.json",
        "decisions": OUTPUT / "ybty_leisu_decisions.json",
    },
    "prematch": {
        "label": "非滚球",
        "status": OUTPUT / "prematch_pipeline_status.json",
        "ybty_fallback": OUTPUT / "ybty_prematch_latest.json",
        "leisu_fallback": OUTPUT / "leisu_prematch_latest.json",
        "candidates": OUTPUT / "ybty_leisu_prematch_candidates.json",
        "decisions": OUTPUT / "ybty_leisu_prematch_decisions.json",
        "ai_brief": OUTPUT / "prematch_ai_brief.json",
    },
}


class ExportDataError(RuntimeError):
    pass


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except FileNotFoundError as exc:
        raise ExportDataError(f"缺少文件：{path}") from exc
    except json.JSONDecodeError as exc:
        raise ExportDataError(f"JSON文件损坏：{path.name}（第{exc.lineno}行）") from exc


def file_info(path: Path) -> dict[str, Any]:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    stat = path.stat()
    return {
        "file_name": path.name,
        "original_path": str(path),
        "size_bytes": stat.st_size,
        "modified_at": datetime.fromtimestamp(
            stat.st_mtime, tz=timezone.utc
        ).isoformat(),
        "sha256": digest.hexdigest(),
    }


def source_path(status: dict[str, Any], field: str, fallback: Path) -> Path:
    value = status.get(field)
    if value:
        candidate = Path(value)
        if candidate.exists():
            return candidate
    return fallback


def audit_count(
    name: str,
    data: dict[str, Any],
    array_field: str,
    count_field: str = "count",
) -> dict[str, Any]:
    rows = data.get(array_field)
    declared = data.get(count_field)
    actual = len(rows) if isinstance(rows, list) else None
    return {
        "name": name,
        "declared_count": declared,
        "actual_count": actual,
        "valid": actual is not None and (declared is None or declared == actual),
    }


@locked_json_operation
def build_bundle(
    mode: str,
    root: Path = ROOT,
    raw_only: bool = False,
) -> dict[str, Any]:
    if mode not in MODE_FILES:
        raise ExportDataError(f"不支持的导出类型：{mode}")
    config = MODE_FILES[mode]
    # Tests may use a temporary root with the same output layout.
    output = root / "output"
    status_path = output / config["status"].name
    status = read_json(status_path)
    ybty_path = source_path(
        status,
        "ybty_file",
        output / config["ybty_fallback"].name,
    )
    leisu_path = source_path(
        status,
        "leisu_file",
        output / config["leisu_fallback"].name,
    )
    paths = {
        "ybty": ybty_path,
        "leisu": leisu_path,
        "candidates": output / config["candidates"].name,
        "decisions": output / config["decisions"].name,
        "pipeline_status": status_path,
    }
    if "ai_brief" in config:
        paths["ai_brief"] = output / config["ai_brief"].name

    if raw_only:
        paths = {
            "ybty": paths["ybty"],
            "leisu": paths["leisu"],
        }
    payload = {name: read_json(path) for name, path in paths.items()}
    ybty_audit = audit_count("YBTY赛事", payload["ybty"], "matches")
    leisu_audit = audit_count("雷速赛事", payload["leisu"], "events")
    candidate_summary = (
        payload["candidates"].get("summary", {})
        if not raw_only
        else {}
    )
    unmatched = (
        payload["candidates"].get("unmatched_markets", [])
        if not raw_only
        else []
    )
    audits = [ybty_audit, leisu_audit]
    warnings: list[str] = []
    if not all(item["valid"] for item in audits):
        warnings.append("原始文件声明数量与实际数组数量不一致")
    if (
        not raw_only
        and candidate_summary.get("unmatched", len(unmatched)) != len(unmatched)
    ):
        warnings.append("未匹配数量与未匹配明细不一致")
    if (
        not raw_only
        and status.get("candidate_file")
        and Path(status["candidate_file"]).name != paths["candidates"].name
    ):
        warnings.append("状态文件记录的候选文件名与当前候选文件不同")
    if (
        not raw_only
        and status.get("decision_file")
        and Path(status["decision_file"]).name != paths["decisions"].name
    ):
        warnings.append("状态文件记录的决策文件名与当前决策文件不同")

    return {
        "schema_version": "1.0",
        "bundle_type": mode,
        "export_profile": "raw_ybty_leisu" if raw_only else "complete_analysis",
        "bundle_label": config["label"],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "complete": not warnings,
        "completeness": {
            "raw_ybty_included": True,
            "raw_leisu_included": True,
            "matched_candidates_included": not raw_only,
            "unmatched_markets_included": not raw_only,
            "decisions_included": not raw_only,
            "pipeline_status_included": not raw_only,
            "ai_brief_included": not raw_only and "ai_brief" in config,
            "audits": audits,
            "warnings": warnings,
        },
        "source_files": {
            name: file_info(path) for name, path in paths.items()
        },
        "summary": {
            **candidate_summary,
            "ybty_raw_count": ybty_audit["actual_count"],
            "leisu_raw_count": leisu_audit["actual_count"],
            "unmatched_detail_count": len(unmatched),
        },
        "data": payload,
    }


def export_bundle(
    mode: str,
    destination: Path,
    root: Path = ROOT,
    raw_only: bool = False,
) -> dict[str, Any]:
    bundle = build_bundle(mode, root=root, raw_only=raw_only)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.suffix.lower() == ".zip":
        json_name = f"{destination.stem}.json"
        json_bytes = json.dumps(
            bundle,
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")
        temporary = destination.with_name(f"{destination.name}.{datetime.now().timestamp_ns() if hasattr(datetime.now(), 'timestamp_ns') else int(datetime.now().timestamp() * 1_000_000)}.tmp")
        with zipfile.ZipFile(
            temporary,
            "w",
            compression=zipfile.ZIP_DEFLATED,
            compresslevel=9,
        ) as archive:
            archive.writestr(json_name, json_bytes)
        temporary.replace(destination)
    else:
        atomic_write_json(destination, bundle)
    return bundle
