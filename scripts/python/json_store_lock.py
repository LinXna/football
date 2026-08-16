from __future__ import annotations

import json
import os
import shutil
import time
import secrets
from contextlib import contextmanager
from functools import wraps
from pathlib import Path
from typing import Callable, Iterator, TypeVar

ROOT = Path(__file__).resolve().parents[2]
LOCK_PATH = ROOT / "output" / ".json-store.lock"
LOCK_TIMEOUT_SECONDS = 30.0
_depth = 0
T = TypeVar("T")


def _remove_stale_lock() -> bool:
    try:
        stat = LOCK_PATH.stat()
        if time.time() - stat.st_mtime <= 60.0:
            return False
        LOCK_PATH.unlink()
        return True
    except FileNotFoundError:
        return True
    except (OSError, ValueError, TypeError):
        return False


@contextmanager
def json_store_lock() -> Iterator[None]:
    global _depth
    if _depth:
        _depth += 1
        try:
            yield
        finally:
            _depth -= 1
        return
    LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + LOCK_TIMEOUT_SECONDS
    descriptor = None
    token = secrets.token_hex(16)
    while descriptor is None:
        try:
            descriptor = os.open(LOCK_PATH, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(descriptor, json.dumps({"pid": os.getpid(), "token": token, "acquired_at": time.time()}).encode("utf-8"))
        except FileExistsError:
            if _remove_stale_lock():
                continue
            if time.monotonic() >= deadline:
                raise TimeoutError("JSON store is busy; timed out waiting for the file lock")
            time.sleep(0.015)
    _depth = 1
    try:
        yield
    finally:
        _depth = 0
        os.close(descriptor)
        try:
            owner = json.loads(LOCK_PATH.read_text(encoding="utf-8"))
            if owner.get("token") == token:
                LOCK_PATH.unlink()
        except (FileNotFoundError, OSError, ValueError):
            pass


def locked_json_operation(function: Callable[..., T]) -> Callable[..., T]:
    @wraps(function)
    def wrapped(*args, **kwargs):
        with json_store_lock():
            return function(*args, **kwargs)
    return wrapped


class JsonDataCorruptionError(RuntimeError):
    pass


def read_json_strict(path: Path, fallback=None):
    if not path.exists():
        return fallback
    try:
        text = path.read_text(encoding="utf-8-sig").strip()
        if not text:
            raise ValueError("JSON file is empty")
        return json.loads(text)
    except (OSError, ValueError) as exc:
        stamp = time.strftime("%Y%m%dT%H%M%S")
        quarantine = path.with_name(f"{path.name}.corrupt-{stamp}-{os.getpid()}.json")
        try:
            shutil.copy2(path, quarantine)
        except OSError:
            quarantine = None
        backup = path.with_name(f"{path.name}.bak")
        if backup.exists():
            try:
                recovered = json.loads(backup.read_text(encoding="utf-8-sig"))
                shutil.copy2(backup, path)
                return recovered
            except (OSError, ValueError):
                pass
        raise JsonDataCorruptionError(
            f"JSON file is corrupted and no valid backup is available: {path}; corrupt copy: {quarantine}"
        ) from exc


def atomic_write_json(path: Path, data) -> None:
    with json_store_lock():
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists():
            read_json_strict(path)
        payload = json.dumps(data, ensure_ascii=False, indent=2)
        json.loads(payload)
        temporary = path.with_name(f"{path.name}.{os.getpid()}.{time.time_ns()}.tmp")
        try:
            with temporary.open("w", encoding="utf-8", newline="\n") as handle:
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())
            json.loads(temporary.read_text(encoding="utf-8"))
            if path.exists():
                shutil.copy2(path, path.with_name(f"{path.name}.bak"))
            os.replace(temporary, path)
        finally:
            try:
                temporary.unlink()
            except FileNotFoundError:
                pass
