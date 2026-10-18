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

if __name__ == "__main__":
    unittest.main()
