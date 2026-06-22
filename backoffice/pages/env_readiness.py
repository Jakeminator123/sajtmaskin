"""Env Readiness — read-only operator view of the env layers.

Renders a per-key matrix built from EXISTING authorities only:

  * `config/env-policy.json` — Sajtmaskin app env classification (primary key
    source) + the `knownEmptyOk` / `runtimeOnlyKeys` / `extraKnownKeys` lists.
  * `config/ai_models/40-harmless-placeholders.env.txt` — generated-site
    preview placeholders that are SAFE to leave fake even in F3 (harmless).
  * `config/ai_models/41-tier3-stub-placeholders.env.txt` — boot-only stubs
    used in F2 and STRIPPED in F3 (tier3-stub).

ABSOLUTE SAFETY RULE (Backoffice 2.0 phase 2): this view never reads, displays
or logs an env VALUE. It shows the key NAME, its classification, a boolean
`hasValue` (masked — derived from `os.environ` presence only) and provenance
booleans. The placeholder `.txt` files only ever yield KEY names here; their
values are discarded on parse. READ-ONLY by design — no save/edit buttons.

Human-readable companion: `docs/architecture/env-flow-map.md`.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import streamlit as st

from backoffice.shared import BackofficeContext, read_json, render_where_panel

PAGE_NAME = "Env Readiness (read-only)"

# Repo-relative paths (used for the sourceOfTruth column + where-panel parity).
ENV_POLICY_REL = "config/env-policy.json"
HARMLESS_REL = "config/ai_models/40-harmless-placeholders.env.txt"
TIER3_STUB_REL = "config/ai_models/41-tier3-stub-placeholders.env.txt"

MATRIX_COLUMNS = [
    "key",
    "scope",
    "classification",
    "source",
    "requiredFor",
    "enforcement",
    "hasValue",
    "isPlaceholder",
    "blocksF3",
    "sourceOfTruth",
]

# env-policy classification → human source label.
_CLASSIFICATION_SOURCE_LABEL = {
    "shared_runtime": "app-required",
    "optional_runtime": "optional-runtime",
    "environment_specific": "environment-specific",
    "vercel_managed": "vercel-managed",
    "local_only": "local-only",
}

# env-policy classification → enforcement feel (how absence is treated for the
# Sajtmaskin app). Placeholder-only keys fall back to harmless / tier3-stub.
_CLASSIFICATION_ENFORCEMENT = {
    "shared_runtime": "build",
    "optional_runtime": "feature-runtime",
    "environment_specific": "feature-runtime",
    "vercel_managed": "warn-only",
    "local_only": "warn-only",
}


def _parse_env_keys(path: Path) -> list[str]:
    """Return only the KEY names from a dotenv fragment file.

    Everything after ``=`` is intentionally discarded — this page never reads
    or stores an env VALUE, not even a (harmless) placeholder value.
    """
    keys: list[str] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.lower().startswith("export "):
            line = line[len("export "):].strip()
        eq = line.find("=")
        if eq <= 0:
            continue
        key = line[:eq].strip()
        if key:
            keys.append(key)
    return keys


def _load_env_policy(path: Path) -> tuple[dict[str, Any], str | None]:
    if not path.is_file():
        return {}, f"Saknar `{path.as_posix()}`."
    try:
        data = read_json(path)
    except Exception as exc:  # pragma: no cover - defensive UI guard
        return {}, f"Kunde inte läsa `{path.name}`: {exc}"
    if not isinstance(data, dict):
        return {}, f"`{path.name}` har oväntat format (förväntade ett objekt)."
    return data, None


def _load_placeholder_keys(path: Path) -> tuple[list[str], str | None]:
    if not path.is_file():
        return [], f"Saknar `{path.as_posix()}`."
    try:
        return _parse_env_keys(path), None
    except Exception as exc:  # pragma: no cover - defensive UI guard
        return [], f"Kunde inte läsa `{path.name}`: {exc}"


def _has_value(key: str) -> bool:
    """Masked boolean: is the key present and non-empty in the current process
    environment? The value itself is NEVER returned, stored or logged."""
    return bool((os.environ.get(key) or "").strip())


def _build_classification_map(
    policy: dict[str, Any],
) -> tuple[dict[str, str], set[str]]:
    """Returns ``(rule_classification_by_key, known_list_keys)``."""
    rule_class: dict[str, str] = {}
    for rule in policy.get("rules") or []:
        if isinstance(rule, dict) and rule.get("key"):
            rule_class[str(rule["key"])] = str(rule.get("classification") or "").strip()
    known_lists: set[str] = set()
    for list_key in ("knownEmptyOk", "runtimeOnlyKeys", "extraKnownKeys"):
        for k in policy.get(list_key) or []:
            known_lists.add(str(k))
    return rule_class, known_lists


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out


def _build_row(
    key: str,
    rule_class: dict[str, str],
    known_lists: set[str],
    harmless: set[str],
    tier3: set[str],
) -> dict[str, Any]:
    in_app = key in rule_class or key in known_lists
    is_harmless = key in harmless
    is_tier3 = key in tier3
    is_placeholder = is_harmless or is_tier3

    # ── classification ──────────────────────────────────────────────────
    if key in rule_class and rule_class[key]:
        classification = rule_class[key]
    elif key in known_lists:
        classification = "known-list"
    else:
        classification = "preview-only"

    # ── scope ───────────────────────────────────────────────────────────
    if in_app and is_placeholder:
        scope = "app+generated-site"
    elif in_app:
        scope = "app"
    else:
        scope = "generated-site"

    # ── source (provenance) ─────────────────────────────────────────────
    pieces: list[str] = []
    if classification in _CLASSIFICATION_SOURCE_LABEL:
        pieces.append(_CLASSIFICATION_SOURCE_LABEL[classification])
    elif classification == "known-list":
        pieces.append("app-known")
    if is_harmless:
        pieces.append("preview-placeholder (harmless)")
    elif is_tier3:
        pieces.append("preview-placeholder (tier3-stub)")
    source = " + ".join(pieces) if pieces else "—"

    # ── requiredFor ─────────────────────────────────────────────────────
    required_for: list[str] = []
    if classification == "shared_runtime":
        required_for.append("app")
    if "PREVIEW_HOST" in key:
        required_for.append("preview-host")
    if classification == "vercel_managed" or key.startswith("VERCEL"):
        required_for.append("deploy")
    # harmless = safe in F2 and F3; tier3-stub = F2-only (stripped in F3).
    if is_harmless:
        required_for.extend(["F2", "F3"])
    elif is_tier3:
        required_for.append("F2")
    required_for = _dedupe(required_for)

    # ── enforcement ─────────────────────────────────────────────────────
    if classification in _CLASSIFICATION_ENFORCEMENT:
        enforcement = _CLASSIFICATION_ENFORCEMENT[classification]
    elif classification == "known-list":
        enforcement = "warn-only"
    elif is_harmless:
        enforcement = "harmless"
    elif is_tier3:
        enforcement = "tier3-stub"
    else:
        enforcement = "warn-only"

    # ── sourceOfTruth ───────────────────────────────────────────────────
    truth_paths: list[str] = []
    if in_app:
        truth_paths.append(ENV_POLICY_REL)
    if is_harmless:
        truth_paths.append(HARMLESS_REL)
    elif is_tier3:
        truth_paths.append(TIER3_STUB_REL)
    source_of_truth = " + ".join(truth_paths) if truth_paths else "—"

    return {
        "key": key,
        "scope": scope,
        "classification": classification,
        "source": source,
        # tier3-stub stripped in F3; harmless safe in F3 — encoded as tokens.
        "requiredFor": ", ".join(required_for) if required_for else "—",
        "enforcement": enforcement,
        "hasValue": _has_value(key),
        "isPlaceholder": is_placeholder,
        "blocksF3": is_tier3,
        "sourceOfTruth": source_of_truth,
        # internal-only token list for filtering (not shown in column_order).
        "_requiredForTokens": required_for,
    }


def render(ctx: BackofficeContext) -> None:
    domain_map = (
        read_json(ctx.domain_map_json) if ctx.domain_map_json.is_file() else {"pages": {}}
    )
    st.header("Env Readiness — cockpit (read-only)")
    render_where_panel(PAGE_NAME, domain_map)

    st.warning(
        "**Värden är maskerade by design.** Den här vyn visar bara nyckelns "
        "*namn*, dess klassning och en boolean `hasValue` (härledd från "
        "`os.environ`-närvaro). Inga hemliga värden visas eller loggas någonsin. "
        "Vyn är **read-only** — ingen redigering sker här."
    )
    st.caption(
        "Två miljöer i samma matris: **Sajtmaskin-appens egen env** "
        "(`config/env-policy.json`, ultimat auktoritet `src/lib/env.ts`) och den "
        "**genererade sajtens preview-env** (placeholder-fragmenten under "
        "`config/ai_models/`, mergeordning i `src/lib/gen/preview/env-local.ts` "
        "där `generated` vinner). Samma nyckelnamn kan finnas i båda — det är inte "
        "dubbletter utan olika miljöer. Mänsklig karta: "
        "`docs/architecture/env-flow-map.md`."
    )

    env_policy_path = ctx.config_dir / "env-policy.json"
    harmless_path = ctx.config_dir / "ai_models" / "40-harmless-placeholders.env.txt"
    tier3_path = ctx.config_dir / "ai_models" / "41-tier3-stub-placeholders.env.txt"

    policy, policy_err = _load_env_policy(env_policy_path)
    harmless_keys, harmless_err = _load_placeholder_keys(harmless_path)
    tier3_keys, tier3_err = _load_placeholder_keys(tier3_path)

    if policy_err and harmless_err and tier3_err:
        st.warning(
            "Inga env-auktoriteter kunde läsas. Förväntade "
            f"`{ENV_POLICY_REL}`, `{HARMLESS_REL}` och `{TIER3_STUB_REL}`."
        )
        st.caption(f"env-policy: {policy_err}")
        st.caption(f"harmless: {harmless_err}")
        st.caption(f"tier3-stub: {tier3_err}")
        return

    for label, err in (
        ("env-policy.json", policy_err),
        ("40-harmless-placeholders.env.txt", harmless_err),
        ("41-tier3-stub-placeholders.env.txt", tier3_err),
    ):
        if err:
            st.warning(f"{label}: {err}")

    rule_class, known_lists = _build_classification_map(policy)
    harmless_set = set(harmless_keys)
    tier3_set = set(tier3_keys)

    all_keys = sorted(set(rule_class) | known_lists | harmless_set | tier3_set)
    rows = [
        _build_row(key, rule_class, known_lists, harmless_set, tier3_set)
        for key in all_keys
    ]

    if not rows:
        st.info("Inga env-nycklar hittades i någon auktoritet.")
        return

    # ── Top metrics ──────────────────────────────────────────────────────
    m1, m2, m3, m4 = st.columns(4)
    with m1:
        st.metric("Nycklar totalt", len(rows))
    with m2:
        st.metric(
            "Placeholders",
            sum(1 for r in rows if r["isPlaceholder"]),
            help="Nycklar som finns i ett placeholder-fragment (harmless eller tier3-stub).",
        )
    with m3:
        st.metric(
            "blocksF3",
            sum(1 for r in rows if r["blocksF3"]),
            help="tier3-stub-nycklar vars stub strippas i F3 → kräver riktigt värde.",
        )
    with m4:
        st.metric(
            "hasValue (maskerad)",
            sum(1 for r in rows if r["hasValue"]),
            help="Antal nycklar med ett icke-tomt värde i processens env. Endast boolean — värdet visas aldrig.",
        )

    classification_values = sorted({str(r["classification"]) for r in rows})
    cols = st.columns(max(len(classification_values), 1))
    for col, cls in zip(cols, classification_values):
        with col:
            st.metric(cls, sum(1 for r in rows if r["classification"] == cls))

    # ── Filters ────────────────────────────────────────────────────────--
    st.divider()
    required_tokens = sorted(
        {tok for r in rows for tok in r["_requiredForTokens"]}
    )
    scope_values = sorted({str(r["scope"]) for r in rows})
    f1, f2, f3 = st.columns(3)
    with f1:
        cls_pick = st.selectbox(
            "classification", ["Alla", *classification_values], key="env_ready_cls"
        )
    with f2:
        req_pick = st.selectbox(
            "requiredFor", ["Alla", *required_tokens], key="env_ready_req"
        )
    with f3:
        scope_pick = st.selectbox(
            "scope", ["Alla", *scope_values], key="env_ready_scope"
        )

    st.caption(
        "Teckenförklaring: **harmless** = säker att lämna fejkad även i F3 "
        "(*safe in F3*). **tier3-stub** = **F2-only (stripped in F3)** — ett "
        "riktigt värde krävs innan F3 (det är vad `blocksF3` betyder). "
        "`enforcement`: `build` = hård app-spärr · `feature-runtime` = behövs när "
        "en funktion används · `warn-only` = enbart varning · `harmless`/`tier3-stub` "
        "= placeholder-lager. `hasValue` är maskerad (bara true/false)."
    )

    filtered = rows
    if cls_pick != "Alla":
        filtered = [r for r in filtered if r["classification"] == cls_pick]
    if req_pick != "Alla":
        filtered = [r for r in filtered if req_pick in r["_requiredForTokens"]]
    if scope_pick != "Alla":
        filtered = [r for r in filtered if r["scope"] == scope_pick]

    st.caption(f"{len(filtered)} av {len(rows)} nycklar visas.")
    # Strip the internal `_requiredForTokens` helper so it can never reach the
    # UI, regardless of Streamlit's column_order handling.
    display_rows = [{col: r[col] for col in MATRIX_COLUMNS} for r in filtered]
    st.dataframe(
        display_rows,
        width="stretch",
        hide_index=True,
        column_order=MATRIX_COLUMNS,
    )

    st.divider()
    st.caption(
        "Källor (read-only): app-env-klassning `config/env-policy.json` "
        "(ultimat auktoritet `src/lib/env.ts` serverSchema) · placeholder-"
        "klassning `src/lib/integrations/placeholder-harmless.ts` · "
        "preview-mergeordning `src/lib/gen/preview/env-local.ts` · värden/"
        "deploy-status `docs/ENV.md`. Mänsklig karta: "
        "`docs/architecture/env-flow-map.md`."
    )
