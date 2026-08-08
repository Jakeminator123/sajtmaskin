from __future__ import annotations

# --- Fältetiketter: ett språk per fält ----------------------------------------
# Samma manifest-/variantfält renderades tidigare med engelsk etikett i
# `scaffold_lifecycle.py` och `scaffold_wizard.py` men svensk i `scaffolds.py`,
# så operatören mötte två namn på samma sak. Kanoniskt namn bor här, den
# tekniska nyckeln följer alltid med i parentes så den som läser schemat eller
# `manifest.ts` hittar tillbaka. `backoffice/test_scaffold_lifecycle_ui.py`
# grindar att ytorna använder tabellen i stället för egna strängar.
FIELD_LABELS: dict[str, str] = {
    "scaffoldId": "Scaffold",
    "label": "Namn",
    "description": "Beskrivning",
    "tags": "Matchord",
    "keywords": "Matchord",
    "promptHints": "Instruktioner till own-engine",
    "qualityChecklist": "Kvalitetskrav",
    "allowedBuildIntents": "Får användas för",
    "siteKind": "Typ av sajt",
    "complexity": "Komplexitet",
    "structureProfile": "Struktur",
    "contentProfile": "Innehåll",
    "features": "Funktioner",
    "upgradeTargets": "Förbättringsmål",
    "signatureMotif": "Visuellt signum",
    "colorMode": "Ljus eller mörk",
    "fontPairings": "Typsnittspar",
    "themeTokens": "Färg-/formvärden",
    "signaturePatterns.layouts": "Signaturmönster – layouter",
    "signaturePatterns.motifs": "Signaturmönster – motiv",
    "signaturePatterns.antiPatterns": "Signaturmönster – undvik",
    "styleRules": "Stilregler",
    "sectionInventory": "Sektionslista",
    "avoidPatterns": "Undvik",
    "worldClassRubric": "Kvalitetsribba",
    "sourceTemplateIds": "Inspirationskällor",
    "referenceScaffoldIds": "Referens-scaffolds",
    "default": "Standardvariant",
    # Dossier-/byggblocksfält (Fas C) — svenska UI-ord ur docs/architecture/glossary.md.
    "id": "Tekniskt ID",
    "capability": "Funktion",
    "summary": "Sammanfattning",
    "summarySv": "Svensk katalogtext",
    "codeFidelity": "Kodtrohet",
    "defaultForCapability": "Standardval",
    "mock": "Demoläge",
    "lastVerified": "Senast verifierad",
}


def field_label(key: str, *, hint: str = "") -> str:
    """Svensk etikett för ett scaffold-/variantfält, teknisk nyckel i parentes.

    ``field_label("tags", hint="en per rad")`` → ``Matchord, en per rad (`tags`)``.
    Okänd nyckel höjer ``KeyError`` i stället för att tyst rendera den råa
    nyckeln, så en felstavning syns direkt i stället för att bli UI-copy.
    """
    if key not in FIELD_LABELS:
        raise KeyError(
            f"Okänt fält {key!r} — lägg till det i FIELD_LABELS i stället för att "
            "skriva en egen etikettsträng."
        )
    label = FIELD_LABELS[key]
    prefix = f"{label}, {hint}" if hint else label
    return f"{prefix} (`{key}`)"
