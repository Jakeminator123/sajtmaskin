from __future__ import annotations

import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

def resolve_command(command: tuple[str, ...]) -> list[str]:
    """Resolve the first argument via PATH (PATHEXT on Windows).

    Without this, ``subprocess.run([...npm...], shell=False)`` raises
    FileNotFoundError on Windows because ``npm`` is a ``.cmd`` shim.
    ``shutil.which`` respects PATHEXT and finds ``npm.cmd``/``npm.exe``.
    Falls back to the original command if the lookup fails, so the error is
    still reported rather than silently swapping binaries.
    """
    if not command:
        return []
    resolved = shutil.which(command[0])
    if not resolved:
        return list(command)
    return [resolved, *command[1:]]


def run_repo_command(
    repo_root: Path,
    command: tuple[str, ...],
    *,
    timeout: int = 600,
) -> dict[str, Any]:
    """Run a repo maintenance command (npm/node/…) from a backoffice button.

    Windows-safe (`resolve_command`), blocking with a hard timeout, and never
    raises — returns a result dict the caller can render as OK/FAIL + output.
    The child inherits the backoffice process env (so `.env.local`-derived keys
    like OPENAI_API_KEY flow through).
    """
    started = time.time()
    stdout = ""
    stderr = ""
    exit_code = -99
    try:
        proc = subprocess.run(
            resolve_command(command),
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
            shell=False,
        )
        exit_code = proc.returncode
        stdout = proc.stdout or ""
        stderr = proc.stderr or ""
    except subprocess.TimeoutExpired as exc:
        exit_code = -1
        stdout = exc.stdout if isinstance(exc.stdout, str) else ""
        stderr = (exc.stderr if isinstance(exc.stderr, str) else "") + (
            f"\n[backoffice] Timeout efter {timeout}s"
        )
    except FileNotFoundError as exc:
        exit_code = -2
        stderr = f"Saknar binär ({command[0] if command else '?'}): {exc}"
    except Exception as exc:  # pragma: no cover - defensive UI helper
        exit_code = -3
        stderr = f"Oväntat fel: {exc}"
    return {
        "command": " ".join(command),
        "exitCode": int(exit_code),
        "ok": exit_code == 0,
        "elapsedSec": round(time.time() - started, 2),
        "stdoutTail": stdout[-4000:],
        "stderrTail": stderr[-4000:],
    }
