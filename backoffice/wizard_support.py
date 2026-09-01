"""Support helpers for the Scaffold Wizard backoffice page.

The wizard turns a v0-mall (zip in Vercel Blob, listed in
``src/lib/templates/template-blob-manifest.json``) into a *draft* for either a
new scaffold-variant or a new scaffold + start variant. An OpenAI persona
(vision: still image + code excerpts) writes the draft; nothing is persisted
into ``config/`` or ``src/lib/gen/scaffolds/`` until the operator has passed
the validation checklist in the wizard's final step.

Design constraints:
- stdlib only (urllib, zipfile) + jsonschema which is already a backoffice dep.
- Zip contents are read **in memory** and size-capped — never extracted to
  disk and never executed.
- Missing OPENAI_API_KEY degrades gracefully: the wizard still works in
  manual mode.
"""

from __future__ import annotations

import io
import json
import os
import re
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path
from typing import Any

BLOB_MANIFEST_REL = "src/lib/templates/template-blob-manifest.json"
DRAFTS_DIR_REL = "data/scaffold-wizard-drafts"

# Caps so a hostile/bloated zip cannot blow up memory or the prompt.
MAX_ZIP_BYTES = 40 * 1024 * 1024
MAX_MEMBER_BYTES = 512 * 1024
MAX_TREE_ENTRIES = 250
MAX_EXCERPT_CHARS = 3500
MAX_TOTAL_EXCERPT_CHARS = 24000

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"

# Modellvalen ägs av `config/ai_models/manifest.json` och läses via
# `backoffice/ai_workloads.py` (Fas D) — ingen modell-id-lista i den här filen.
# Wizardens två poster (`..._persona` med vision, `..._guide` ren text) är
# separata med flit, och ingen av dem är `analyze_presentation_vision`.

KEY_FILE_PATTERNS = (
    re.compile(r"(^|/)package\.json$"),
    re.compile(r"(^|/)app/layout\.[jt]sx?$"),
    re.compile(r"(^|/)app/page\.[jt]sx?$"),
    re.compile(r"(^|/)app/globals\.css$"),
    re.compile(r"(^|/)globals\.css$"),
    re.compile(r"(^|/)tailwind\.config\.[jt]s$"),
    re.compile(r"(^|/)README\.md$", re.IGNORECASE),
)

PERSONA_PRESETS: dict[str, str] = {
    "Designkurator (kritisk)": (
        "Du är en kritisk designkurator på en digital byrå. Du bedömer mallen "
        "som ett designsystem: visuell identitet, typografi, färgvärld, rytm "
        "och signaturdetaljer. Du är ärlig om vad som är generiskt och pekar "
        "ut det som faktiskt är distinkt."
    ),
    "Varumärkesstrateg (varm)": (
        "Du är en varm varumärkesstrateg. Du tittar på mallen genom kundens "
        "ögon: vilken sorts verksamhet skulle lysa i den här kostymen? Vilken "
        "känsla förmedlas? Du beskriver målgrupp och tonalitet konkret, t.ex. "
        "'passar en fotostudio med lyxiga kriterier'."
    ),
    "Frontend-arkitekt (teknisk)": (
        "Du är en pragmatisk frontend-arkitekt. Du läser kodutdragen och "
        "bedömer struktur: layoutmönster, sektionsrytm, komponentidéer och "
        "vilka visuella grepp som går att återskapa i vår Next.js/Tailwind-"
        "stack utan nya beroenden."
    ),
}

_OUTPUT_CONTRACT = """
Du hjälper till att skapa ett UTKAST i Sajtmaskins backoffice. Viktiga begrepp:
- "scaffold" = runtime-startstruktur (routing + filer) som kodgenereringen utgår från.
- "scaffold-variant" = det VISUELLA uttrycket inom en scaffold (typografi, färgtokens, motiv, prompt-hints). Ingen egen kod.
- Mallen du analyserar används ENDAST som inspiration — inga filer kopieras från den.

Svara med ENDAST ett JSON-objekt (inga kodstaket) med exakt dessa nycklar:
{
  "personaNotes": "3-6 meningar på svenska: vad du ser, vad som är distinkt, vilken typ av verksamhet uttrycket passar. Pedagogiskt — operatören lär sig av dig.",
  "recommendation": "new-variant" ELLER "new-scaffold",
  "recommendationReason": "1-2 meningar på svenska om varför.",
  "targetScaffoldId": "<befintligt scaffold-id som passar bäst, från listan du får>",
  "variantDraft": {
    "id": "<kebab-case, 2-4 ord>",
    "label": "<2-60 tecken, människoläsbart>",
    "description": "<2-3 meningar, max 500 tecken: VEM passar den, VAD gör den visuellt distinkt>",
    "keywords": ["<3-12 matchord, blanda svenska och engelska, specifika>"],
    "fontPairings": [{"heading": "<Google Font>", "body": "<Google Font>"}],
    "signatureMotif": "<EN fras 10-120 tecken som fångar visuella DNA:t>",
    "colorMode": "light" | "dark" | "either",
    "promptHints": ["<1-5 SPECIFIKA visuella direktiv, minst 10 tecken vardera>"],
    "themeTokens": {"background": "<oklch(...)>", "foreground": "<oklch(...)>", "primary": "<oklch(...)>", "radius": "<t.ex. 0.75rem>"}
  },
  "scaffoldDraft": null ELLER {
    "label": "<namn>",
    "description": "<1-2 meningar på engelska>",
    "siteKind": "marketing" | "app" | "commerce" | "editorial",
    "complexity": "simple" | "medium" | "advanced",
    "tags": ["<5-10 tags>"],
    "promptHints": ["<minst 2 rader>"],
    "qualityChecklist": ["<minst 3 rader>"],
    "upgradeTargets": ["<minst 1 rad>"],
    "cloneFromScaffoldId": "<befintligt scaffold-id vars filshell ska klonas>"
  }
}

Regler:
- Rekommendera "new-scaffold" BARA om mallens struktur/genre inte täcks av någon befintlig scaffold. Annars "new-variant".
- "scaffoldDraft" fylls bara i när recommendation är "new-scaffold", annars null.
- themeTokens: använd oklch() för färger. Utelämna nycklar du är osäker på.

Konkretionskrav (utkastet ska klara wizardens checklista direkt):
- variantDraft.id: kebab-case, börjar med en bokstav, bara a-z 0-9 och bindestreck.
- signatureMotif: EN konkret fras som namnger ett visuellt grepp någon kan peka på
  ("diagonalt delad hero med överlappande produktkort"). Får inte bestå av bara
  värdeord — "modern", "clean", "minimalistisk", "elegant", "professionell",
  "snygg", "tidlös" duger aldrig som motiv i sig.
- promptHints: minst 2 rader (scaffoldDraft.promptHints likaså), varje rad minst
  10 tecken och ett direktiv en kodgenerator kan följa ("sektionsrubriker i 72px
  serif med 4px understrykning"), aldrig en känsla ("gör det luftigt").
- description/personaNotes: nämn konkreta grepp — inte "modern design".
- scaffoldDraft, när den fylls: tags 5-10 rader, qualityChecklist minst 3 rader,
  upgradeTargets minst 1 rad. Färre rader fälls av checklistan i steg 4.
- Varför konkretionen spelar roll: efter att varianten skapats kurerar
  `scaffolds:variant-patterns` fram dess `signaturePatterns` (layouts, motifs,
  antiPatterns) ur just de här fälten. Generiska fraser in ger tomma eller
  värdelösa mönster ut, och då matchar varianten sämre i runtime.
"""


# ---------------------------------------------------------------------------
# Blob manifest
# ---------------------------------------------------------------------------


def load_blob_templates(repo_root: Path) -> list[dict[str, Any]]:
    """Load the v0-mall entries from the committed Blob manifest.

    Returns [] when the manifest is missing/unreadable so the wizard can show
    a friendly empty state instead of crashing.
    """
    path = repo_root / BLOB_MANIFEST_REL
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    templates = data.get("templates") if isinstance(data, dict) else None
    if not isinstance(templates, list):
        return []
    entries = [
        entry
        for entry in templates
        if isinstance(entry, dict) and str(entry.get("id", "")).strip()
    ]
    entries.sort(key=lambda e: (str(e.get("category", "")), str(e.get("title", "")).lower()))
    return entries


# ---------------------------------------------------------------------------
# Zip download + in-memory analysis
# ---------------------------------------------------------------------------


def download_zip_bytes(url: str, *, max_bytes: int = MAX_ZIP_BYTES) -> bytes:
    """Download a template zip from Blob (public URL) with a size cap."""
    if not url.startswith("https://"):
        raise ValueError("Endast https-URL:er tillåts för mall-zippar.")
    request = urllib.request.Request(url, headers={"User-Agent": "sajtmaskin-backoffice"})
    with urllib.request.urlopen(request, timeout=60) as response:  # noqa: S310 - https enforced above
        payload = response.read(max_bytes + 1)
    if len(payload) > max_bytes:
        raise ValueError(f"Zippen är större än {max_bytes // (1024 * 1024)} MB — avbryter.")
    return payload


def summarize_template_zip(zip_bytes: bytes) -> dict[str, Any]:
    """Build a prompt-friendly summary of the zip: file tree, dependencies and
    key-file excerpts. Members are read in memory only, size-capped."""
    tree: list[str] = []
    excerpts: list[dict[str, str]] = []
    dependencies: dict[str, str] = {}
    total_excerpt_chars = 0

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as archive:
        names = [info.filename for info in archive.infolist() if not info.is_dir()]
        # Normalize away a single wrapping top-level directory for readability.
        normalized = [name.replace("\\", "/").lstrip("/") for name in names]
        tree = sorted(normalized)[:MAX_TREE_ENTRIES]

        for raw_name, name in zip(names, normalized):
            if total_excerpt_chars >= MAX_TOTAL_EXCERPT_CHARS:
                break
            if not any(pattern.search(name) for pattern in KEY_FILE_PATTERNS):
                continue
            try:
                info = archive.getinfo(raw_name)
                if info.file_size > MAX_MEMBER_BYTES:
                    continue
                text = archive.read(raw_name).decode("utf-8", errors="replace")
            except (KeyError, OSError, ValueError):
                continue
            if name.endswith("package.json"):
                try:
                    pkg = json.loads(text)
                    for section in ("dependencies", "devDependencies"):
                        section_deps = pkg.get(section)
                        if isinstance(section_deps, dict):
                            for dep, version in section_deps.items():
                                dependencies[str(dep)] = str(version)
                except ValueError:
                    pass
            excerpt = text[:MAX_EXCERPT_CHARS]
            excerpts.append({"path": name, "excerpt": excerpt})
            total_excerpt_chars += len(excerpt)

    return {
        "fileCount": len(names),
        "tree": tree,
        "dependencies": dependencies,
        "excerpts": excerpts,
    }


# ---------------------------------------------------------------------------
# OpenAI persona call
# ---------------------------------------------------------------------------


def get_openai_api_key() -> str | None:
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    return key or None


def get_blob_read_write_token() -> str | None:
    token = os.environ.get("BLOB_READ_WRITE_TOKEN", "").strip()
    return token or None


def usable_still_image_url(template_meta: dict[str, Any]) -> str:
    """Mallens stillbild om den går att skicka till OpenAI, annars tom sträng.

    Bara `https://` duger: API:t hämtar bilden själv, så en relativ sökväg eller
    en `http://`-URL når den inte. **Enda** stället där kravet avgörs, så UI:t
    inte kan säga "stillbilden skickas med" om en URL som anropet tystar bort
    (Cursor-bugbot, medium, på #656).
    """
    url = str(template_meta.get("stillImageUrl", "") or "").strip()
    return url if url.startswith("https://") else ""


def _post_openai_chat(payload: dict[str, Any], api_key: str, *, timeout: int = 180) -> str:
    request = urllib.request.Request(
        OPENAI_CHAT_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = ""
        try:
            detail = error.read().decode("utf-8", errors="replace")[:600]
        except OSError:
            pass
        raise RuntimeError(f"OpenAI svarade HTTP {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Kunde inte nå OpenAI: {error.reason}") from error

    content = (
        (body.get("choices") or [{}])[0].get("message", {}).get("content", "")
        if isinstance(body, dict)
        else ""
    )
    if not content:
        raise RuntimeError("OpenAI returnerade inget svar (tomt content).")
    return content


def _parse_json_reply(raw: str) -> dict[str, Any]:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
    parsed = json.loads(text)
    if not isinstance(parsed, dict):
        raise ValueError("Persona-svaret var inte ett JSON-objekt.")
    return parsed


def _is_reasoning_model(model: str) -> bool:
    """GPT-5 family and the o-series are reasoning models: they reject
    `max_tokens` (require `max_completion_tokens`) and only accept the default
    temperature (custom values return HTTP 400)."""
    m = model.strip().lower()
    return m.startswith(("gpt-5", "o1", "o3", "o4"))


# Reasoning-modeller räknar sina DOLDA reasoning-tokens mot
# `max_completion_tokens`. En budget som räckte för en klassisk chat-modell kan
# därför konsumeras helt av tänkandet innan ett enda synligt tecken skrivs —
# svaret blir tomt `content` och `_post_openai_chat` kastar. Guidens default är
# nu gpt-5.6-luna (persona: gpt-5.6-terra). Faktorn ger plats för
# resonemanget; det synliga svaret är fortfarande kort.
_REASONING_TOKEN_HEADROOM = 4


def _completion_budget(model: str, visible_tokens: int) -> int:
    """Budget för `max_completion_tokens` givet önskad synlig svarslängd."""
    return visible_tokens * _REASONING_TOKEN_HEADROOM if _is_reasoning_model(model) else visible_tokens


def _chat_payload(
    *,
    model: str,
    messages: list[dict[str, Any]],
    max_tokens: int,
    temperature: float,
    response_format: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a Chat Completions payload valid for both classic and
    reasoning (gpt-5.6 terra/sol/luna) models. Uses `max_completion_tokens`
    (accepted by all current chat models); omits the custom `temperature` for
    reasoning models that only allow the default."""
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "max_completion_tokens": max_tokens,
    }
    if not _is_reasoning_model(model):
        payload["temperature"] = temperature
    if response_format is not None:
        payload["response_format"] = response_format
    return payload


def run_persona_analysis(
    *,
    api_key: str,
    model: str,
    persona_prompt: str,
    template_meta: dict[str, Any],
    repo_summary: dict[str, Any] | None,
    scaffold_options: list[dict[str, str]],
    vision_capable: bool,
) -> dict[str, Any]:
    """Run the persona over the selected blob template and return the parsed
    draft JSON. Raises RuntimeError/ValueError with readable messages.

    ``vision_capable`` styr bildskickningen: bara när manifestet pekar ut det
    valda modell-id:t som vision-kapabelt
    (``ai_workloads.model_supports_vision``) bifogas mallens stillbild. Annars
    går prompten ut som ren text — med en rad som säger att bilden saknas, så
    personan inte hittar på visuella detaljer den inte kunnat se.

    Argumentet har medvetet **inget default**: en glömd parameter ska bli ett
    ``TypeError`` här och inte en tyst bild till en textmodell.
    """
    scaffold_lines = "\n".join(
        f"- {option['id']}: {option.get('label', '')} — {option.get('description', '')[:140]}"
        for option in scaffold_options
    )
    user_parts: list[dict[str, Any]] = []
    still_url = usable_still_image_url(template_meta)
    send_image = vision_capable and bool(still_url)

    summary_lines = [
        f"Mall (v0-mall i Vercel Blob): {template_meta.get('title', '?')}",
        f"Kategori: {template_meta.get('category', '?')}",
        f"Blob-id (använd som sourceTemplateIds-post): {template_meta.get('id', '?')}",
        "",
        "Befintliga scaffolds att välja targetScaffoldId från:",
        scaffold_lines,
    ]
    if repo_summary:
        deps = repo_summary.get("dependencies") or {}
        summary_lines += [
            "",
            f"Antal filer i mallen: {repo_summary.get('fileCount', '?')}",
            "Beroenden: " + (", ".join(sorted(deps)) if deps else "(inga hittade)"),
            "",
            "Filträd (urval):",
            *[f"  {entry}" for entry in (repo_summary.get("tree") or [])[:120]],
        ]
        for excerpt in repo_summary.get("excerpts") or []:
            summary_lines += [
                "",
                f"--- Utdrag: {excerpt['path']} ---",
                excerpt["excerpt"],
            ]
    else:
        summary_lines += [
            "",
            "(Ingen kodanalys tillgänglig — bedöm utifrån "
            + ("stillbilden och metadatan.)" if send_image else "metadatan.)"),
        ]

    if not send_image:
        summary_lines += [
            "",
            "(Ingen stillbild bifogad i det här anropet — beskriv bara visuella "
            "grepp du kan belägga i kodutdragen/metadatan, och hitta inte på "
            "detaljer du inte har underlag för.)",
        ]

    user_parts.append({"type": "text", "text": "\n".join(summary_lines)})

    if send_image:
        user_parts.append(
            {
                "type": "image_url",
                "image_url": {"url": still_url, "detail": "low"},
            }
        )

    payload = _chat_payload(
        model=model,
        messages=[
            {"role": "system", "content": persona_prompt.strip() + "\n\n" + _OUTPUT_CONTRACT},
            {"role": "user", "content": user_parts},
        ],
        max_tokens=_completion_budget(model, 2000),
        temperature=0.6,
        response_format={"type": "json_object"},
    )
    return _parse_json_reply(_post_openai_chat(payload, api_key))


def ask_guide(
    *,
    api_key: str,
    model: str,
    step_context: str,
    question: str,
) -> str:
    """Small interactive helper: answers operator questions about the current
    wizard step in plain Swedish.

    Svaret ska vara kort (max 6 meningar), men budgeten skalas för
    reasoning-modeller — se :data:`_REASONING_TOKEN_HEADROOM`. Guidens
    manifest-default är en gpt-5-modell, så utan skalningen kunde tänkandet äta
    hela taket och lämna ett tomt svar.
    """
    payload = _chat_payload(
        model=model,
        messages=[
            {
                "role": "system",
                "content": (
                    "Du är en vänlig, pedagogisk guide inne i Sajtmaskins backoffice-wizard "
                    "för att skapa scaffolds och scaffold-varianter. Svara kort (max 6 meningar), "
                    "på svenska, konkret och utan att hitta på funktioner som inte nämns i kontexten. "
                    "Kontext för aktuellt steg:\n" + step_context
                ),
            },
            {"role": "user", "content": question},
        ],
        max_tokens=_completion_budget(model, 500),
        temperature=0.4,
    )
    return _post_openai_chat(payload, api_key).strip()


# ---------------------------------------------------------------------------
# Schema validation with in-memory enum patch (for new scaffolds)
# ---------------------------------------------------------------------------


def load_variant_schema(repo_root: Path) -> dict[str, Any]:
    path = repo_root / "docs" / "schemas" / "strict" / "scaffold-variant.schema.json"
    return json.loads(path.read_text(encoding="utf-8"))


def validate_variant_payload_against_schema(
    payload: dict[str, Any],
    schema: dict[str, Any],
    *,
    extra_scaffold_id: str | None = None,
) -> list[str]:
    """Validate a variant payload. When the wizard creates a *new* scaffold its
    id is not yet in the schema enum, so ``extra_scaffold_id`` patches the enum
    in memory (the on-disk schema is updated as part of scaffold creation)."""
    try:
        from jsonschema import Draft202012Validator
    except ImportError:
        return [
            "Schemavalidering kunde inte köras: `jsonschema` saknas "
            "(se requirements.backoffice.txt). Sparar inte."
        ]

    working_schema = json.loads(json.dumps(schema))
    if extra_scaffold_id:
        enum = (
            working_schema.get("properties", {})
            .get("scaffoldId", {})
            .get("enum")
        )
        if isinstance(enum, list) and extra_scaffold_id not in enum:
            enum.append(extra_scaffold_id)

    validator = Draft202012Validator(working_schema)
    errors = sorted(validator.iter_errors(payload), key=lambda e: list(e.absolute_path))
    return [
        f"{'/'.join(str(part) for part in error.absolute_path) or '(rot)'}: {error.message}"
        for error in errors
    ]


# ---------------------------------------------------------------------------
# Draft persistence (gitignored)
# ---------------------------------------------------------------------------


def drafts_dir(repo_root: Path) -> Path:
    return repo_root / DRAFTS_DIR_REL


def save_draft(repo_root: Path, draft: dict[str, Any]) -> Path:
    directory = drafts_dir(repo_root)
    directory.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    template_id = str(draft.get("templateId", "unknown"))[:24]
    path = directory / f"{stamp}-{template_id}.json"
    path.write_text(
        json.dumps(draft, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return path


def list_drafts(repo_root: Path) -> list[Path]:
    directory = drafts_dir(repo_root)
    if not directory.is_dir():
        return []
    return sorted(directory.glob("*.json"), reverse=True)


def load_draft(path: Path) -> dict[str, Any] | None:
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
        return parsed if isinstance(parsed, dict) else None
    except (OSError, ValueError):
        return None
