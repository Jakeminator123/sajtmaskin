from __future__ import annotations

import os
import subprocess

from backoffice.shared import BackofficeContext

from .constants import BASELINE_TAG, BASELINE_PATHS


# Superset of `git rev-parse --local-env-vars` across supported Git versions,
# plus namespace. Any one may redirect discovery, ref resolution, path handling,
# or the object graph used by the destructive baseline-reset path.
_GIT_ENV_VARS_TO_CLEAR = (
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_CONFIG",
    "GIT_CONFIG_PARAMETERS",
    "GIT_CONFIG_COUNT",
    "GIT_OBJECT_DIRECTORY",
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_IMPLICIT_WORK_TREE",
    "GIT_GRAFT_FILE",
    "GIT_INDEX_FILE",
    "GIT_NO_REPLACE_OBJECTS",
    "GIT_REPLACE_REF_BASE",
    "GIT_PREFIX",
    "GIT_SHALLOW_FILE",
    "GIT_COMMON_DIR",
    "GIT_INTERNAL_SUPER_PREFIX",
    "GIT_NAMESPACE",
)


def _isolated_git_env(repo_root) -> dict[str, str]:
    """Drop inherited repo identity and re-add this root as safe.directory."""
    env = os.environ.copy()
    for key in _GIT_ENV_VARS_TO_CLEAR:
        env.pop(key, None)
    for key in tuple(env):
        if key.startswith(("GIT_CONFIG_KEY_", "GIT_CONFIG_VALUE_")):
            env.pop(key, None)
    env.update(
        {
            "GIT_CONFIG_COUNT": "1",
            "GIT_CONFIG_KEY_0": "safe.directory",
            "GIT_CONFIG_VALUE_0": str(repo_root.resolve()),
            "PYTHONIOENCODING": "utf-8",
        }
    )
    return env


def _facade():
    """Late-bind through the page module so tests can patch ``sl._run_git`` / ``sl.backup_file``."""
    from backoffice.pages import scaffold_lifecycle as page

    return page



def _run_repo_command(ctx: BackofficeContext, command: list[str], *, timeout: int = 600) -> str:
    result = subprocess.run(
        command,
        capture_output=True,
        cwd=str(ctx.repo_root),
        env=_isolated_git_env(ctx.repo_root),
        text=True,
        timeout=timeout,
        check=False,
    )
    output = result.stdout or ""
    if result.stderr:
        output = f"{output}\n{result.stderr}".strip()
    if result.returncode != 0:
        raise RuntimeError(output or f"Command failed with exit code {result.returncode}.")
    return output.strip() or "(no output)"




def _run_git(ctx: BackofficeContext, args: list[str], *, timeout: int = 60) -> tuple[int, str]:
    """Run git and return (exit code, combined output).

    Two encoding decisions matter because the baseline reset turns this output
    into filesystem paths it then deletes:

    * `core.quotePath=false` — git's default C-quotes non-ASCII names, so
      `rädd.txt` would come back as `"r\\303\\244dd.txt"`. A quoted path does not
      exist on disk, and the caller would then look for the wrong file.
    * `encoding="utf-8"` — `text=True` alone decodes with the locale encoding
      (cp1252 on Swedish Windows), which turns git's UTF-8 bytes into mojibake
      and again produces a path that does not exist.

    Either mistake made the backup pass silently skip a file that the following
    `git restore` then deleted for real.
    """
    result = subprocess.run(
        ["git", "-c", "core.quotePath=false", *args],
        capture_output=True,
        cwd=str(ctx.repo_root),
        env=_isolated_git_env(ctx.repo_root),
        text=True,
        encoding="utf-8",
        timeout=timeout,
        check=False,
    )
    output = (result.stdout or "") + (("\n" + result.stderr) if result.stderr else "")
    return result.returncode, output.strip()




def _baseline_tag_exists(ctx: BackofficeContext) -> bool:
    code, output = _facade()._run_git(ctx, ["tag", "--list", BASELINE_TAG])
    return code == 0 and BASELINE_TAG in output.splitlines()




def _baseline_drift(ctx: BackofficeContext) -> dict[str, list[str]]:
    """Files that differ from the baseline tag within the scaffold surfaces."""
    run_git = _facade()._run_git
    _, changed_raw = run_git(
        ctx, ["diff", "--name-status", BASELINE_TAG, "--", *BASELINE_PATHS]
    )
    _, untracked_raw = run_git(
        ctx, ["ls-files", "--others", "--exclude-standard", "--", *BASELINE_PATHS]
    )
    changed = [line for line in changed_raw.splitlines() if line.strip()]
    untracked = [line for line in untracked_raw.splitlines() if line.strip()]
    added = [
        line.split("\t", 1)[1]
        for line in changed
        if line.startswith("A") and "\t" in line
    ]
    return {"changed": changed, "untracked": untracked, "added_since_tag": added}




def _baseline_head_delta(ctx: BackofficeContext) -> list[str]:
    """Commits AFTER the baseline tag that touch the scaffold surfaces.

    A factory reset only rewrites the working tree + index to the tag content —
    HEAD stays ahead. When such committed changes exist they remain in history,
    but a *later* commit made from the reset state would drop them from the
    branch tip (they read as deletions vs the tag). Surfaced in the UI so the
    operator can move the baseline instead of silently orphaning committed work.
    """
    code, output = _facade()._run_git(
        ctx, ["log", "--oneline", f"{BASELINE_TAG}..HEAD", "--", *BASELINE_PATHS]
    )
    if code != 0:
        return []
    return [line for line in output.splitlines() if line.strip()]




def _factory_reset_to_baseline(ctx: BackofficeContext) -> list[str]:
    """Reset the scaffold surfaces to the baseline tag. Returns log lines.

    Transactional ordering (A#3): `git restore` runs FIRST, so a restore
    failure aborts before anything is deleted. The previous order
    (unlink → restore) permanently deleted files-added-since-baseline if the
    restore step then failed. Files not present at the tag are untouched by
    restore, so they are deleted only after a clean restore.

    Every file that is about to disappear is snapshotted into the backup layer
    before ANY of it happens — before the restore, not just before the unlink
    loop. `git restore --staged --worktree` removes tracked paths that do not
    exist at the tag, so a staged-but-uncommitted add is already gone by the
    time the unlink loop runs, and its content survives only as a dangling blob.
    The pre-restore pass is the one moment where every doomed file still exists
    on disk. Fail-closed: no snapshot → nothing is touched at all (same pattern
    as the variant deletion above).

    Deliberately out of scope: uncommitted *modifications* to tracked files,
    which the restore also reverts. Those are what a factory reset is for and
    the UI warns about them; only the deletes were unrecoverable.
    """
    log: list[str] = []
    page = _facade()
    drift = _baseline_drift(ctx)

    # 0) Snapshot everything that is about to disappear, before touching
    #    anything. Tracked adds could in principle be dug out of git history;
    #    the untracked ones exist nowhere else, which is what made this the one
    #    genuinely unrecoverable action in the backoffice.
    doomed = drift["added_since_tag"] + drift["untracked"]
    for rel in doomed:
        target = ctx.repo_root / rel
        # Fail closed rather than skip. Every path here was just listed by git as
        # an existing file, so "not a file" means we are looking at the wrong
        # path (a quoting/encoding gap) or something moved under us. Skipping
        # would let the restore below delete a file we promised was backed up.
        if not target.is_file():
            raise RuntimeError(
                f"Hittade inte filen {rel} som git listade som avvikande — avbryter. "
                "Inget raderades och ingen återställning gjordes."
            )
        if page.backup_file(target, ctx.repo_root) is None:
            raise RuntimeError(
                f"Kunde inte säkerhetskopiera {rel} — avbryter. "
                "Inget raderades och ingen återställning gjordes."
            )
        log.append(f"säkerhetskopierade {rel}")

    # 1) Restore tracked scaffold surfaces to the baseline (index + worktree)
    #    FIRST — a failure here is then a no-op, not a partial/unrecoverable
    #    delete. `--staged` also resets THIS checkout's index for these paths so
    #    a later commit can't re-introduce experiments the UI says are gone.
    code, output = page._run_git(
        ctx,
        ["restore", "--source", BASELINE_TAG, "--staged", "--worktree", "--", *BASELINE_PATHS],
        timeout=120,
    )
    if code != 0:
        raise RuntimeError(f"git restore misslyckades (inget raderades): {output}")
    log.append(f"git restore --source {BASELINE_TAG} --staged --worktree klar")

    # 2) Delete whatever the restore left behind — untracked files are not part
    #    of the tag's tree, so restore ignores them. Every one of them already
    #    has a snapshot from step 0.
    for rel in doomed:
        target = ctx.repo_root / rel
        if target.is_file():
            target.unlink()
            log.append(f"raderade {rel}")

    # Sopa bort tomma kataloger som blev kvar efter raderade filer.
    for base_rel in BASELINE_PATHS:
        base = ctx.repo_root / base_rel
        if not base.is_dir():
            continue
        for directory in sorted(
            (d for d in base.rglob("*") if d.is_dir()),
            key=lambda d: len(d.parts),
            reverse=True,
        ):
            try:
                directory.rmdir()
                log.append(f"tog bort tom mapp {directory.relative_to(ctx.repo_root).as_posix()}")
            except OSError:
                pass
    return log
