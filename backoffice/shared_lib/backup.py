from __future__ import annotations

import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .context import find_repo_root

# --- Säkerhetskopiering (backup/restore) ---------------------------------------
# Alla sparningar som går via write_text/write_json säkerhetskopierar först den
# befintliga filen till data/backoffice/backups/ (gitignorerad). Sidan
# "Återställning" listar snapshots och kan rulla tillbaka en fil. Git är alltid
# det yttersta skyddsnätet — detta är ett snabbt, UI-nära ångra-lager.

BACKUP_DIR_PARTS = ("data", "backoffice", "backups")
MAX_BACKUPS_PER_FILE = 20


def backup_root(repo_root: Path | None = None) -> Path:
    root = repo_root or find_repo_root()
    return root.joinpath(*BACKUP_DIR_PARTS)


def backup_file(path: Path, repo_root: Path | None = None) -> Path | None:
    """Snapshot the current content of ``path`` before an overwrite/delete.

    Returns the backup path, or ``None`` when no snapshot was taken (file does
    not exist, path lies outside the repo, path is itself a backup, or the
    backup infrastructure failed). Backup failure is deliberately non-fatal:
    the save still goes through, and git remains the ultimate safety net.
    Snapshots live under ``data/backoffice/backups/files/<rel-path>/<utc>.bak``
    and are pruned to the newest :data:`MAX_BACKUPS_PER_FILE` per file.
    """
    try:
        path = Path(path)
        if not path.is_file():
            return None
        root = (repo_root or find_repo_root()).resolve()
        resolved = path.resolve()
        try:
            rel = resolved.relative_to(root)
        except ValueError:
            return None
        bdir = backup_root(root)
        if bdir in resolved.parents:
            return None
        target_dir = bdir / "files" / rel.as_posix()
        target_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S-%fZ")
        target = target_dir / f"{stamp}.bak"
        target.write_bytes(resolved.read_bytes())
        _prune_backups(target_dir)
        return target
    except Exception:
        return None


def _prune_backups(target_dir: Path) -> None:
    snapshots = sorted(target_dir.glob("*.bak"))
    for stale in snapshots[:-MAX_BACKUPS_PER_FILE]:
        try:
            stale.unlink()
        except OSError:
            pass


def backup_tree(dir_path: Path, repo_root: Path | None = None) -> Path | None:
    """Zip an entire directory before a destructive delete (dossier/scaffold).

    Snapshots land under ``data/backoffice/backups/trees/<rel-path>/<utc>.zip``
    and can be restored from the Återställning page. Non-fatal on failure —
    returns ``None`` and lets the caller continue (git remains the ultimate
    safety net for tracked files).
    """
    try:
        dir_path = Path(dir_path)
        if not dir_path.is_dir():
            return None
        root = (repo_root or find_repo_root()).resolve()
        resolved = dir_path.resolve()
        try:
            rel = resolved.relative_to(root)
        except ValueError:
            return None
        bdir = backup_root(root)
        if bdir == resolved or bdir in resolved.parents:
            return None
        target_dir = bdir / "trees" / rel.as_posix()
        target_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S-%fZ")
        archive = shutil.make_archive(str(target_dir / stamp), "zip", root_dir=resolved)
        snapshots = sorted(target_dir.glob("*.zip"))
        for stale in snapshots[:-MAX_BACKUPS_PER_FILE]:
            try:
                stale.unlink()
            except OSError:
                pass
        return Path(archive)
    except Exception:
        return None


def list_backup_trees(repo_root: Path | None = None) -> list[dict[str, Any]]:
    """List every deleted/zipped directory that has at least one snapshot."""
    trees_root = backup_root(repo_root) / "trees"
    if not trees_root.is_dir():
        return []
    entries: list[dict[str, Any]] = []
    for dirpath, _dirnames, filenames in os.walk(trees_root):
        snaps = sorted(n for n in filenames if n.endswith(".zip"))
        if not snaps:
            continue
        rel = Path(dirpath).relative_to(trees_root).as_posix()
        entries.append(
            {
                "dir": rel,
                "snapshots": len(snaps),
                "latest": snaps[-1].removesuffix(".zip"),
            }
        )
    entries.sort(key=lambda e: str(e["latest"]), reverse=True)
    return entries


def list_tree_snapshots_for(rel_path: str, repo_root: Path | None = None) -> list[Path]:
    target_dir = backup_root(repo_root) / "trees" / rel_path
    if not target_dir.is_dir():
        return []
    return sorted(target_dir.glob("*.zip"), reverse=True)


def restore_tree(
    rel_path: str,
    snapshot: Path,
    repo_root: Path | None = None,
) -> tuple[bool, str]:
    """Restore a zipped directory snapshot onto its original repo path.

    Fails closed on both sides: the zip is unpacked to a temp sibling FIRST
    (so a corrupt archive never destroys the live directory), and if the
    directory currently exists it must be successfully zipped (undo-snapshot)
    before it is replaced.
    """
    root = (repo_root or find_repo_root()).resolve()
    target = (root / rel_path).resolve()
    try:
        target.relative_to(root)
    except ValueError:
        return False, f"Sökvägen ligger utanför repot: `{rel_path}` — inget återställdes."
    snapshot = Path(snapshot)
    if not snapshot.is_file():
        return False, f"Snapshoten finns inte längre: `{snapshot.name}`."
    expected_dir = (backup_root(root) / "trees" / rel_path).resolve()
    if snapshot.resolve().parent != expected_dir:
        return False, "Snapshoten hör inte till den valda katalogen — inget återställdes."

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S-%fZ")
    tmp_extract = target.parent / f".restore-tmp-{stamp}"
    old_aside = target.parent / f".restore-old-{stamp}"
    moved_old = False
    try:
        # 1) Validera zipen genom att packa upp till en temp-syskonkatalog
        #    (samma filsystem → atomiskt rename-swap nedan).
        tmp_extract.mkdir(parents=True, exist_ok=False)
        shutil.unpack_archive(str(snapshot), extract_dir=str(tmp_extract), format="zip")
        # 2) Snapshota nuvarande katalog (ångringsbart) — fail-closed.
        if target.is_dir():
            if backup_tree(target, root) is None:
                return False, (
                    "Kunde inte säkerhetskopiera katalogens nuvarande innehåll — "
                    "avbryter återställningen utan att röra katalogen."
                )
            # Flytta undan (radera INTE) den levande katalogen så att den kan
            # rullas tillbaka om swappen nedan misslyckas. Annars finns ett
            # fönster där varken gammalt eller nytt innehåll ligger på den
            # levande sökvägen (rename kan fela efter rmtree).
            target.rename(old_aside)
            moved_old = True
        # 3) Swappa in det uppackade innehållet.
        tmp_extract.rename(target)
    except (OSError, shutil.Error, ValueError) as exc:
        # Rulla tillbaka: lägg tillbaka den undanflyttade katalogen om swappen
        # aldrig landade, så den levande sökvägen aldrig blir tom.
        if moved_old and not target.exists() and old_aside.is_dir():
            try:
                old_aside.rename(target)
            except OSError:
                # Rollbacken failade också. LÄMNA old_aside kvar — den håller
                # det enda nära-live-innehållet (finns även som undo-snapshot-
                # zip). Radera den ALDRIG här, annars förloras katalogen.
                return False, (
                    f"Kunde inte återställa: {exc}. Nuvarande innehåll ligger "
                    f"kvar i `{old_aside.name}` och som zip-snapshot — "
                    "inget raderades permanent."
                )
        return False, f"Kunde inte återställa: {exc}"
    finally:
        # Endast den disponibla temp-uppackningen städas ovillkorligt; källzipen
        # finns alltid kvar. old_aside städas nedan, men BARA på success-vägen.
        if tmp_extract.is_dir():
            shutil.rmtree(tmp_extract, ignore_errors=True)
    # Lyckad swap: old_aside är det överspelade gamla innehållet (redan zippat
    # som undo-snapshot ovan) → säkert att städa.
    if old_aside.is_dir():
        shutil.rmtree(old_aside, ignore_errors=True)
    return True, f"Återställde katalogen `{rel_path}` från `{snapshot.name}`."


def list_backup_files(repo_root: Path | None = None) -> list[dict[str, Any]]:
    """List every repo file that has at least one snapshot, newest first."""
    files_root = backup_root(repo_root) / "files"
    if not files_root.is_dir():
        return []
    entries: list[dict[str, Any]] = []
    for dirpath, _dirnames, filenames in os.walk(files_root):
        snaps = sorted(n for n in filenames if n.endswith(".bak"))
        if not snaps:
            continue
        rel = Path(dirpath).relative_to(files_root).as_posix()
        entries.append(
            {
                "file": rel,
                "snapshots": len(snaps),
                "latest": snaps[-1].removesuffix(".bak"),
            }
        )
    entries.sort(key=lambda e: str(e["latest"]), reverse=True)
    return entries


def list_snapshots_for(rel_path: str, repo_root: Path | None = None) -> list[Path]:
    """Snapshots for one repo-relative file, newest first."""
    target_dir = backup_root(repo_root) / "files" / rel_path
    if not target_dir.is_dir():
        return []
    return sorted(target_dir.glob("*.bak"), reverse=True)


def restore_backup(
    rel_path: str,
    snapshot: Path,
    repo_root: Path | None = None,
) -> tuple[bool, str]:
    """Restore one snapshot onto its original repo file.

    The current file content is snapshotted first, so a restore is itself
    undoable. Fails closed: if that pre-restore snapshot cannot be taken the
    restore is aborted, so the current content is never silently lost.
    Returns ``(ok, message)``.
    """
    root = (repo_root or find_repo_root()).resolve()
    target = (root / rel_path).resolve()
    try:
        target.relative_to(root)
    except ValueError:
        return False, f"Sökvägen ligger utanför repot: `{rel_path}` — inget återställdes."
    snapshot = Path(snapshot)
    if not snapshot.is_file():
        return False, f"Snapshoten finns inte längre: `{snapshot.name}`."
    expected_dir = (backup_root(root) / "files" / rel_path).resolve()
    if snapshot.resolve().parent != expected_dir:
        return False, "Snapshoten hör inte till den valda filen — inget återställdes."
    # Läs snapshotens innehåll INNAN backup_file() körs: den snapshotar
    # nuvarande innehåll och prunar sedan till MAX_BACKUPS_PER_FILE. Har filen
    # redan max antal snapshots kan pruningen radera just den .bak vi återställer
    # från (den äldsta) innan vi hinner läsa den. Läs bytesen först.
    try:
        snapshot_bytes = snapshot.read_bytes()
    except OSError as exc:
        return False, f"Kunde inte läsa snapshoten: {exc}"
    if target.is_file() and backup_file(target, root) is None:
        return False, (
            "Kunde inte säkerhetskopiera filens nuvarande innehåll — "
            "avbryter återställningen utan att röra filen."
        )
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(snapshot_bytes)
    except OSError as exc:
        return False, f"Kunde inte återställa: {exc}"
    return True, f"Återställde `{rel_path}` från `{snapshot.name}`."
