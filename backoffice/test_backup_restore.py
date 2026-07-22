"""Tester för backoffice säkerhetskopierings-/återställningslager (shared.py).

Skyddet: varje sparning via ``write_text``/``write_json`` snapshotar först den
befintliga filen till ``data/backoffice/backups/files/...``; destruktiva
katalog-raderingar zippas till ``data/backoffice/backups/trees/...``.
Återställning skriver tillbaka snapshoten och snapshotar i sin tur nuvarande
innehåll, så en restore är ångringsbar. Testerna kör mot en tmp-repo-root
(markörfilen ``config/codegen-core-manifest.json`` krävs inte eftersom
``repo_root`` skickas explicit).
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from backoffice.shared import (
    MAX_BACKUPS_PER_FILE,
    backup_file,
    backup_root,
    backup_tree,
    list_backup_files,
    list_backup_trees,
    list_snapshots_for,
    list_tree_snapshots_for,
    restore_backup,
    restore_tree,
)


class BackupFileTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_backup_and_restore_roundtrip(self) -> None:
        target = self.root / "config" / "example.json"
        target.parent.mkdir(parents=True)
        target.write_text('{"v": 1}\n', encoding="utf-8")

        snap = backup_file(target, self.root)
        self.assertIsNotNone(snap)
        assert snap is not None
        self.assertTrue(snap.is_file())
        self.assertEqual(snap.read_text(encoding="utf-8"), '{"v": 1}\n')

        target.write_text('{"v": 2}\n', encoding="utf-8")
        ok, message = restore_backup("config/example.json", snap, self.root)
        self.assertTrue(ok, message)
        self.assertEqual(target.read_text(encoding="utf-8"), '{"v": 1}\n')

        # Restore snapshottar i sin tur det tidigare innehållet ("v": 2).
        snapshots = list_snapshots_for("config/example.json", self.root)
        contents = {s.read_text(encoding="utf-8") for s in snapshots}
        self.assertIn('{"v": 2}\n', contents)

    def test_backup_missing_file_returns_none(self) -> None:
        self.assertIsNone(backup_file(self.root / "does-not-exist.txt", self.root))

    def test_backup_outside_repo_returns_none(self) -> None:
        with tempfile.TemporaryDirectory() as other:
            outside = Path(other) / "x.txt"
            outside.write_text("x", encoding="utf-8")
            self.assertIsNone(backup_file(outside, self.root))

    def test_backup_of_backup_dir_is_skipped(self) -> None:
        inner = backup_root(self.root) / "files" / "a" / "b.bak"
        inner.parent.mkdir(parents=True)
        inner.write_text("x", encoding="utf-8")
        self.assertIsNone(backup_file(inner, self.root))

    def test_prune_keeps_newest_snapshots(self) -> None:
        target = self.root / "note.txt"
        for i in range(MAX_BACKUPS_PER_FILE + 5):
            target.write_text(f"v{i}", encoding="utf-8")
            self.assertIsNotNone(backup_file(target, self.root))
        snapshots = list_snapshots_for("note.txt", self.root)
        self.assertEqual(len(snapshots), MAX_BACKUPS_PER_FILE)

    def test_restore_rejects_foreign_snapshot(self) -> None:
        target_a = self.root / "a.txt"
        target_a.write_text("a", encoding="utf-8")
        snap_a = backup_file(target_a, self.root)
        assert snap_a is not None
        target_b = self.root / "b.txt"
        target_b.write_text("b", encoding="utf-8")
        ok, _message = restore_backup("b.txt", snap_a, self.root)
        self.assertFalse(ok)
        self.assertEqual(target_b.read_text(encoding="utf-8"), "b")

    def test_restore_rejects_path_outside_repo(self) -> None:
        target = self.root / "a.txt"
        target.write_text("a", encoding="utf-8")
        snap = backup_file(target, self.root)
        assert snap is not None
        ok, _message = restore_backup("../escape.txt", snap, self.root)
        self.assertFalse(ok)

    def test_list_backup_files_reports_entries(self) -> None:
        target = self.root / "config" / "x.json"
        target.parent.mkdir(parents=True)
        target.write_text("{}", encoding="utf-8")
        backup_file(target, self.root)
        entries = list_backup_files(self.root)
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["file"], "config/x.json")
        self.assertEqual(entries[0]["snapshots"], 1)


class BackupTreeTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.dossier = self.root / "data" / "dossiers" / "hard" / "example"
        (self.dossier / "components").mkdir(parents=True)
        (self.dossier / "manifest.json").write_text('{"id": "example"}\n', encoding="utf-8")
        (self.dossier / "components" / "Widget.tsx").write_text("export {}\n", encoding="utf-8")

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_tree_backup_and_restore_roundtrip(self) -> None:
        snap = backup_tree(self.dossier, self.root)
        self.assertIsNotNone(snap)
        assert snap is not None
        self.assertTrue(snap.is_file())

        import shutil

        shutil.rmtree(self.dossier)
        self.assertFalse(self.dossier.exists())

        rel = "data/dossiers/hard/example"
        entries = list_backup_trees(self.root)
        self.assertEqual([e["dir"] for e in entries], [rel])
        zips = list_tree_snapshots_for(rel, self.root)
        self.assertEqual(len(zips), 1)

        ok, message = restore_tree(rel, zips[0], self.root)
        self.assertTrue(ok, message)
        self.assertEqual(
            (self.dossier / "manifest.json").read_text(encoding="utf-8"),
            '{"id": "example"}\n',
        )
        self.assertTrue((self.dossier / "components" / "Widget.tsx").is_file())

    def test_restore_over_existing_dir_snapshots_current_first(self) -> None:
        snap = backup_tree(self.dossier, self.root)
        assert snap is not None
        (self.dossier / "manifest.json").write_text('{"id": "changed"}\n', encoding="utf-8")

        rel = "data/dossiers/hard/example"
        zips = list_tree_snapshots_for(rel, self.root)
        ok, message = restore_tree(rel, zips[0], self.root)
        self.assertTrue(ok, message)
        self.assertEqual(
            (self.dossier / "manifest.json").read_text(encoding="utf-8"),
            '{"id": "example"}\n',
        )
        # Det ändrade innehållet zippades före återställningen.
        self.assertGreaterEqual(len(list_tree_snapshots_for(rel, self.root)), 2)

    def test_tree_backup_outside_repo_returns_none(self) -> None:
        with tempfile.TemporaryDirectory() as other:
            outside = Path(other) / "dir"
            outside.mkdir()
            self.assertIsNone(backup_tree(outside, self.root))

    def test_restore_tree_rejects_foreign_snapshot(self) -> None:
        snap = backup_tree(self.dossier, self.root)
        assert snap is not None
        ok, _message = restore_tree("data/dossiers/hard/other", snap, self.root)
        self.assertFalse(ok)


if __name__ == "__main__":
    unittest.main()
