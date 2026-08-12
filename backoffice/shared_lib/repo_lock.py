from __future__ import annotations

import os
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import BinaryIO


class RepoMutationLockTimeout(TimeoutError):
    """Raised when another process keeps a repository mutation lock busy."""


_THREAD_LOCKS_GUARD = threading.Lock()


@dataclass
class _RepoLockState:
    thread_lock: threading.RLock = field(default_factory=threading.RLock)
    handle: BinaryIO | None = None
    depth: int = 0


_LOCK_STATES: dict[str, _RepoLockState] = {}


def _lock_state_for(path: Path) -> _RepoLockState:
    key = os.path.normcase(str(path.resolve()))
    with _THREAD_LOCKS_GUARD:
        state = _LOCK_STATES.get(key)
        if state is None:
            state = _RepoLockState()
            _LOCK_STATES[key] = state
        return state


def _try_lock(handle: BinaryIO) -> bool:
    if os.name == "nt":
        import msvcrt

        handle.seek(0)
        try:
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            return False
        return True

    import fcntl

    try:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        return False
    return True


def _unlock(handle: BinaryIO) -> None:
    if os.name == "nt":
        import msvcrt

        handle.seek(0)
        msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
        return

    import fcntl

    fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


@contextmanager
def repo_mutation_lock(
    repo_root: Path,
    name: str,
    *,
    timeout_seconds: float = 15.0,
    poll_seconds: float = 0.05,
) -> Iterator[None]:
    """Serialize one mutation family across threads and local processes.

    The ignored lock file is only a synchronization primitive. It contains no
    state and is never a truth surface; the protected repository files remain
    the canonical owners. OS locks disappear automatically if a process exits.
    """

    safe_name = "".join(char for char in name if char.isalnum() or char in "-_")
    if not safe_name or safe_name != name:
        raise ValueError(f"Invalid repository lock name: {name!r}")
    lock_path = repo_root / "data" / "backoffice" / "locks" / f"{safe_name}.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    state = _lock_state_for(lock_path)
    deadline = time.monotonic() + max(timeout_seconds, 0.0)

    if not state.thread_lock.acquire(timeout=max(timeout_seconds, 0.0)):
        raise RepoMutationLockTimeout(
            f"Timed out waiting for {safe_name} mutation lock"
        )
    try:
        if state.depth == 0:
            handle = lock_path.open("a+b")
            try:
                handle.seek(0, os.SEEK_END)
                if handle.tell() == 0:
                    handle.write(b"\0")
                    handle.flush()

                while not _try_lock(handle):
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise RepoMutationLockTimeout(
                            f"Timed out waiting for {safe_name} mutation lock"
                        )
                    time.sleep(min(poll_seconds, remaining))
            except BaseException:
                handle.close()
                raise
            state.handle = handle
        state.depth += 1
        try:
            yield
        finally:
            state.depth -= 1
            if state.depth == 0:
                handle = state.handle
                state.handle = None
                if handle is not None:
                    try:
                        _unlock(handle)
                    finally:
                        handle.close()
    finally:
        state.thread_lock.release()
