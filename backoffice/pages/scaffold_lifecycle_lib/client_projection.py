from __future__ import annotations

from collections.abc import Callable
from functools import wraps
from pathlib import Path
from typing import ParamSpec, TypeVar

from backoffice.shared import run_repo_command
from backoffice.shared_lib.repo_lock import repo_mutation_lock


_P = ParamSpec("_P")
_R = TypeVar("_R")


def scaffold_mutation_locked(
    operation: Callable[_P, _R],
) -> Callable[_P, _R]:
    """Serialize Backoffice scaffold writers across threads and processes."""

    @wraps(operation)
    def locked(ctx, *args, **kwargs):
        with repo_mutation_lock(ctx.repo_root, "scaffolds"):
            return operation(ctx, *args, **kwargs)

    return locked


def regenerate_scaffold_client_projection(repo_root: Path) -> None:
    """Regenerate the browser-safe scaffold list through its TypeScript owner."""
    result = run_repo_command(
        repo_root,
        (
            "node",
            "--import",
            "tsx",
            "scripts/scaffolds/generate-client-list.ts",
            "--write",
        ),
        timeout=120,
    )
    if result.get("ok"):
        return
    stdout = str(result.get("stdoutTail", "")).strip()
    stderr = str(result.get("stderrTail", "")).strip()
    details = "\n".join(part for part in (stdout, stderr) if part)
    exit_code = result.get("exitCode", "unknown")
    message = f"Scaffold client projection failed (exit {exit_code})."
    if details:
        message += f"\n{details}"
    raise RuntimeError(message)
