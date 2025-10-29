"""
Entry point for the Python workflow engine.

Sprint 1 implements a minimal stub that can be used to verify that the Python
environment is ready and to demonstrate the JSON-lines protocol shell.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from typing import Any


def _check_environment() -> dict[str, Any]:
    """Return diagnostic information about optional dependencies."""
    llama_index_spec = importlib.util.find_spec("llama_index")
    return {
        "status": "ok",
        "llamaIndexAvailable": llama_index_spec is not None,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Workflow Agent engine stub")
    parser.add_argument(
        "--check",
        action="store_true",
        help="Run environment diagnostics and exit.",
    )
    args = parser.parse_args(argv)

    if args.check:
        diagnostics = _check_environment()
        print(json.dumps(diagnostics))
        return 0

    print(json.dumps({"type": "READY", "message": "Engine stub initialised"}))
    sys.stdout.flush()

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue

        if line.upper() == "PING":
            response = {"type": "PONG"}
        else:
            response = {
                "type": "ERROR",
                "message": "Stub engine received an unsupported command.",
            }

        print(json.dumps(response))
        sys.stdout.flush()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
