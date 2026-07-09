# Scaffold Wizard drafts

AI-genererade **utkast** från backoffice-sidan *Scaffold Wizard*
(`backoffice/pages/scaffold_wizard.py`). Varje fil är ett persona-utkast
(mall-id, persona, modell, förslag på variant/scaffold) som sparas här innan
operatören godkänner något i wizardens valideringssteg.

- Innehållet är **aldrig runtime** — riktiga varianter bor i
  `config/scaffold-variants/` och scaffolds i `src/lib/gen/scaffolds/`.
- Allt utom denna README är gitignorerat; utkast är lokala arbetsfiler och
  kan raderas fritt.
