# /// script
# dependencies = [
#   "numpy",
# ]
# ///

import json
import os
import platform
import sys

import numpy as np


def main():
    raw = sys.stdin.read()
    payload = json.loads(raw) if raw.strip() else {}
    sample = np.array(payload.get("sample", [1, 2, 3, 4]), dtype=float)

    result = {
        "ok": True,
        "extension": "env-check",
        "dependency": {
            "name": "numpy",
            "version": np.__version__,
            "mean": float(sample.mean()),
        },
        "runtime": {
            "python": sys.version.split()[0],
            "executable": sys.executable,
            "platform": platform.platform(),
            "cwd": os.getcwd(),
        },
        "context": {
            "projectPath": payload.get("projectPath", ""),
            "mode": payload.get("mode", ""),
        },
    }

    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
