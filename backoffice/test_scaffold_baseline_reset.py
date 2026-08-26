"""Guards for the scaffold baseline factory-reset (A#3).

Covers the data-loss / correctness fixes:
  * transactional ordering — `git restore` runs BEFORE any file is deleted, so a
    restore failure never leaves files-added-since-baseline unrecoverably gone;
  * HEAD-delta detection — commits after the baseline that touch scaffold
    surfaces are reported (a later commit from a reset state would orphan them);
  * happy path — modified files revert to the tag and added files are removed.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from backoffice.pages import scaffold_lifecycle as sl

# Inherited git identity vars point a child `git` at another checkout. Tests
# that init a throwaway repo must drop them, or `git config`/`commit` can write
# the parent worktree's config.
_GIT_ISOLATION_UNSET = (
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_COMMON_DIR",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
)


def _git(repo: Path, *args: str) -> None:
    env = os.environ.copy()
    for key in _GIT_ISOLATION_UNSET:
        env.pop(key, None)
    argv = ["git"]
    if args[:1] == ("commit",):
        argv.extend(("-c", "user.name=Test", "-c", "user.email=test@example.com"))
    argv.extend(args)
    subprocess.run(argv, cwd=str(repo), check=True, capture_output=True, text=True, env=env)


def _seed_baseline_repo(repo: Path) -> None:
    """Init a repo with a file under every BASELINE_PATH and tag the baseline."""
    _git(repo, "init")
    for rel in sl.BASELINE_PATHS:
        target = repo / rel
        # A trailing-less BASELINE_PATH may be a dir (scaffolds/variants) or a
        # concrete file (schema json). Seed a file either way.
        if target.suffix:  # looks like a file path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("{}\n", encoding="utf-8")
        else:
            target.mkdir(parents=True, exist_ok=True)
            (target / "base.txt").write_text("v1\n", encoding="utf-8")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-m", "baseline")
    _git(repo, "tag", sl.BASELINE_TAG)


@unittest.skipUnless(shutil.which("git"), "git required")
class BaselineResetTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.mkdtemp(prefix="baseline-reset-")
        self.repo = Path(self._tmp)
        self.ctx = SimpleNamespace(repo_root=self.repo)
        _seed_baseline_repo(self.repo)
        self.scaffolds = self.repo / "src" / "lib" / "gen" / "scaffolds"

    def tearDown(self) -> None:
        shutil.rmtree(self._tmp, ignore_errors=True)

    def test_happy_path_reverts_modified_and_removes_added(self) -> None:
        base = self.scaffolds / "base.txt"
        base.write_text("v2-experiment\n", encoding="utf-8")
        added_untracked = self.scaffolds / "untracked.txt"
        added_untracked.write_text("scratch\n", encoding="utf-8")
        added_staged = self.scaffolds / "staged.txt"
        added_staged.write_text("staged\n", encoding="utf-8")
        _git(self.repo, "add", "src/lib/gen/scaffolds/staged.txt")

        sl._factory_reset_to_baseline(self.ctx)

        self.assertEqual(base.read_text(encoding="utf-8"), "v1\n")
        self.assertFalse(added_untracked.exists(), "untracked file should be removed")
        self.assertFalse(added_staged.exists(), "added-since-baseline file should be removed")

    def test_head_delta_lists_post_baseline_scaffold_commits(self) -> None:
        # No delta right after tagging.
        self.assertEqual(sl._baseline_head_delta(self.ctx), [])

        # A commit that touches a scaffold surface must be reported.
        (self.scaffolds / "base.txt").write_text("committed-change\n", encoding="utf-8")
        _git(self.repo, "add", "-A")
        _git(self.repo, "commit", "-m", "post-baseline scaffold change")
        delta = sl._baseline_head_delta(self.ctx)
        self.assertEqual(len(delta), 1, f"expected one delta commit, got {delta}")

        # A commit OUTSIDE the scaffold surfaces must NOT be reported.
        (self.repo / "unrelated.txt").write_text("x\n", encoding="utf-8")
        _git(self.repo, "add", "-A")
        _git(self.repo, "commit", "-m", "unrelated change")
        self.assertEqual(
            len(sl._baseline_head_delta(self.ctx)), 1, "unrelated commit must not count"
        )

    def test_restore_failure_deletes_nothing(self) -> None:
        """Transactional ordering: if `git restore` fails, no file is deleted."""
        keep = self.scaffolds / "keep.txt"
        keep.write_text("must-survive\n", encoding="utf-8")

        def fake_run_git(ctx, args, *, timeout: int = 60):  # noqa: ANN001, ARG001
            if args[:1] == ["restore"]:
                return 1, "simulated restore failure"
            if args[:1] == ["ls-files"]:
                return 0, "src/lib/gen/scaffolds/keep.txt"
            # diff/name-status and everything else: clean.
            return 0, ""

        with mock.patch.object(sl, "_run_git", side_effect=fake_run_git):
            with self.assertRaises(RuntimeError):
                sl._factory_reset_to_baseline(self.ctx)

        self.assertTrue(keep.exists(), "restore failed → nothing may be deleted")

    def _backups_for(self, rel: str) -> list[Path]:
        bdir = self.repo / "data" / "backoffice" / "backups" / "files" / rel
        return sorted(bdir.glob("*.bak")) if bdir.is_dir() else []

    def test_backup_taken_before_delete(self) -> None:
        """Both doomed kinds get a snapshot with their pre-reset content.

        The untracked file is the one that existed nowhere else, which is what
        made the reset unrecoverable. The staged-but-uncommitted add matters too
        and is the subtle one: `git restore --staged --worktree` deletes it
        itself, before the unlink loop ever sees it — so the snapshot has to be
        taken before the restore, not merely before the unlink.
        """
        untracked = self.scaffolds / "untracked.txt"
        untracked.write_text("scratch\n", encoding="utf-8")
        staged = self.scaffolds / "staged.txt"
        staged.write_text("staged\n", encoding="utf-8")
        _git(self.repo, "add", "src/lib/gen/scaffolds/staged.txt")

        sl._factory_reset_to_baseline(self.ctx)

        for rel, content in (
            ("src/lib/gen/scaffolds/untracked.txt", "scratch\n"),
            ("src/lib/gen/scaffolds/staged.txt", "staged\n"),
        ):
            backups = self._backups_for(rel)
            self.assertEqual(len(backups), 1, f"expected one snapshot of {rel}, got {backups}")
            self.assertEqual(
                backups[0].read_text(encoding="utf-8"),
                content,
                f"snapshot of {rel} must hold the pre-delete content",
            )

        self.assertFalse(untracked.exists(), "file should still be gone from the worktree")
        self.assertFalse(staged.exists(), "file should still be gone from the worktree")

    def test_backup_failure_aborts_without_deleting_or_restoring(self) -> None:
        """Fail-closed: no snapshot → nothing happens at all, restore included."""
        modified = self.scaffolds / "base.txt"
        modified.write_text("v2-experiment\n", encoding="utf-8")
        untracked = self.scaffolds / "untracked.txt"
        untracked.write_text("scratch\n", encoding="utf-8")
        staged = self.scaffolds / "staged.txt"
        staged.write_text("staged\n", encoding="utf-8")
        _git(self.repo, "add", "src/lib/gen/scaffolds/staged.txt")

        with mock.patch.object(sl, "backup_file", return_value=None):
            with self.assertRaises(RuntimeError):
                sl._factory_reset_to_baseline(self.ctx)

        self.assertTrue(untracked.exists(), "backup failed → nothing may be deleted")
        self.assertTrue(staged.exists(), "backup failed → nothing may be deleted")
        self.assertEqual(
            modified.read_text(encoding="utf-8"),
            "v2-experiment\n",
            "backup failed → the restore must not have run either",
        )

    def test_non_ascii_filenames_are_backed_up(self) -> None:
        """Swedish filenames must not fall through the backup pass.

        Git's default `core.quotePath` would report `rädd.txt` as
        `"r\\303\\244dd.txt"`, and `text=True` without an explicit encoding would
        decode git's UTF-8 as cp1252 on Swedish Windows. Both produce a path that
        does not exist, so the file was silently skipped by the backup pass and
        then deleted for real by `git restore` / the unlink loop.
        """
        untracked = self.scaffolds / "rädd-ospårad.txt"
        untracked.write_text("ospårad\n", encoding="utf-8")
        staged = self.scaffolds / "ändrad-stagead.txt"
        staged.write_text("stagead\n", encoding="utf-8")
        _git(self.repo, "add", "--", "src/lib/gen/scaffolds/ändrad-stagead.txt")

        sl._factory_reset_to_baseline(self.ctx)

        for rel, content in (
            ("src/lib/gen/scaffolds/rädd-ospårad.txt", "ospårad\n"),
            ("src/lib/gen/scaffolds/ändrad-stagead.txt", "stagead\n"),
        ):
            backups = self._backups_for(rel)
            self.assertEqual(len(backups), 1, f"expected one snapshot of {rel}, got {backups}")
            self.assertEqual(backups[0].read_text(encoding="utf-8"), content)

        self.assertFalse(untracked.exists())
        self.assertFalse(staged.exists())

    def test_missing_listed_file_aborts_instead_of_skipping(self) -> None:
        """A path git listed but that is not on disk must abort, not be skipped.

        That is the shape any future quoting/encoding gap takes, and skipping it
        is what made the recovery promise false.
        """
        keep = self.scaffolds / "keep.txt"
        keep.write_text("must-survive\n", encoding="utf-8")

        def fake_run_git(ctx, args, *, timeout: int = 60):  # noqa: ANN001, ARG001
            if args[:1] == ["ls-files"]:
                return 0, "src/lib/gen/scaffolds/does-not-exist.txt"
            return 0, ""

        with mock.patch.object(sl, "_run_git", side_effect=fake_run_git):
            with self.assertRaises(RuntimeError):
                sl._factory_reset_to_baseline(self.ctx)

        self.assertTrue(keep.exists(), "abort must not delete anything")

    def test_a_later_backup_failure_leaves_earlier_files_alone(self) -> None:
        """Why the snapshot pass is separate from the delete pass.

        A per-file backup-then-delete loop would already have destroyed the
        first file when the second one's snapshot fails. The whole surface must
        still be intact instead.
        """
        first = self.scaffolds / "aaa-first.txt"
        first.write_text("first\n", encoding="utf-8")
        second = self.scaffolds / "zzz-second.txt"
        second.write_text("second\n", encoding="utf-8")

        real_backup = sl.backup_file
        calls: list[str] = []

        def flaky_backup(path, repo_root=None):  # noqa: ANN001
            calls.append(Path(path).name)
            # Fail on the LAST file, after the first one was already snapshotted.
            if Path(path).name == "zzz-second.txt":
                return None
            return real_backup(path, repo_root)

        with mock.patch.object(sl, "backup_file", side_effect=flaky_backup):
            with self.assertRaises(RuntimeError):
                sl._factory_reset_to_baseline(self.ctx)

        self.assertIn("aaa-first.txt", calls)
        self.assertTrue(first.exists(), "an earlier file must not be deleted already")
        self.assertTrue(second.exists(), "the failing file must not be deleted")

    def test_inherited_git_dir_cannot_write_parent_config(self) -> None:
        """An inherited GIT_DIR at the parent checkout must not receive config writes."""
        parent_tmp = tempfile.mkdtemp(prefix="baseline-parent-")
        parent = Path(parent_tmp)
        try:
            _git(parent, "init")
            parent_config = parent / ".git" / "config"
            before = parent_config.read_text(encoding="utf-8")
            inherited = {
                "GIT_DIR": str(parent / ".git"),
                "GIT_WORK_TREE": str(parent),
                "GIT_COMMON_DIR": str(parent / ".git"),
                "GIT_INDEX_FILE": str(parent / ".git" / "index"),
                "GIT_OBJECT_DIRECTORY": str(parent / ".git" / "objects"),
                "GIT_ALTERNATE_OBJECT_DIRECTORIES": str(parent / ".git" / "objects"),
            }
            with mock.patch.dict(os.environ, inherited, clear=False):
                _git(self.repo, "config", "sajtmaskin.testLeak", "1")
                (self.repo / "leak-probe.txt").write_text("x\n", encoding="utf-8")
                _git(self.repo, "add", "-A")
                _git(self.repo, "commit", "-m", "leak probe")

            after = parent_config.read_text(encoding="utf-8")
            self.assertEqual(before, after, "parent .git/config must stay untouched")
            self.assertNotIn("testLeak", after)
            child_config = (self.repo / ".git" / "config").read_text(encoding="utf-8")
            self.assertIn("[sajtmaskin]", child_config)
            self.assertIn("testLeak", child_config)
        finally:
            shutil.rmtree(parent_tmp, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
