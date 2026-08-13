from __future__ import annotations

from typing import Any

import pandas as pd
import streamlit as st

from backoffice.shared import BackofficeContext

from .constants import BLOB_MANIFEST_REL


def _render_tree_view(
    ctx: BackofficeContext,
    manifests: list[dict[str, Any]],
    variants_by_scaffold: dict[str, list[dict[str, Any]]],
    inspiration_lookup: dict[str, dict[str, Any]],
    inspiration_sources: list[str],
    runtime_dossier_counts: dict[str, int],
) -> None:
    total_links = sum(
        len(variant.get("sourceTemplateIds", []) or [])
        for variants in variants_by_scaffold.values()
        for variant in variants
        if isinstance(variant, dict)
    )
    unresolved_links = sorted(
        {
            template_id
            for variants in variants_by_scaffold.values()
            for variant in variants
            for template_id in (variant.get("sourceTemplateIds", []) or [])
            if template_id not in inspiration_lookup
        }
    )

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Scaffolds", len(manifests))
    c2.metric("Varianter", sum(len(variants) for variants in variants_by_scaffold.values()))
    c3.metric("Inspirationsreferenser (sourceTemplateIds)", total_links)
    c4.metric("Oupplösta referenser", len(unresolved_links))

    runtime_total = runtime_dossier_counts.get("hard", 0) + runtime_dossier_counts.get("soft", 0)
    st.caption(
        "**Inspirationsreferenser ≠ runtime dossiers.** Variantens `sourceTemplateIds` är "
        "inspirationsetiketter som slås upp mot Blob-manifestet "
        f"(`{BLOB_MANIFEST_REL}`, v0-mallarna i Vercel Blob). Sedan 2026-07-22 ska alla id:n "
        "vara upplösbara — oupplösta id:n fälls av integritetsgrinden "
        "(`variant-integrity.test.ts`) och blockeras vid sparande här. Inget "
        "injiceras från dem. Runtime-dossiers under `data/dossiers/{hard,soft}/` är en "
        f"separat pool: {runtime_total} dossiers "
        f"(hard={runtime_dossier_counts.get('hard', 0)}, soft={runtime_dossier_counts.get('soft', 0)}). "
        "Se **Byggblock (dossiers)** i backoffice för runtime-poolen."
    )

    if inspiration_sources:
        st.caption(
            "Referensmetadata laddas från: "
            + ", ".join(f"`{source}`" for source in inspiration_sources)
        )

    overview_rows = []
    for manifest in manifests:
        scaffold_id = str(manifest.get("id", "")).strip()
        variants = variants_by_scaffold.get(scaffold_id, [])
        linked_ids = [
            template_id
            for variant in variants
            for template_id in (variant.get("sourceTemplateIds", []) or [])
        ]
        overview_rows.append(
            {
                "scaffold": scaffold_id,
                "label": manifest.get("label", ""),
                "variants": len(variants),
                "referenser": len(linked_ids),
                "oupplösta": sum(
                    1 for template_id in linked_ids if template_id not in inspiration_lookup
                ),
            }
        )

    if overview_rows:
        st.dataframe(pd.DataFrame(overview_rows), width="stretch", hide_index=True)

    if unresolved_links:
        with st.expander(
            f"Oupplösta sourceTemplateIds ({len(unresolved_links)}) — måste åtgärdas",
            expanded=False,
        ):
            st.caption(
                "Id:n som inte finns i Blob-manifestet kan inte väljas som "
                "runtime-inspiration och fälls av integritetsgrinden. Byt dem mot "
                "giltiga Blob-id:n via **Guide** innan varianten sparas."
            )
            for template_id in unresolved_links:
                st.markdown(f"- `{template_id}`")

    for manifest in manifests:
        scaffold_id = str(manifest.get("id", "")).strip()
        variants = variants_by_scaffold.get(scaffold_id, [])
        label = manifest.get("label", scaffold_id)
        with st.expander(f"{label} (`{scaffold_id}`) — {len(variants)} varianter", expanded=False):
            if not variants:
                st.info("Inga variant-JSON hittades för den här scaffolden.")
                continue

            for variant in variants:
                variant_id = str(variant.get("id", "")).strip()
                variant_label = str(variant.get("label", variant_id)).strip()
                keyword_count = len(variant.get("keywords", []) or [])
                source_ids = variant.get("sourceTemplateIds", []) or []
                reference_ids = variant.get("referenceScaffoldIds", []) or []
                motif = str(variant.get("signatureMotif", "")).strip()
                st.markdown(f"### {variant_label} (`{variant_id}`)")
                st.markdown(f"- `colorMode`: `{variant.get('colorMode', 'either')}`")
                st.markdown(f"- `signatureMotif`: {motif or 'saknas'}")
                st.markdown(f"- `keywords`: {keyword_count}")
                st.markdown(f"- `sourceTemplateIds`: {len(source_ids)}")
                if reference_ids:
                    st.markdown(
                        f"- `referenceScaffoldIds`: {', '.join(f'`{scaffold}`' for scaffold in reference_ids)}"
                    )

                if source_ids:
                    reference_rows = []
                    for template_id in source_ids:
                        entry = inspiration_lookup.get(template_id)
                        reference_rows.append(
                            {
                                "id": template_id,
                                "title": entry.get("title", "") if entry else "oupplöst (legacy-etikett)",
                                "category": entry.get("categorySlug", "") if entry else "",
                                "källa": entry.get("_source", "") if entry else "—",
                            }
                        )
                    st.dataframe(pd.DataFrame(reference_rows), width="stretch", hide_index=True)

                with st.expander("Visa variant-JSON", expanded=False):
                    st.json(
                        {
                            key: value
                            for key, value in variant.items()
                            if not str(key).startswith("_")
                        }
                    )




def _render_pipeline_tools(ctx: BackofficeContext) -> None:
    st.caption(
        "Här kör du variantshärledning och relevanta scaffold/template-artifacts utan att lämna lifecycle-vyn."
    )

    st.info(
        "Den gamla `scaffold_cli.py`-pipen avvecklades 2026-04-17. "
        "Efter skapa/ändra: använd **index-grinden** högst upp (kräver Blob). "
        "Terminalen är fallback, alltid med `--require-blob`:\n\n"
        "- `npm run scaffolds:embeddings -- --require-blob` — ny scaffold i Auto-match\n"
        "- `npm run scaffolds:variant-embeddings -- --require-blob` — ny/ändrad variant\n"
        "- `npm run scaffolds:variant-patterns` — AI-curate `signaturePatterns`\n"
        "- `npm run dossiers:curate -- --reference=<id> --class=<hard|soft> --id=<new>` — "
        "AI-curate ett nytt dossier-utkast från `data/template-references/repos/`. "
        "Inga dossier-embeddings längre — urvalet är capability-driven (v2)."
    )
