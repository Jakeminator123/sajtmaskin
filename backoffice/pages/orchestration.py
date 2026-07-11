"""Orchestration Map — statisk referenskarta parsad direkt ur TS-koden."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd
import streamlit as st

from backoffice.shared import (
    BackofficeContext,
    extract_ts_union_values,
    get_all_manifests,
)


def _orch_ts_sources(ctx: BackofficeContext) -> dict[str, Path]:
    """Path-mappning för TS-typer som orchestration-vyn parsar union-värden ur."""
    return {
        "ScaffoldId / ScaffoldMode": ctx.scaffolds_dir / "types.ts",
        "BuildIntent / BuildMethod": ctx.repo_root / "src" / "lib" / "builder" / "build-intent.ts",
        "PromptType / PromptStrategy": ctx.repo_root
        / "src"
        / "lib"
        / "builder"
        / "promptOrchestration.ts",
        "Capability tiers": ctx.repo_root
        / "src"
        / "lib"
        / "builder"
        / "follow-up-capability-detection.ts",
        "SerializeMode": ctx.scaffolds_dir / "serialize.ts",
        "BuildSpec policies": ctx.repo_root / "src" / "lib" / "gen" / "build-spec.ts",
    }


def render(ctx: BackofficeContext) -> None:
    orch_ts_sources = _orch_ts_sources(ctx)

    st.header("Orchestration Map")
    st.caption(
        "Statisk referenskarta parsad direkt ur TS-koden. Visar vilka beslutspunkter systemet har och vilka värden som är möjliga."
    )

    type_defs: list[dict[str, Any]] = []

    def _load_union(file_key: str, type_name: str, description: str) -> None:
        path = orch_ts_sources.get(file_key)
        if not path or not path.exists():
            type_defs.append(
                {
                    "type": type_name,
                    "values": ["(fil saknas)"],
                    "source": str(path or "?"),
                    "description": description,
                }
            )
            return
        text = path.read_text(encoding="utf-8")
        vals = extract_ts_union_values(text, type_name)
        if vals:
            type_defs.append(
                {
                    "type": type_name,
                    "values": vals,
                    "source": path.name,
                    "description": description,
                }
            )

    _load_union("BuildIntent / BuildMethod", "BuildIntent", "Vad ska byggas?")
    _load_union("BuildIntent / BuildMethod", "BuildMethod", "Hur kom requesten in?")
    _load_union(
        "PromptType / PromptStrategy",
        "PromptType",
        "Klassificerad prompttyp",
    )
    _load_union(
        "PromptType / PromptStrategy",
        "PromptStrategy",
        "Prompt-budget/trunkerings-strategi",
    )
    _load_union(
        "PromptType / PromptStrategy",
        "PromptSource",
        "Promptkälla för telemetry/UX (`user` eller `auto_repair`).",
    )
    _load_union("ScaffoldId / ScaffoldMode", "ScaffoldId", "Vilken scaffold (10 st)")
    _load_union("ScaffoldId / ScaffoldMode", "ScaffoldMode", "Hur scaffolden väljs")
    _load_union(
        "ScaffoldId / ScaffoldMode",
        "ScaffoldSiteKind",
        "Scaffold site-kategori",
    )
    _load_union(
        "Capability tiers",
        "CapabilitySpecificityTier",
        "Follow-up capability-tier (`generic` | `specific` | `beyond-dossier`).",
    )
    _load_union(
        "ScaffoldId / ScaffoldMode",
        "ScaffoldComplexity",
        "Scaffold komplexitetsnivå",
    )

    serialize_path = orch_ts_sources.get("SerializeMode")
    if serialize_path and serialize_path.exists():
        ser_text = serialize_path.read_text(encoding="utf-8")
        ser_vals = extract_ts_union_values(ser_text, "ScaffoldSerializeMode")
        if ser_vals:
            type_defs.append(
                {
                    "type": "ScaffoldSerializeMode",
                    "values": ser_vals,
                    "source": serialize_path.name,
                    "description": "Hur mycket scaffolden styr prompten",
                }
            )

    build_spec_path = orch_ts_sources.get("BuildSpec policies")
    if build_spec_path and build_spec_path.exists():
        bs_text = build_spec_path.read_text(encoding="utf-8")
        for bs_type, bs_desc in [
            ("BuildSpecContextPolicy", "Tokenbudget-nivå för scaffold"),
            (
                "BuildSpecQualityTarget",
                "Kvalitetsmål (standard/premium/release-candidate). release-candidate sätts numera bara via explicit F3-trigger.",
            ),
            (
                "BuildSpecPreviewPolicy",
                "F2 = `fidelity2` (design-loopen, typecheck). F3 = `fidelity3` (bygg integrationer, typecheck + build). `finalize-design` startar LLM bara vid riktiga build-nycklar; annars skapas en exakt F3-fork och ReleaseGate körs deterministiskt.",
            ),
            ("BuildSpecVerificationPolicy", "Verifieringsnivå: fast / standard / strict"),
        ]:
            bs_vals = extract_ts_union_values(bs_text, bs_type)
            if bs_vals:
                type_defs.append(
                    {
                        "type": bs_type,
                        "values": bs_vals,
                        "source": build_spec_path.name,
                        "description": bs_desc,
                    }
                )

    st.subheader("Beslutspunkter (från TS-typer)")
    for td in type_defs:
        st.markdown(f"**{td['type']}** — {td['description']}")
        st.code("  |  ".join(td["values"]), language=None)
        st.caption(f"Källa: {td['source']}")

    st.divider()
    st.subheader("Flöde: Prompt → Genererad kod")
    st.markdown(
        """
```
ANVÄNDARENS PROMPT
  │
  ├─ 1. PromptOrchestration → PromptType + PromptStrategy
  │      (klassificerar, budgeterar, trimmar)
  │
  ├─ 2. Deep Brief (kanonisk för init)
  │      (strukturerat objekt: sidor, visuell riktning, SEO,
  │       mustHave, avoid, uiNotes — rå user-text som message)
  │      (formatPrompt() enbart fallback när brief saknas)
  │      (domän/site-type matchning från config/domain-rules.json)
  │
  ├─ 3. Scaffold-val → ScaffoldId
  │      ├─ ScaffoldMode: off / auto / manual
  │      ├─ Keyword + embedding-matchning
  │      └─ Merge-policy + safety guards
  │
  ├─ 3b. Intent-koersning (app-scaffold → buildIntent=app)
  │
  ├─ 4. Capability-inferens (auth, ecommerce, forms, 3D, motion...)
  │
  ├─ 5. Route Plan (brief > scaffold > prompt)
  │
  ├─ 6. Pre-generation Contracts (preview-first defaults)
  │
  ├─ 7. BuildSpec → ContextPolicy + QualityTarget + PreviewPolicy
  │
  ├─ 8. Dynamic Context (rollbaserade block, token-prunade):
  │      Project Context · Route Plan · Pages & Sections (vid sektionsdetalj)
  │      Scaffold Variant · Visual Identity · Contracts · Toolkit
  │      Must Have / Avoid · UX & UI Notes
  │
  ├─ 9. LLM-generering → CodeFile[]
  │
  └─10. Post-generation:
        ├─ Normalize → Syntax validate/fix → Finalize
        ├─ ReleaseGate-bedömning (heuristisk)
        ├─ RenderGate (F2 typecheck/preview)
        │    ├─ Env-signal (saknade nycklar → UI-hint)
        │    ├─ Server repair (Normalize → RepairGate)
        │    └─ RepairGate fallback
        └─ Background server verify (typecheck — slimmad 2026-04-23; build/lint flyttade till pre-VM warm-cache)
```
"""
    )

    st.divider()
    st.subheader("Scaffold ↔ Vercel Use Case")
    manifests = get_all_manifests(ctx)
    vercel_map = {
        "landing-page": "Marketing Sites",
        "saas-landing": "SaaS",
        "portfolio": "Portfolio",
        "blog": "Blog",
        "ecommerce": "Ecommerce",
        "dashboard": "Admin Dashboard",
        "auth-pages": "Authentication",
        "app-shell": "SaaS / Multi-Tenant",
        "base-nextjs": "Starter",
    }
    rows = []
    for m in manifests:
        sid = m.get("id", "?")
        rows.append(
            {
                "Scaffold": sid,
                "Vercel Use Case": vercel_map.get(sid, "?"),
                "siteKind": m.get("siteKind", ""),
                "complexity": m.get("complexity", ""),
                "intents": ", ".join(m.get("allowedBuildIntents", [])),
            }
        )
    st.dataframe(pd.DataFrame(rows), width="stretch", hide_index=True)
