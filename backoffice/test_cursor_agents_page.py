from __future__ import annotations

import unittest

from backoffice.pages.cursor_agents import CURSOR_AGENT_DOCUMENTS, CURSOR_AGENT_PAGE_EDITABLE


class CursorAgentsPageContractTest(unittest.TestCase):
    def test_page_lists_canonical_human_docs_not_thin_rule_router(self) -> None:
        paths = [path for path, _label in CURSOR_AGENT_DOCUMENTS]

        self.assertIn("docs/architecture/glossary.md", paths)
        self.assertIn("AGENTS.md", paths)
        self.assertIn(".cursor/README.md", paths)
        self.assertIn("docs/architecture/code-map.md", paths)
        self.assertNotIn(".cursor/rules/terminology.mdc", paths)

    def test_page_is_read_only_like_domain_map_and_policy_registry(self) -> None:
        self.assertFalse(CURSOR_AGENT_PAGE_EDITABLE)


if __name__ == "__main__":
    unittest.main()
