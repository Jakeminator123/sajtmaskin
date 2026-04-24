from __future__ import annotations

import json
import re
from typing import Any

import pandas as pd
import streamlit as st

from backoffice.shared import (
    AVAILABLE_PHASE_MODELS,
    BUILD_PROFILE_ORDER,
    PHASE_LABELS,
    PHASE_ORDER,
    REASONING_EFFORT_OPTIONS,
    BackofficeContext,
    build_profile_defaults,
    extract_ts_union_values,
    get_all_manifests,
    human_model_label,
    load_fault_fix_csv,
    phase_model_display_label,
    phase_routing_defaults,
    phase_thinking_defaults,
    phase_token_budget_entry,
    read_autofix_runtime_config,
    read_json,
    write_json,
    write_phase_thinking,
)

OPS_NAV_PAGES = (
    "Scaffolds",
    "Eval",
    "Orchestration Map",
    "Autofix & Kvalitet",
    "Mental modell",
)


def _orch_ts_sources(ctx: BackofficeContext) -> dict[str, Any]:
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


def render_ops_page(page: str, ctx: BackofficeContext) -> None:
    orch_ts_sources = _orch_ts_sources(ctx)

    if page == "Scaffolds":
        st.header("Runtime Scaffolds")

        manifests = get_all_manifests(ctx)
        research_data = read_json(ctx.research_json)
        has_embeddings = ctx.embeddings_json.exists()

        col1, col2, col3 = st.columns(3)
        col1.metric("Scaffolds", len(manifests))
        col2.metric("Research JSON", "finns" if research_data else "saknas")
        col3.metric("Embeddings JSON", "finns" if has_embeddings else "saknas")

        rows = []
        for m in manifests:
            sid = m.get("id", "?")
            rows.append(
                {
                    "id": sid,
                    "label": m.get("label", ""),
                    "siteKind": m.get("siteKind", ""),
                    "complexity": m.get("complexity", ""),
                    "structureProfile": m.get("structureProfile", ""),
                    "contentProfile": m.get("contentProfile", ""),
                    "features": ", ".join(m.get("features", [])),
                    "intents": ", ".join(m.get("allowedBuildIntents", [])),
                    "files": m.get("file_count", 0),
                    "tags": len(m.get("tags", [])),
                    "hints": m.get("has_promptHints", False),
                    "checklist": m.get("has_qualityChecklist", False),
                    "research": m.get("has_research", False),
                }
            )

        st.dataframe(pd.DataFrame(rows), width="stretch", hide_index=True)

        st.subheader("Scaffold-detaljer")
        selected_id = st.selectbox("Välj scaffold", [m.get("id", "") for m in manifests])
        if selected_id:
            sel_manifest = next((m for m in manifests if m.get("id") == selected_id), None)

            if sel_manifest:
                col_a, col_b = st.columns(2)
                with col_a:
                    st.markdown("**Manifest-metadata**")
                    st.json(
                        {
                            "id": sel_manifest.get("id"),
                            "label": sel_manifest.get("label"),
                            "description": sel_manifest.get("description", ""),
                            "allowedBuildIntents": sel_manifest.get("allowedBuildIntents", []),
                            "tags": sel_manifest.get("tags", []),
                            "file_count": sel_manifest.get("file_count", 0),
                        }
                    )
                with col_b:
                    st.markdown("**Traits**")
                    st.json(
                        {
                            k: sel_manifest.get(k)
                            for k in (
                                "siteKind",
                                "complexity",
                                "structureProfile",
                                "contentProfile",
                                "features",
                            )
                            if sel_manifest.get(k)
                        }
                    )

                if research_data and isinstance(research_data, dict):
                    scaffolds_research = research_data.get("scaffolds", {})
                    if selected_id in scaffolds_research:
                        st.markdown("**Research overrides**")
                        st.json(scaffolds_research[selected_id])

            manifest_path = ctx.scaffolds_dir / selected_id / "manifest.ts"
            if manifest_path.exists():
                with st.expander("Rå manifest.ts (read-only)"):
                    st.code(
                        manifest_path.read_text(encoding="utf-8")[:8000],
                        language="typescript",
                    )

                st.divider()
                st.subheader("Redigera scaffold-metadata")
                manifest_text = manifest_path.read_text(encoding="utf-8")

                def _parse_ts_string_array(text: str, field: str) -> list[str]:
                    pattern = rf"{field}:\s*\[(.*?)\]"
                    m = re.search(pattern, text, re.DOTALL)
                    if not m:
                        return []
                    return re.findall(r'"([^"]*)"', m.group(1))

                def _escape_ts_string(value: str) -> str:
                    return value.replace("\\", "\\\\").replace('"', '\\"')

                def _write_ts_string_array(text: str, field: str, values: list[str]) -> str:
                    items = ", ".join(f'"{_escape_ts_string(v)}"' for v in values)
                    pattern = rf"({field}:\s*)\[.*?\]"
                    return re.sub(pattern, rf"\g<1>[{items}]", text, count=1, flags=re.DOTALL)

                def _parse_ts_multiline_string_array(text: str, field: str) -> list[str]:
                    pattern = rf"{field}:\s*\[(.*?)\]"
                    m = re.search(pattern, text, re.DOTALL)
                    if not m:
                        return []
                    return re.findall(r'"([^"]*(?:\\.[^"]*)*)"', m.group(1))

                def _write_ts_multiline_string_array(text: str, field: str, values: list[str]) -> str:
                    if not values:
                        pattern = rf"({field}:\s*)\[.*?\]"
                        return re.sub(pattern, rf"\g<1>[]", text, count=1, flags=re.DOTALL)
                    items = "\n".join(f'    "{_escape_ts_string(v)}",' for v in values)
                    pattern = rf"({field}:\s*)\[.*?\]"
                    return re.sub(pattern, rf"\g<1>[\n{items}\n  ]", text, count=1, flags=re.DOTALL)

                current_tags = _parse_ts_string_array(manifest_text, "tags")
                current_intents = _parse_ts_string_array(manifest_text, "allowedBuildIntents")
                current_hints = _parse_ts_multiline_string_array(manifest_text, "promptHints")
                current_checklist = _parse_ts_multiline_string_array(
                    manifest_text,
                    "qualityChecklist",
                )

                edit_col1, edit_col2 = st.columns(2)
                with edit_col1:
                    new_tags_str = st.text_area(
                        "Tags (en per rad)",
                        value="\n".join(current_tags),
                        height=150,
                        key=f"tags_{selected_id}",
                    )
                    all_intents = ["website", "app", "template"]
                    new_intents = st.multiselect(
                        "Allowed Build Intents",
                        options=all_intents,
                        default=[i for i in current_intents if i in all_intents],
                        key=f"intents_{selected_id}",
                    )

                with edit_col2:
                    new_hints_str = st.text_area(
                        "Prompt Hints (en per rad)",
                        value="\n".join(current_hints),
                        height=150,
                        key=f"hints_{selected_id}",
                    )
                    new_checklist_str = st.text_area(
                        "Quality Checklist (en per rad)",
                        value="\n".join(current_checklist),
                        height=150,
                        key=f"checklist_{selected_id}",
                    )

                if st.button("Spara ändringar", key=f"save_{selected_id}", type="primary"):
                    new_tags = [t.strip() for t in new_tags_str.strip().splitlines() if t.strip()]
                    new_hints = [h.strip() for h in new_hints_str.strip().splitlines() if h.strip()]
                    new_checklist = [
                        c.strip() for c in new_checklist_str.strip().splitlines() if c.strip()
                    ]

                    updated = manifest_text
                    updated = _write_ts_string_array(updated, "tags", new_tags)
                    updated = _write_ts_string_array(
                        updated,
                        "allowedBuildIntents",
                        new_intents,
                    )
                    updated = _write_ts_multiline_string_array(updated, "promptHints", new_hints)
                    updated = _write_ts_multiline_string_array(
                        updated,
                        "qualityChecklist",
                        new_checklist,
                    )

                    if updated != manifest_text:
                        manifest_path.write_text(updated, encoding="utf-8")
                        st.success(f"Sparade ändringar till {manifest_path.name}")
                        st.rerun()
                    else:
                        st.info("Inga ändringar att spara.")

    elif page == "Eval":
        st.header("Scaffold Selection Eval")
        eval_data = read_json(ctx.eval_latest)

        if eval_data and isinstance(eval_data, dict):
            results = eval_data.get("results", [])
            summary = eval_data.get("summary", {})
            col1, col2, col3, col4 = st.columns(4)
            col1.metric("Total cases", summary.get("total", len(results)))
            col2.metric(
                "Keyword Top-1",
                f"{summary.get('keywordTop1Accuracy', 0):.1f}%"
                if isinstance(summary.get("keywordTop1Accuracy"), (int, float))
                else "?",
            )
            col3.metric(
                "Semantic Top-1",
                f"{summary.get('semanticTop1Accuracy', 0):.1f}%"
                if isinstance(summary.get("semanticTop1Accuracy"), (int, float))
                else "?",
            )
            col4.metric(
                "Semantic Top-3",
                f"{summary.get('semanticTop3Accuracy', 0):.1f}%"
                if isinstance(summary.get("semanticTop3Accuracy"), (int, float))
                else "?",
            )
            if results:
                rows = []
                for r in results:
                    rows.append(
                        {
                            "id": r.get("id", ""),
                            "expected": r.get("expected", ""),
                            "keyword": r.get("keywordTop1", ""),
                            "semantic": r.get("semanticTop1", ""),
                            "kw_ok": r.get("keywordTop1Correct", False),
                            "sem_ok": r.get("semanticTop1Correct", False),
                            "method": r.get("semanticMethod", ""),
                            "confidence": r.get("semanticConfidence", ""),
                        }
                    )
                st.dataframe(pd.DataFrame(rows), width="stretch", hide_index=True)
        else:
            st.info(
                "Ingen eval-rapport hittades. Sidan läser "
                "`data/scaffold-eval/reports/scaffold-selection-latest.json` som genereras av "
                "`npm run scaffolds:eval` (`scripts/scaffolds/eval-scaffold-selection.ts`). "
                "OBS: `npm run eval` är en separat **own-engine eval-harness** "
                "(`src/lib/gen/eval/cli.ts`) som skriver till `eval-output/*.md` — inte den här sidans datakälla."
            )

    elif page == "Orchestration Map":
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
                ("BuildSpecQualityTarget", "Kvalitetsmål (standard/premium/release-candidate). release-candidate sätts numera bara via explicit F3-trigger."),
                ("BuildSpecPreviewPolicy", "F2 = `fidelity2` (design-loopen, typecheck). F3 = `fidelity3` (bygg integrationer, typecheck + build). F3 triggas ENBART via `POST .../finalize-design`."),
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
        ├─ Mekanisk autofix → Syntax validate/fix → Finalize
        ├─ Readiness-bedömning (heuristisk)
        ├─ Tier-2 verify-lane (typecheck)
        │    ├─ Env-signal (saknade nycklar → UI-hint)
        │    ├─ Server repair (mekanisk → LLM)
        │    └─ Autofix fallback
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

    elif page == "Autofix & Kvalitet":
        st.header("Autofix & Kvalitet")
        st.caption(
            "Central överblick för mekaniska fixar, LLM-fixar och kvalitetspass. Den här sidan speglar samma `config/ai_models/manifest.json` som config-dashboarden använder."
        )

        manifest = read_json(ctx.manifest_json) if ctx.manifest_json.exists() else None
        runtime_cfg = read_autofix_runtime_config(ctx.autofix_hook_ts)

        st.subheader("Pipeline-översikt")
        st.markdown(
            """
```
LLM-generering
     |
[Mekanisk autofix]  ← repairPolicies.deterministicAutofixPasses
     |
[Syntax validate/fix]  ← repairPolicies.syntaxFixPasses
     |
[Bildmaterialisering + Verifier]  ← endast finalizePath=full
     |                                (verifier blocking = advisory)
     |
[Preflight]  ← server, före DB-sparning
     |
=== SPARAS I DATABAS ===
     |
[Post-checks]  ← klient, efter DB-sparning
     |                  (kan trigga LLM autofix)
[Quality gate] ← VM, npx tsc --noEmit
     |                  (kan trigga server repair → LLM autofix)
[Server repair pass]  ← delad runRepairLoop()
     |
[repair_available]    ← repaired_files_json + repair_available_at
     |
[accept-repair]       ← explicit användaraccept i versionspanelen
     |
[timeout auto-accept] ← repairPolicies.repairAcceptTimeoutMinutes
```
"""
        )
        st.caption(
            "Preflight kan stoppa leverans före databasen. Verifier-pass i finalize är hybrid (deterministiska guards som `undefined-jsx-symbol` + LLM-audit) — blocking findings matas in i fixern men stoppar inte persist. Post-checks och quality gate körs efter att versionen har sparats, men quality gate hoppas över om post-checks redan har köat autofix. Serverrepair appliceras inte längre tyst: först `repair_available`, sedan `accept-repair` (eller timeout-autoaccept)."
        )

        st.divider()
        st.subheader("Runtime-gränser för LLM-autofix")
        rc1, rc2 = st.columns(2)
        rc1.metric(
            "Max autofix per chatt",
            runtime_cfg.get("maxAutofixPerChat")
            if runtime_cfg.get("maxAutofixPerChat") is not None
            else "okänd",
        )
        rc2.metric(
            "Max försök per orsak",
            runtime_cfg.get("maxAttemptsPerReason")
            if runtime_cfg.get("maxAttemptsPerReason") is not None
            else "okänd",
        )
        soft_only = runtime_cfg.get("softOnlyReasons") or []
        if soft_only:
            st.caption("Soft-only-orsaker som aldrig triggar LLM-autofix av sig själva:")
            st.code(" | ".join(soft_only), language=None)

        st.divider()
        st.subheader("Fix-statistik från error-log.csv")
        if not ctx.error_log_csv.is_file():
            st.info(
                f"Filen `{ctx.error_log_csv.relative_to(ctx.repo_root).as_posix()}` saknas. Den skapas när generationloggning är aktiv och fixar/fel börjar loggas."
            )
        else:
            error_df, error_log_message = load_fault_fix_csv(ctx.error_log_csv)
            if error_log_message:
                st.error(error_log_message)

            if error_df.empty:
                st.info("CSV-filen finns men innehåller inga rader ännu.")
            else:
                created_by = (
                    error_df["created_by"]
                    if "created_by" in error_df.columns
                    else pd.Series("", index=error_df.index)
                )
                fixed_by = (
                    error_df["fixed_by"]
                    if "fixed_by" in error_df.columns
                    else pd.Series("", index=error_df.index)
                )
                scaffold_col = (
                    error_df["scaffold_id"]
                    if "scaffold_id" in error_df.columns
                    else pd.Series("-", index=error_df.index)
                )
                autofix_mask = fixed_by.isin(["deterministic-autofix", "llm-fixer"]) | created_by.isin(
                    ["deterministic-autofix", "syntax-validator"]
                )
                fix_df = error_df[autofix_mask].copy()
                fix_df["created_by"] = created_by[autofix_mask].values
                fix_df["fixed_by"] = fixed_by[autofix_mask].values
                if "scaffold_id" not in fix_df.columns:
                    fix_df["scaffold_id"] = scaffold_col[autofix_mask].values

                if fix_df.empty:
                    st.info("Inga autofix-/repair-rader hittades i CSV-loggen ännu.")
                else:
                    fix_df["fix_kind"] = fix_df["fixed_by"].apply(
                        lambda value: "LLM" if str(value) == "llm-fixer" else "Mekanisk"
                    )
                    scaffold_opts = ["Alla"] + sorted(
                        str(value)
                        for value in scaffold_col.dropna().unique().tolist()
                        if str(value).strip() and str(value).strip() != "-"
                    )
                    selected_scaffold = st.selectbox(
                        "Filtrera på scaffold",
                        scaffold_opts,
                        key="autofix_stats_scaffold",
                    )
                    if selected_scaffold != "Alla" and "scaffold_id" in fix_df.columns:
                        fix_df = fix_df[fix_df["scaffold_id"] == selected_scaffold]

                    fixer_series = (
                        fix_df["fixer"]
                        if "fixer" in fix_df.columns
                        else pd.Series("-", index=fix_df.index)
                    )
                    fixer_df = fix_df[fixer_series.fillna("-") != "-"].copy()

                    s1, s2, s3, s4 = st.columns(4)
                    s1.metric("Fix-rader", len(fix_df))
                    s2.metric("Mekaniska", int((fix_df["fix_kind"] == "Mekanisk").sum()))
                    s3.metric("LLM-fixar", int((fix_df["fix_kind"] == "LLM").sum()))
                    s4.metric(
                        "Unika fixers",
                        int(fixer_df["fixer"].nunique()) if not fixer_df.empty else 0,
                    )

                    if not fixer_df.empty:
                        top_fixers = (
                            fixer_df.groupby(["fix_kind", "fixer"])
                            .size()
                            .reset_index(name="antal")
                            .sort_values(["antal", "fixer"], ascending=[False, True])
                        )
                        st.markdown("### Vanligaste fixers")
                        st.dataframe(top_fixers.head(25), width="stretch", hide_index=True)

                    if "scaffold_id" in fix_df.columns:
                        scaffold_fix_df = fix_df[fix_df["scaffold_id"].fillna("-") != "-"].copy()
                        if not scaffold_fix_df.empty:
                            by_scaffold = (
                                scaffold_fix_df.groupby(["scaffold_id", "fix_kind"])
                                .size()
                                .unstack(fill_value=0)
                                .reset_index()
                                .sort_values("scaffold_id")
                            )
                            st.markdown("### Fixer per scaffold")
                            st.dataframe(by_scaffold, width="stretch", hide_index=True)

                    recent_cols = [
                        col
                        for col in [
                            "time",
                            "scaffold_id",
                            "fix_kind",
                            "fixer",
                            "problem",
                            "chat_id",
                            "version_id",
                            "file",
                        ]
                        if col in fix_df.columns
                    ]
                    if recent_cols:
                        st.markdown("### Senaste fixrader")
                        st.dataframe(
                            fix_df[recent_cols].tail(50).iloc[::-1],
                            width="stretch",
                            hide_index=True,
                        )
                        st.caption(
                            "CSV-loggen lagrar nu full ISO-tid i kolumnen `time`. Vyn visar senaste rader och kan senare utökas med riktiga dag/vecka-trender."
                        )

        st.divider()
        st.subheader("Centrala styrningar (manifest.json)")
        if not isinstance(manifest, dict):
            st.error(f"Kunde inte läsa `{ctx.manifest_json.relative_to(ctx.repo_root).as_posix()}`.")
        else:
            rp = manifest.setdefault("repairPolicies", {})
            tb = manifest.setdefault("tokenBudgets", {})
            pgp = manifest.setdefault("postGenerationPasses", {})
            routing = phase_routing_defaults(manifest)

            c1, c2, c3, c4, c5 = st.columns(5)
            c1.metric("Mekaniska pass", int(rp.get("deterministicAutofixPasses", 2)))
            c2.metric("Syntax-pass", int(rp.get("syntaxFixPasses", 3)))
            c3.metric("Server repair-pass", int(rp.get("serverRepairPasses", 2)))
            c4.metric("Manual repair-pass", int(rp.get("manualRepairRouteLlmPasses", 2)))
            c5.metric("Repair accept-timeout (min)", int(rp.get("repairAcceptTimeoutMinutes", 5)))

            left, right = st.columns(2)
            with left:
                st.markdown("### Repair-pass")
                deterministic_passes = st.number_input(
                    "Mekaniska fix-pass före LLM",
                    value=int(rp.get("deterministicAutofixPasses", 2)),
                    min_value=1,
                    max_value=10,
                    step=1,
                    key="bo_repair_deterministic",
                )
                syntax_passes = st.number_input(
                    "Syntax-fix-pass efter generering",
                    value=int(rp.get("syntaxFixPasses", 3)),
                    min_value=1,
                    max_value=10,
                    step=1,
                    key="bo_repair_syntax",
                )
                manual_passes = st.number_input(
                    "Manuell repair-route: max LLM-pass",
                    value=int(rp.get("manualRepairRouteLlmPasses", 2)),
                    min_value=1,
                    max_value=10,
                    step=1,
                    key="bo_repair_manual",
                )
                server_passes = st.number_input(
                    "Background server verify: max repair-pass",
                    value=int(rp.get("serverRepairPasses", 2)),
                    min_value=1,
                    max_value=10,
                    step=1,
                    key="bo_repair_server",
                )
                repair_accept_timeout = st.number_input(
                    "Repair available: auto-accept timeout (minuter)",
                    value=int(rp.get("repairAcceptTimeoutMinutes", 5)),
                    min_value=1,
                    max_value=120,
                    step=1,
                    key="bo_repair_accept_timeout",
                    help="Efter denna tid kan pending `repair_available` auto-accepteras i chat/versions/readiness-routes.",
                )

            with right:
                st.markdown("### Tokenbudgetar")
                engine_tokens = st.number_input(
                    "Build/generator max output tokens",
                    value=int((tb.get("engineMaxOutputTokens") or {}).get("default", 82768)),
                    step=1024,
                    key="bo_tb_engine",
                )
                autofix_tokens = st.number_input(
                    "Autofix / fixer max output tokens",
                    value=int((tb.get("autofixMaxOutputTokens") or {}).get("default", 12288)),
                    step=512,
                    key="bo_tb_autofix",
                )
                verifier_tokens = st.number_input(
                    "Verifier max output tokens",
                    value=int((pgp.get("verifierMaxOutputTokens") or {}).get("default", 8192)),
                    step=256,
                    key="bo_pgp_verifier_tokens",
                )
                verifier_snippet = st.number_input(
                    "Verifier: snippet-tecken per fil",
                    value=int((pgp.get("verifierSnippetCharsPerFile") or {}).get("default", 14000)),
                    step=500,
                    key="bo_pgp_verifier_snippet",
                )

            st.markdown("### Phase routing")
            st.caption(
                "Choose a model per phase. `selected_build_model` is shown as `Tier model (...)`, and planner/generator still require the existing builder thinking toggle to be on."
            )
            build_defaults = build_profile_defaults(manifest)
            thinking_defaults = phase_thinking_defaults(manifest)
            edited_routing: dict[str, dict[str, str]] = {}
            edited_thinking: dict[str, dict[str, dict[str, Any]]] = {}
            tier_tabs = st.tabs([tier for tier in BUILD_PROFILE_ORDER])
            for idx, tier in enumerate(BUILD_PROFILE_ORDER):
                tier_routing = routing.get(tier) or {}
                tier_thinking = thinking_defaults.get(tier) or {}
                edited_routing[tier] = {}
                edited_thinking[tier] = {}
                with tier_tabs[idx]:
                    for phase in PHASE_ORDER:
                        current_model = (
                            str(tier_routing.get(phase, "selected_build_model")).strip()
                            or "selected_build_model"
                        )
                        current_thinking_cfg = tier_thinking.get(phase) or {}
                        current_thinking = bool(current_thinking_cfg.get("thinking", False))
                        current_effort = (
                            str(current_thinking_cfg.get("reasoningEffort", "medium")).strip()
                            or "medium"
                        )
                        budget = phase_token_budget_entry(manifest, phase)
                        st.markdown(f"#### {PHASE_LABELS.get(phase, phase)}")
                        c1, c2, c3, c4 = st.columns([1.8, 0.9, 1.1, 1.1])
                        with c1:
                            model_value = st.selectbox(
                                "Model",
                                AVAILABLE_PHASE_MODELS,
                                index=AVAILABLE_PHASE_MODELS.index(current_model)
                                if current_model in AVAILABLE_PHASE_MODELS
                                else 0,
                                key=f"bo_phase_model_{tier}_{phase}",
                                format_func=lambda model_id, _tier=tier: phase_model_display_label(
                                    model_id,
                                    _tier,
                                    build_defaults,
                                ),
                            )
                        with c2:
                            thinking_value = st.toggle(
                                "Thinking",
                                value=current_thinking,
                                key=f"bo_phase_thinking_{tier}_{phase}",
                            )
                        with c3:
                            effort_value = st.selectbox(
                                "Reasoning effort",
                                REASONING_EFFORT_OPTIONS,
                                index=REASONING_EFFORT_OPTIONS.index(current_effort)
                                if current_effort in REASONING_EFFORT_OPTIONS
                                else REASONING_EFFORT_OPTIONS.index("medium"),
                                key=f"bo_phase_effort_{tier}_{phase}",
                                disabled=not thinking_value,
                            )
                        with c4:
                            resolved_model_value = (
                                build_defaults.get(tier, "").strip()
                                if model_value == "selected_build_model"
                                else model_value
                            )
                            st.text_input(
                                "Resolved model",
                                value=human_model_label(resolved_model_value),
                                key=f"bo_phase_resolved_{tier}_{phase}",
                                disabled=True,
                            )
                        st.caption(
                            f"Budget: `{budget['label']}` default={budget['default']} min={budget['min']} max={budget['max']} env={budget['envKey'] or '—'}. {budget['note']}"
                        )
                        edited_routing[tier][phase] = model_value
                        edited_thinking[tier][phase] = {
                            "thinking": thinking_value,
                            "reasoningEffort": effort_value,
                        }

            if st.button("Spara Autofix & Kvalitet", type="primary"):
                tb.setdefault("engineMaxOutputTokens", {})["default"] = int(engine_tokens)
                tb.setdefault("autofixMaxOutputTokens", {})["default"] = int(autofix_tokens)
                pgp.setdefault("verifierMaxOutputTokens", {})["default"] = int(verifier_tokens)
                pgp.setdefault("verifierSnippetCharsPerFile", {})["default"] = int(verifier_snippet)
                rp["deterministicAutofixPasses"] = int(deterministic_passes)
                rp["syntaxFixPasses"] = int(syntax_passes)
                rp["manualRepairRouteLlmPasses"] = int(manual_passes)
                rp["serverRepairPasses"] = int(server_passes)
                rp["repairAcceptTimeoutMinutes"] = int(repair_accept_timeout)
                manifest.setdefault("phaseRouting", {})["defaultByTier"] = edited_routing
                for tier, phase_entries in edited_thinking.items():
                    for phase, cfg in phase_entries.items():
                        write_phase_thinking(
                            manifest,
                            tier,
                            phase,
                            bool(cfg.get("thinking", False)),
                            str(cfg.get("reasoningEffort", "medium")),
                        )
                try:
                    write_json(ctx.manifest_json, manifest)
                    st.success(
                        "Sparade Autofix & Kvalitet-inställningar till config/ai_models/manifest.json."
                    )
                    st.rerun()
                except Exception:
                    st.error("Kunde inte spara manifest.json.")

    elif page == "Mental modell":
        st.header("Mental modell — schema.md")
        if ctx.schema_md.exists():
            st.markdown(ctx.schema_md.read_text(encoding="utf-8"))
        else:
            st.warning(f"Filen {ctx.schema_md} hittades inte.")

        st.divider()
        st.subheader("Snabbfakta")
        manifests = get_all_manifests(ctx)
        st.markdown(f"- **Antal scaffolds:** {len(manifests)}")
        st.markdown(f"- **Scaffold-IDs:** {', '.join(m.get('id', '?') for m in manifests)}")
        site_kinds = {m.get('siteKind', '?') for m in manifests if m.get("siteKind")}
        st.markdown(f"- **Site kinds:** {', '.join(sorted(site_kinds))}")
        complexities = {m.get('complexity', '?') for m in manifests if m.get("complexity")}
        st.markdown(f"- **Complexities:** {', '.join(sorted(complexities))}")

