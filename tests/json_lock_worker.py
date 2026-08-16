import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.python.json_store_lock import json_store_lock

target = Path(sys.argv[1])
iterations = int(sys.argv[2])
for _ in range(iterations):
    with json_store_lock():
        current = json.loads(target.read_text(encoding="utf-8"))
        temporary = target.with_name(f"{target.name}.{os.getpid()}.tmp")
        temporary.write_text(json.dumps({"count": int(current.get("count", 0)) + 1}), encoding="utf-8")
        temporary.replace(target)
