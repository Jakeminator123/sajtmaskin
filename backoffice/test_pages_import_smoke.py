"""Smoke-test: alla backoffice-sidor importerar utan fel + har callable render().

Bakgrund: backoffice/pages/__init__.py listar sidorna i PAGE_SPECS (antalet växer
över tid — läs `len(PAGE_SPECS)` för aktuell siffra, hårdkoda den inte här). När
någon flyttar en helper, splittar en monolit eller döper om en `BackofficeContext`-attribut
är det alldeles för lätt att en sida bryter import-tid utan att vi märker det
förrän operatören klickar in på fliken i Streamlit.

Det här testet importerar varje page-modul registrerad i PAGE_SPECS och
verifierar att render-funktionen är callable. Det renderar inte UI:t (det
kräver Streamlit-runtime), bara import + symbol-närvaro.

Speglar mönstret i test_database_health_smoke.py.
"""

from __future__ import annotations

import importlib
import unittest

from backoffice.pages import PAGE_SPECS


class AllPagesImportSmokeTests(unittest.TestCase):
    def test_every_registered_page_module_imports(self) -> None:
        """Verifierar att render-funktionen i varje PageSpec är callable.

        PAGE_SPECS importerar redan alla page-moduler i `backoffice/pages/__init__.py`,
        så om någon page failar import kommer det att kasta innan testet ens
        startar. Det är OK — då vet vi exakt var problemet ligger.
        """
        failures: list[str] = []
        for spec in PAGE_SPECS:
            if not callable(spec.render):
                failures.append(f"PageSpec '{spec.name}' har icke-callable render: {spec.render!r}")
        self.assertEqual(failures, [], "Vissa backoffice-sidor saknar callable render()")

    def test_ops_pages_have_real_implementations(self) -> None:
        """Efter splitten 2026-04-24 är ops-sidorna riktiga implementationer,
        inte längre thin wrappers kring `_ops_impl.render_ops_page`.

        Vi verifierar att render-funktionen i varje ops-page bor i page-modulen
        själv, inte i något centralt `_ops_impl`. Skyddar mot regress där
        någon återinför en monolit-dispatcher."""
        ops_modules = [
            "backoffice.pages.scaffolds",
            "backoffice.pages.eval_page",
            "backoffice.pages.orchestration",
            "backoffice.pages.autofix",
            "backoffice.pages.restore",
        ]
        for module_name in ops_modules:
            module = importlib.import_module(module_name)
            self.assertTrue(
                callable(getattr(module, "render", None)),
                f"{module_name} saknar callable render",
            )
            # Render-funktionen ska bo i modulen själv
            self.assertEqual(
                module.render.__module__,
                module_name,
                f"{module_name}.render verkar peka på {module.render.__module__} (förväntat: {module_name})",
            )

    def test_ops_impl_module_is_gone(self) -> None:
        """`_ops_impl.py` togs bort 2026-04-24. Om det kommer tillbaka,
        misstänk att någon återinförde monolit-mönstret."""
        with self.assertRaises(ModuleNotFoundError):
            importlib.import_module("backoffice.pages._ops_impl")


if __name__ == "__main__":
    unittest.main()
