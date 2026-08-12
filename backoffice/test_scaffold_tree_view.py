"""Tester för den diskdrivna scaffold-filträdsfliken."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from backoffice.pages.scaffolds import (
    _copy_tree_button_html,
    _discover_scaffold_trees,
    _format_scaffold_tree,
    _iter_tree_nodes,
)


class ScaffoldTreeDiscoveryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.scaffolds_dir = Path(self.temp_dir.name)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _create_demo_scaffold(self) -> None:
        root = self.scaffolds_dir / "demo"
        (root / "files" / "app" / "blog" / "[slug]").mkdir(parents=True)
        (root / "files" / "components").mkdir(parents=True)
        (root / "manifest.ts").write_text(
            'label: "Demo Blog",\nsiteKind: "editorial",\ncomplexity: "medium",\n',
            encoding="utf-8",
        )
        (root / "files" / "app" / "page.tsx").write_text(
            "export default function Page() {}",
            encoding="utf-8",
        )
        (root / "files" / "app" / "globals.css").write_text(":root {}", encoding="utf-8")
        (root / "files" / "app" / "blog" / "[slug]" / "page.tsx").write_text(
            "export default function Post() {}",
            encoding="utf-8",
        )
        (root / "files" / "components" / "site-header.tsx").write_text(
            "export function SiteHeader() {}",
            encoding="utf-8",
        )

    def test_discovers_manifest_metadata_and_actual_files(self) -> None:
        self._create_demo_scaffold()

        snapshots = _discover_scaffold_trees(self.scaffolds_dir)

        self.assertEqual(len(snapshots), 1)
        snapshot = snapshots[0]
        self.assertEqual(snapshot.scaffold_id, "demo")
        self.assertEqual(snapshot.label, "Demo Blog")
        self.assertEqual(snapshot.site_kind, "editorial")
        self.assertEqual(snapshot.complexity, "medium")
        self.assertEqual(snapshot.runtime_file_count, 4)
        self.assertEqual(snapshot.route_count, 2)
        self.assertEqual(snapshot.component_count, 1)
        self.assertIn("manifest.ts", snapshot.relative_paths)
        self.assertIn("files/app/blog/[slug]/page.tsx", snapshot.relative_paths)

    def test_skips_incomplete_scaffold_roots(self) -> None:
        incomplete = self.scaffolds_dir / "incomplete"
        incomplete.mkdir()
        (incomplete / "manifest.ts").write_text('label: "Incomplete"', encoding="utf-8")

        self.assertEqual(_discover_scaffold_trees(self.scaffolds_dir), [])

    def test_empty_or_missing_root_returns_empty_list(self) -> None:
        self.assertEqual(_discover_scaffold_trees(self.scaffolds_dir), [])
        self.assertEqual(_discover_scaffold_trees(self.scaffolds_dir / "missing"), [])


class ScaffoldTreeFormattingTests(unittest.TestCase):
    def test_plain_text_tree_preserves_nested_routes(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            scaffolds_dir = Path(temp_dir)
            root = scaffolds_dir / "demo"
            (root / "files" / "app" / "product" / "[id]").mkdir(parents=True)
            (root / "manifest.ts").write_text('label: "Demo"', encoding="utf-8")
            (root / "files" / "app" / "product" / "[id]" / "page.tsx").write_text(
                "export default function Product() {}",
                encoding="utf-8",
            )

            snapshot = _discover_scaffold_trees(scaffolds_dir)[0]
            copied = _format_scaffold_tree(snapshot)

        self.assertTrue(copied.startswith("demo/\n"))
        self.assertIn("product/", copied)
        self.assertIn("[id]/", copied)
        self.assertIn("page.tsx", copied)
        self.assertIn("manifest.ts", copied)

    def test_graph_nodes_carry_depth_and_full_path(self) -> None:
        nodes = list(_iter_tree_nodes(("files/app/page.tsx", "manifest.ts")))

        self.assertIn((0, "files", "files", True), nodes)
        self.assertIn((1, "app", "files/app", True), nodes)
        self.assertIn((2, "page.tsx", "files/app/page.tsx", False), nodes)
        self.assertIn((0, "manifest.ts", "manifest.ts", False), nodes)

    def test_copy_component_uses_browser_clipboard_with_fallback(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            scaffolds_dir = Path(temp_dir)
            root = scaffolds_dir / "demo"
            (root / "files" / "app").mkdir(parents=True)
            (root / "manifest.ts").write_text('label: "Demo"', encoding="utf-8")
            (root / "files" / "app" / "page.tsx").write_text(
                "export default function Page() {}",
                encoding="utf-8",
            )
            snapshot = _discover_scaffold_trees(scaffolds_dir)[0]

        component_html = _copy_tree_button_html(snapshot)
        self.assertIn("navigator.clipboard.writeText(value)", component_html)
        self.assertIn('document.execCommand("copy")', component_html)
        self.assertIn("Kopiera filträd", component_html)
        self.assertIn("page.tsx", component_html)


if __name__ == "__main__":
    unittest.main()
