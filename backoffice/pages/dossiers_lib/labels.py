from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .constants import CAPABILITY_MAP_PATH


def _load_projection(path: Path | None = None) -> dict[str, Any] | None:
    """Read the CI-gated capability-map projection. Never invents facts."""
    target = path or CAPABILITY_MAP_PATH
    try:
        raw = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return raw if isinstance(raw, dict) else None


def _axis_label(entry: Any) -> str:
    if isinstance(entry, dict):
        return str(entry.get("label") or "").strip()
    if isinstance(entry, str):
        return entry.strip()
    return ""


def _labels_sv_vocab(projection: dict[str, Any] | None = None) -> dict[str, Any]:
    data = projection if projection is not None else _load_projection()
    if not data:
        return {}
    labels = data.get("labelsSv")
    return labels if isinstance(labels, dict) else {}


def class_label(klass: str, *, projection: dict[str, Any] | None = None) -> str:
    """Svensk etikett för dossier-klassen, tekniskt värde i parentes:
    ``class_label("hard")`` → ``Kopplad (hard)``.

    Läses ur projektionens ``labelsSv.class``. Saknas/ trasig projektion eller
    okänt värde → rått tekniskt värde (aldrig gissa svenska ord).
    """
    vocab = _labels_sv_vocab(projection).get("class")
    label = ""
    if isinstance(vocab, dict):
        label = _axis_label(vocab.get(klass))
    if not label:
        return str(klass)
    return f"{label} ({klass})"


def mock_label(mock: str | None, *, projection: dict[str, Any] | None = None) -> str:
    """Svensk etikett för demoläget (`mock`), tekniskt värde i parentes.
    Utelämnat fält räknas som `none`, precis som i runtime.

    Läses ur projektionens ``labelsSv.mock``. Saknas etikett → rått värde.
    """
    value = (mock or "none").strip() or "none"
    vocab = _labels_sv_vocab(projection).get("mock")
    label = ""
    if isinstance(vocab, dict):
        label = _axis_label(vocab.get(value))
    if not label:
        return str(value)
    return f"{label} ({value})"


def _requires_f3_from_manifest(manifest: dict[str, Any]) -> bool:
    """Lokal draft-regel för OSPARADE manifest-utkast som ännu inte finns i
    projektionen. Speglar ``dossierRequiresF3()`` i types.ts (build-nyckel
    ELLER serverfil). Sparade dossiers ska i stället läsa
    ``buildServerRequirement`` ur projektionen via ``requires_f3``.
    """
    for env in manifest.get("envVars") or []:
        if isinstance(env, dict) and (env.get("enforcement") or "build") == "build":
            return True
    for file_entry in manifest.get("files") or []:
        if isinstance(file_entry, dict) and file_entry.get("role") == "server":
            return True
    return False


def requires_f3(
    manifest: dict[str, Any],
    *,
    projection: dict[str, Any] | None = None,
) -> bool:
    """Kräver byggblocket ett eget F3-steg ("Bygg integrationer")?

    Sparade dossiers (id finns i projektionen): läs ``buildServerRequirement``.
    Osparta utkast / id som saknas i projektionen: använd den lokala
    draft-regeln ``_requires_f3_from_manifest`` — utkastet finns ännu inte i
    den CI-grindade projektionen, så det finns ingen fakta att läsa.

    **Obs:** detta är en egen axel — den följer varken av Kopplad/Fristående
    eller av demoläget.
    """
    dossier_id = str(manifest.get("id") or "").strip()
    data = projection if projection is not None else _load_projection()
    if dossier_id and data:
        for entry in data.get("dossiers") or []:
            if not isinstance(entry, dict):
                continue
            if str(entry.get("id") or "") != dossier_id:
                continue
            return entry.get("buildServerRequirement") is True
    return _requires_f3_from_manifest(manifest)


def is_default_for_capability(manifest: dict[str, Any] | None) -> bool:
    """Strikt ``defaultForCapability is True`` — samma regel som valideraren.

    ``scripts/dossiers/validate-all.ts:117`` räknar bara ``=== true``, och
    rå-JSON-vägens medvetet lättare kedja kan lägga en sträng i fältet.
    ``"false"`` är truthy i Python, så en falsy-koll gör UI:t och grindarna
    osanna åt olika håll: listan visar en bock som CI inte ser, och kryssrutan
    renderas ikryssad så nästa sparning skriver ett äkta ``true``. Läs fältet
    genom denna hjälpare, aldrig med en rå truthiness-koll.
    """
    return (manifest or {}).get("defaultForCapability") is True
