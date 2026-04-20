from __future__ import annotations

import os

import streamlit as st

from backoffice.shared import (
    BackofficeContext,
    collect_prompt_dump_statuses,
    read_json,
    render_where_panel,
)


def render(ctx: BackofficeContext) -> None:
    domain_map = read_json(ctx.domain_map_json) if ctx.domain_map_json.is_file() else {"pages": {}}
    st.header("Preview och versioner")
    render_where_panel("Preview och versioner", domain_map)
    log_dir = ctx.repo_root / "logs" / "generationslogg"
    latest_runs = (
        sorted([p for p in log_dir.iterdir() if p.is_dir()], key=lambda p: p.stat().st_mtime, reverse=True)[:5]
        if log_dir.is_dir()
        else []
    )

    c1, c2, c3 = st.columns(3)
    c1.metric("Generationslogg", "finns" if log_dir.is_dir() else "saknas")
    c2.metric("Senaste körningar", len(latest_runs))
    c3.metric("Tier-2 docs", "fas3-preview-and-deploy.md")

    if latest_runs:
        st.markdown("**Senaste generationskörningar**")
        for run in latest_runs:
            st.markdown(f"- `{run.relative_to(ctx.repo_root).as_posix()}`")

    prompt_dump_rows = collect_prompt_dump_statuses(
        ctx.repo_root,
        env_value=os.environ.get("SAJTMASKIN_PROMPT_DUMP"),
    )
    if prompt_dump_rows:
        st.markdown("**Prompt-dumps**")
        st.dataframe(
            [
                {
                    "Kategori": row["category"],
                    "Status": row["status"],
                    "DumpedAt": row["dumpedAt"] or "missing",
                    "StatusUpdatedAt": row["statusUpdatedAt"] or "—",
                    "Filer": ", ".join(row["presentFiles"]) if row["presentFiles"] else "none",
                    "Notis": row["note"],
                }
                for row in prompt_dump_rows
            ],
            width="stretch",
            hide_index=True,
        )
        st.caption(
            "`orchestration-dynamic` skriver `latest.md` + `generation-input-package.json`. "
            "Om status är `disabled` ska befintliga payloadfiler läsas som stale-risk."
        )

    st.info(
        "Det här spåret handlar om `engine_versions`, `server-verify`, `repair`, "
        "`preview-ready`/VM-preview och hur buildern växlar mellan versioner."
    )

    st.subheader("Fas 3-status (begrepp)")
    st.markdown(
        """
- **`repair_available`**: serverrepair passerade quality gate men väntar på `accept-repair`.
- **`accept-repair`**: applicerar staged `repaired_files_json` till `files_json` för senaste versionen.
- **Auto-accept timeout**: styrs av `repairPolicies.repairAcceptTimeoutMinutes` i `manifest.json`.
- **Verify install-signaler**: `install-cache-share` (node_modules-delning) och `install-peer-fallback` (peer-fallback använd).
- **SSE för pending repair**: `version-repair-available` triggar klientnotis + versions-refresh.
"""
    )

    st.subheader("F2 / F3 livscykel (2026-04)")
    st.markdown(
        """
- **F2 (`previewPolicy: fidelity2`)** — design-loopen. `designPreview` quality gate (`["typecheck"]`). Tier-3 SDK-imports
  (Stripe, Supabase, Clerk, Auth.js, Redis, OpenAI, …) strippas mekaniskt av `tier3-sdk-guard-fixer`.
- **F3 (`previewPolicy: fidelity3`)** — bygg integrationer. `integrationsBuild` quality gate (`["typecheck", "build"]`).
  Triggas ENBART explicit via `POST /api/engine/chats/[chatId]/finalize-design`. Validerar tier-3 readiness mot
  projektets stored env-vars; returnerar `412` med `missingByIntegration` om någon `requiredRealEnvKeys` saknas.
- **`engine_versions.lifecycle_stage`**: `"design"` (F2) eller `"integrations"` (F3). F3-versioner pekar på sin
  F2-rot via `engine_versions.parent_version_id`.
- **Pre-VM typecheck**: ny finalize-fas (`pre_vm_typecheck`) som kör `tsc --noEmit` mot en varm scaffold-`node_modules`-cache och
  försöker en LLM-fix-pass innan filer går till VM. Aktiveras via `SAJTMASKIN_PRE_VM_TYPECHECK`; F3 kör alltid med `force=true`.
- **Placeholder-merge** (`src/lib/gen/preview/env-local.ts`): `harmless → tier3-stub → project-preview → user → generated`.
  Vid F3 hoppas tier-3-stub-laget över helt. Per-key-klassificering: `src/lib/integrations/placeholder-harmless.ts`.
"""
    )

