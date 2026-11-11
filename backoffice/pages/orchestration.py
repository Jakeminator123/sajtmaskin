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
        / "prompt-orchestration.ts",
        "Capability tiers": ctx.repo_root
        / "src"
        / "lib"
        / "builder"
        / "follow-up-capability-detection.ts",
        "SerializeMode": ctx.scaffolds_dir / "serialize.ts",
        "BuildSpec policies": ctx.repo_root / "src" / "lib" / "gen" / "build-spec" / "types.ts",
    }


# (filnyckel i _orch_ts_sources, TS-typnamn, beskrivning). En typ som inte går
# att tolka visas som "(typ saknas)" i stället för att tyst försvinna, och
# `backoffice/test_orchestration_sources.py` kräver icke-tomma värden per rad.
ORCH_UNION_SPECS: tuple[tuple[str, str, str], ...] = (
    ("BuildIntent / BuildMethod", "BuildIntent", "Vad ska byggas?"),
    ("BuildIntent / BuildMethod", "BuildMethod", "Hur kom requesten in?"),
    ("PromptType / PromptStrategy", "PromptType", "Klassificerad prompttyp"),
    ("PromptType / PromptStrategy", "PromptStrategy", "Prompt-budget/trunkerings-strategi"),
    (
        "PromptType / PromptStrategy",
        "PromptSource",
        "Promptkälla för telemetry/UX (`user` eller `auto_repair`).",
    ),
    ("ScaffoldId / ScaffoldMode", "ScaffoldId", "Vilken scaffold"),
    ("ScaffoldId / ScaffoldMode", "ScaffoldMode", "Hur scaffolden väljs"),
    ("ScaffoldId / ScaffoldMode", "ScaffoldSiteKind", "Scaffold site-kategori"),
    (
        "Capability tiers",
        "CapabilitySpecificityTier",
        "Follow-up capability-tier (`generic` | `specific` | `beyond-dossier`).",
    ),
    ("ScaffoldId / ScaffoldMode", "ScaffoldComplexity", "Scaffold komplexitetsnivå"),
    ("SerializeMode", "ScaffoldSerializeMode", "Hur mycket scaffolden styr prompten"),
    ("BuildSpec policies", "BuildSpecContextPolicy", "Tokenbudget-nivå för scaffold"),
    (
        "BuildSpec policies",
        "BuildSpecQualityTarget",
        "Kvalitetsmål (standard/premium/release-candidate). release-candidate sätts numera bara via explicit F3-trigger.",
    ),
    (
        "BuildSpec policies",
        "BuildSpecPreviewPolicy",
        "F2 = `fidelity2` (design-loopen, typecheck). F3 = `fidelity3` (bygg integrationer, typecheck + build). `finalize-design` startar LLM bara vid riktiga build-nycklar; annars skapas en exakt F3-fork och ReleaseGate körs deterministiskt.",
    ),
    ("BuildSpec policies", "BuildSpecVerificationPolicy", "Verifieringsnivå: fast / standard / strict"),
)


def load_union_rows(sources: dict[str, Path]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for file_key, type_name, description in ORCH_UNION_SPECS:
        path = sources.get(file_key)
        if not path or not path.is_file():
            values = ["(fil saknas)"]
        else:
            values = extract_ts_union_values(path.read_text(encoding="utf-8"), type_name) or [
                "(typ saknas)"
            ]
        rows.append(
            {
                "type": type_name,
                "values": values,
                "source": path.name if path and path.is_file() else str(path or "?"),
                "description": description,
            }
        )
    return rows


def render(ctx: BackofficeContext) -> None:
    orch_ts_sources = _orch_ts_sources(ctx)

    st.header("Orchestration Map")
    st.caption(
        "Statisk referenskarta parsad direkt ur TS-koden. Visar vilka beslutspunkter systemet har och vilka värden som är möjliga."
    )

    type_defs = load_union_rows(orch_ts_sources)

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
