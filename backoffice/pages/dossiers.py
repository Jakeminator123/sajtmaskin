"""
Backoffice page: Dossiers — overview + möblering.

Lets the user:
- See all dossiers (active + draft) per category.
- Edit scaffold-recommendations.json (which dossiers a scaffold prefers)
  via a friendly UI instead of editing JSON by hand.
- Trigger pipeline steps: scrape, enrich, import, rebuild index,
  regenerate embeddings, build curation queue.
- See curation-kö (read-only — markera i markdown-filen själv eller
  via promote-to-draft).

Code source-of-truth:
- data/dossiers/<id>/manifest.json                          (per-dossier)
- data/dossiers/_index/master.json                          (aggregat)
- data/dossiers/_index/by-category.json                     (active-only)
- data/dossiers/_index/scaffold-recommendations.json        (möbleringsbar)
- scripts/dossiers/*.ts                                     (pipeline-skript)
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

import streamlit as st


REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DOSSIER_ROOT = REPO_ROOT / "data" / "dossiers"
INDEX_ROOT = DOSSIER_ROOT / "_index"
RAW_ROOT = DOSSIER_ROOT / "_raw"

MASTER_PATH = INDEX_ROOT / "master.json"
BY_CATEGORY_PATH = INDEX_ROOT / "by-category.json"
RECOMMENDATIONS_PATH = INDEX_ROOT / "scaffold-recommendations.json"
EMBEDDINGS_PATH = INDEX_ROOT / "dossier-embeddings.json"
COMPAT_REPORT_PATH = INDEX_ROOT / "compat-report.json"
GITHUB_SUMMARY_PATH = RAW_ROOT / "_enriched" / "_github-summary.json"
CURATION_QUEUE_PATH = RAW_ROOT / "_curation-queue.md"
ENRICHED_DIR = RAW_ROOT / "_enriched"
CURATE_BATCH_LOG = INDEX_ROOT / "curate-batch.log"

VARIANT_EMBEDDINGS_PATH = REPO_ROOT / "config" / "scaffold-variants" / "_index" / "variant-embeddings.json"
SCAFFOLD_VARIANTS_DIR = REPO_ROOT / "config" / "scaffold-variants"

SCAFFOLD_IDS = (
    "base-nextjs", "landing-page", "saas-landing", "portfolio", "blog",
    "dashboard", "auth-pages", "ecommerce", "content-site", "app-shell",
)

CATEGORY_DESCRIPTIONS = {
    "auth": "Inloggning/registrering — Clerk, Auth0, NextAuth, Supabase Auth, multi-tenant",
    "payments": "Betalningar — Stripe Checkout/Subscription, Paddle, ecommerce-flöden",
    "database": "Persistens — Postgres, Supabase, Mongo, Drizzle, Prisma, Redis",
    "cms": "Innehållshantering — Sanity, Payload, Contentful, Notion, WordPress",
    "realtime": "Live-uppdateringar — Liveblocks, Ably, presence/cursors",
    "bookings": "Bokningar — Cal.com, Calendly",
    "email": "E-postutskick — Resend, transactional email",
    "analytics": "Analytics + feature flags — PostHog, A/B-testning",
    "ai": "AI — chatbot, RAG, agents, voice, AI SDK",
    "storage": "Filer — Vercel Blob, S3, Cloudinary",
    "search": "Sökning — Algolia, Meilisearch, Xata",
    "ui-marketing": "Marketing-sektioner — pricing-table, hero, testimonials",
    "ui-content": "Innehållssektioner — blog-list, docs-sidor",
    "ui-data": "Data-sektioner — dashboard-widgets, tabeller",
}


def _load_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def _save_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _run_cmd(cmd: list[str], cwd: Path = REPO_ROOT, timeout_s: int = 120) -> tuple[bool, str]:
    """Run a shell command and capture output. Returns (ok, combined_output).

    Default timeout 120s suits most short steps (compat, index, recommend, queue,
    promote). Long-running jobs (clone-repos, curate, full bulk-enrich) should
    run from terminal — surface a friendly message instead of silently aborting.
    """
    try:
        result = subprocess.run(
            cmd, cwd=str(cwd), capture_output=True, text=True, check=False, timeout=timeout_s,
        )
        out = (result.stdout or "") + (result.stderr or "")
        return result.returncode == 0, out
    except subprocess.TimeoutExpired:
        return (
            False,
            f"Command timed out after {timeout_s}s. Long jobs (`dossiers:enrich`, `dossiers:curate`, "
            "`dossiers:clone-repos`, full `dossiers:github-enrich`) should run from terminal — "
            "see `npm run dossiers:full-pipeline` or run the step manually.",
        )
    except FileNotFoundError as e:
        return False, f"Missing binary: {e}"


def _section_overview() -> None:
    st.subheader("Översikt")

    master = _load_json(MASTER_PATH)
    if master is None:
        st.warning(
            "Inga dossiers indexerade än. Kör `npm run dossiers:rebuild` "
            "från terminalen, eller använd Pipeline-fliken nedan."
        )
        return

    total = master.get("totalDossiers", 0)
    active = master.get("activeDossiers", 0)
    draft = master.get("draftDossiers", 0)
    cols = st.columns(4)
    cols[0].metric("Totalt", total)
    cols[1].metric("Aktiva", active)
    cols[2].metric("Drafts", draft)
    cols[3].metric("Embeddings", "ja" if EMBEDDINGS_PATH.exists() else "saknas")

    by_category = _load_json(BY_CATEGORY_PATH) or {"categories": {}}
    cat_counts = {cat: len(ids) for cat, ids in by_category.get("categories", {}).items()}

    if cat_counts:
        st.markdown("**Aktiva dossiers per kategori** (drafts visas ej i runtime)")
        rows = sorted(
            [(c, n, CATEGORY_DESCRIPTIONS.get(c, "")) for c, n in cat_counts.items()],
            key=lambda x: -x[1],
        )
        st.table([{"Kategori": c, "Antal": n, "Beskrivning": desc} for c, n, desc in rows])

    if master.get("warnings"):
        with st.expander(f"Varningar ({len(master['warnings'])}) — drafts har ofta files: missing"):
            for w in master["warnings"][:30]:
                st.text(f"• {w}")


def _load_embeddings_index() -> set[str]:
    """Set of dossier ids that have an embedding."""
    data = _load_json(EMBEDDINGS_PATH)
    if not data:
        return set()
    return {e["id"] for e in data.get("embeddings", []) if "id" in e}


def _section_dossier_list() -> None:
    st.subheader("Alla dossiers")
    master = _load_json(MASTER_PATH)
    if not master or master.get("totalDossiers", 0) == 0:
        st.info("Inga dossiers att visa.")
        return

    dossiers = master.get("dossiers", [])
    embedded_ids = _load_embeddings_index()

    show_drafts = st.checkbox("Visa drafts", value=True)
    filter_cat = st.selectbox(
        "Filtrera kategori",
        ["(alla)"] + sorted({d["category"] for d in dossiers}),
    )

    rows: list[dict[str, Any]] = []
    for d in dossiers:
        status = d.get("_status", "active")
        if not show_drafts and status == "draft":
            continue
        if filter_cat != "(alla)" and d["category"] != filter_cat:
            continue
        files_declared = len(d.get("files", []))
        files_present = d.get("_filesPresent", 0)
        env_count = len(d.get("envVars", []))
        deps_count = len(d.get("dependencies", []))
        curated_by = d.get("_curatedBy")
        if curated_by == "auto-curate.ts":
            curation = "🤖 AI"
        elif status == "active":
            curation = "✋ hand"
        else:
            curation = "—"
        depreciated = d.get("_deprecationReason")
        replacement = d.get("_replacementUrl")
        deprecation_short = ""
        if depreciated:
            deprecation_short = depreciated[:80] + ("…" if len(depreciated) > 80 else "")
            if replacement:
                deprecation_short += f"  →  {replacement.split('://')[-1][:50]}"
        rows.append({
            "id": d["id"],
            "kind": d["kind"],
            "category": d["category"],
            "label": d["label"],
            "status": status,
            "curated": curation,
            "files": f"{files_present}/{files_declared}",
            "deps": deps_count,
            "env": env_count,
            "embedding": "✓" if d["id"] in embedded_ids else "—",
            "quality": d.get("qualityScore", "—"),
            "primary_for": ", ".join(d.get("scaffoldFit", {}).get("primary", [])) or "—",
            "deprecation": deprecation_short or "—",
        })
    rows.sort(key=lambda r: (r["status"] != "active", r["category"], r["id"]))
    st.dataframe(rows, width="stretch", hide_index=True)
    st.caption(
        f"Visar {len(rows)} dossiers. "
        f"🤖 = AI-kurerad via `auto-curate.ts`. "
        f"✋ = hand-skriven. "
        f"`embedding ✓` = dossiern matchas semantiskt mot prompts vid runtime. "
        f"`deprecation` = informationsflagga (källan brustit) — runtime-filtrering drivs av `status`-kolumnen."
    )


def _section_recommendations() -> None:
    st.subheader("Möblering — vilka dossiers rekommenderas per scaffold")
    st.caption(
        "Tre nivåer: **alwaysInclude** (alltid med oavsett prompt), "
        "**primaryRecommended** (boost +0.15 i embedding-rankning), "
        "**suggested** (boost +0.05). Pool-modellen — alla dossiers är "
        "tekniskt sett tillgängliga oavsett, det här är bara rankings-hint."
    )

    rec = _load_json(RECOMMENDATIONS_PATH)
    if not rec:
        st.warning(
            "scaffold-recommendations.json saknas. Kör `npm run dossiers:recommend` "
            "(eller använd Pipeline-fliken)."
        )
        return

    master = _load_json(MASTER_PATH) or {"dossiers": []}
    all_dossier_ids = sorted(d["id"] for d in master.get("dossiers", []))

    selected_scaffold = st.selectbox("Scaffold", SCAFFOLD_IDS)
    bucket = rec.get("scaffolds", {}).get(selected_scaffold, {
        "alwaysInclude": [], "primaryRecommended": [], "suggested": [],
    })

    cols = st.columns(3)
    with cols[0]:
        st.markdown("**alwaysInclude**")
        new_always = st.multiselect(
            "Alltid med",
            options=all_dossier_ids,
            default=bucket.get("alwaysInclude", []),
            key=f"always_{selected_scaffold}",
            label_visibility="collapsed",
        )
    with cols[1]:
        st.markdown("**primaryRecommended**")
        new_primary = st.multiselect(
            "Primär rekommendation",
            options=all_dossier_ids,
            default=bucket.get("primaryRecommended", []),
            key=f"primary_{selected_scaffold}",
            label_visibility="collapsed",
        )
    with cols[2]:
        st.markdown("**suggested**")
        new_suggested = st.multiselect(
            "Förslag",
            options=all_dossier_ids,
            default=bucket.get("suggested", []),
            key=f"suggested_{selected_scaffold}",
            label_visibility="collapsed",
        )

    if st.button(f"Spara ändringar för {selected_scaffold}", type="primary"):
        rec.setdefault("scaffolds", {})[selected_scaffold] = {
            "alwaysInclude": sorted(set(new_always)),
            "primaryRecommended": sorted(set(new_primary)),
            "suggested": sorted(set(new_suggested)),
        }
        rec["generationMode"] = "manual"
        _save_json(RECOMMENDATIONS_PATH, rec)
        st.success(f"Sparat. Använd `npm run dossiers:recommend:merge` om du vill lägga till nytillkomna utan att förlora dina ändringar.")


def _list_skiss_files() -> dict[str, list[dict[str, Any]]]:
    by_cat: dict[str, list[dict[str, Any]]] = {}
    if not RAW_ROOT.exists():
        return by_cat
    for entry in RAW_ROOT.iterdir():
        if not entry.is_dir() or entry.name.startswith("_"):
            continue
        skiss_path = entry / "skiss.json"
        if not skiss_path.exists():
            continue
        try:
            data = json.loads(skiss_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        category = data.get("category", "uncategorized")
        by_cat.setdefault(category, []).append(data)
    for cat in by_cat:
        by_cat[cat].sort(
            key=lambda d: ((d.get("github") or {}).get("stargazers_count", 0) or 0),
            reverse=True,
        )
    return by_cat


def _write_promotions_list(ids: list[str], append: bool = True) -> None:
    path = REPO_ROOT / "scripts" / "dossiers" / "curated-promotions.txt"
    existing: set[str] = set()
    if append and path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            stripped = line.split("#", 1)[0].strip()
            if stripped:
                existing.add(stripped)
    final = sorted(existing | set(ids))
    body = "\n".join(final) + "\n"
    path.write_text(body, encoding="utf-8")


def _section_curation_queue() -> None:
    st.subheader("Promotion: skiss → draft → active")

    skiss_by_cat = _list_skiss_files()
    if not skiss_by_cat:
        st.info(
            "Inga skiss-filer i `_raw/`. Kör pipeline från terminal: "
            "`npm run dossiers:full-pipeline`."
        )
        return

    total_skiss = sum(len(v) for v in skiss_by_cat.values())
    st.caption(
        f"**{total_skiss} skiss-kandidater** över {len(skiss_by_cat)} kategorier. "
        "Skiss = scrape-output, väntar på promotion till `draft`. "
        "Drafts måste curreras (filer + instructions) innan de blir runtime-aktiva."
    )

    with st.expander("⚠ Storage-prognos om du promotar alla", expanded=False):
        st.markdown(
            f"- **{total_skiss} repos** shallow-clonas till `data/dossiers/_repo-cache/`\n"
            f"- Uppskattning: **~3-15 MB per repo** ≈ **{total_skiss * 8} MB** "
            f"({total_skiss * 8 // 1024 + 1} GB) totalt\n"
            "- `_repo-cache/` är `.gitignore`-täckt — belastar inte git\n"
            "- AI-kuration via `auto-curate.ts`: **~$0.02-0.10 per dossier** (gpt-5.4)\n"
            f"  → **${total_skiss * 0.05:.0f}-${total_skiss * 0.15:.0f}** för hela batchen\n"
            "- AI-kuration tar **~10-15 sek per dossier** ≈ "
            f"**{total_skiss * 12 // 60} min** för hela batchen"
        )

    cols = st.columns(3)
    with cols[0]:
        if st.button("📌 Promote ALLA"):
            all_ids = [s["id"] for cat in skiss_by_cat.values() for s in cat]
            _write_promotions_list(all_ids, append=False)
            with st.spinner(f"Skapar {len(all_ids)} drafts…"):
                ok, out = _run_cmd(["npm", "run", "dossiers:promote"])
                (st.success if ok else st.error)(out[-2500:])
                if ok:
                    st.info(
                        "Nästa steg (kör i terminal):\n"
                        "`npm run dossiers:full-pipeline -- --with-clone --with-extract "
                        "--with-curate --with-rebuild`"
                    )
    with cols[1]:
        if st.button("🧹 Töm curated-promotions.txt"):
            _write_promotions_list([], append=False)
            st.success("Töm.")
    with cols[2]:
        if st.button("🔄 Bygg om _curation-queue.md"):
            ok, out = _run_cmd(["npm", "run", "dossiers:queue"])
            (st.success if ok else st.error)(out[-1500:])

    st.markdown("---")
    st.markdown("**Granulär promotion** — välj specifika kandidater per kategori.")
    if "promotion_selection" not in st.session_state:
        st.session_state["promotion_selection"] = set()
    selected: set[str] = st.session_state["promotion_selection"]

    selected_cat = st.selectbox(
        "Kategori",
        sorted(skiss_by_cat.keys()),
        format_func=lambda c: f"{c} ({len(skiss_by_cat.get(c, []))})",
    )
    candidates = skiss_by_cat.get(selected_cat, [])
    rows = []
    for s in candidates:
        gh = s.get("github") or {}
        rows.append({
            "✓": s["id"] in selected,
            "id": s["id"],
            "title": s.get("title", ""),
            "stars": gh.get("stargazers_count", "—") if gh else "—",
            "ageDays": gh.get("ageDays", "—") if gh else "—",
            "verdict": gh.get("sourceVerdict", "—") if gh else "—",
            "repoUrl": (s.get("repoUrl") or "").replace("https://github.com/", "gh:"),
        })
    edited = st.data_editor(
        rows,
        width="stretch",
        hide_index=True,
        key=f"promo_editor_{selected_cat}",
        column_config={
            "✓": st.column_config.CheckboxColumn(width="small"),
            "stars": st.column_config.NumberColumn("★", width="small"),
            "ageDays": st.column_config.NumberColumn("ålder (d)", width="small"),
            "verdict": st.column_config.TextColumn("källa", width="small"),
        },
    )
    cat_ids_in_view = {r["id"] for r in edited}
    new_selection = {r["id"] for r in edited if r["✓"]}
    selected -= cat_ids_in_view
    selected |= new_selection
    st.session_state["promotion_selection"] = selected

    st.caption(f"**Valt över alla kategorier: {len(selected)}**")
    cols2 = st.columns(2)
    with cols2[0]:
        if st.button(
            f"📌 Promote valda ({len(selected)})",
            type="primary",
            disabled=len(selected) == 0,
        ):
            _write_promotions_list(sorted(selected), append=True)
            with st.spinner(f"Skapar {len(selected)} drafts…"):
                ok, out = _run_cmd(["npm", "run", "dossiers:promote"])
                (st.success if ok else st.error)(out[-2500:])
                if ok:
                    st.session_state["promotion_selection"] = set()
                    st.rerun()
    with cols2[1]:
        if st.button("🗑 Rensa valda"):
            st.session_state["promotion_selection"] = set()
            st.rerun()

    if CURATION_QUEUE_PATH.exists():
        with st.expander("Se rådata: _curation-queue.md"):
            st.markdown(CURATION_QUEUE_PATH.read_text(encoding="utf-8"))


def _section_ai_curate() -> None:
    st.subheader("AI-kurering (LLM gör grovjobbet)")
    st.caption(
        "GPT-5.4 läser varje draft (manifest + komponentfiler + .env.example) "
        "och producerar: konkret summary, valid providers, ren files-lista (rensar "
        "template-fluff), saknade filer (t.ex. middleware.ts), full instructions.md, "
        "tags, qualityScore, scaffoldFit. Sätter `_status: active`. "
        "Borttagna filer flyttas till `_removed/` så du kan rulla tillbaka."
    )

    master = _load_json(MASTER_PATH) or {"dossiers": []}
    drafts = [d for d in master.get("dossiers", []) if d.get("_status") == "draft"]
    actives = [d for d in master.get("dossiers", []) if d.get("_status") == "active"]
    auto_curated = [d for d in actives if d.get("_curatedBy") == "auto-curate.ts"]

    cols = st.columns(3)
    cols[0].metric("Drafts kvar", len(drafts))
    cols[1].metric("Aktiva totalt", len(actives))
    cols[2].metric("Varav AI-kurerade", len(auto_curated))

    if CURATE_BATCH_LOG.exists():
        log_size = CURATE_BATCH_LOG.stat().st_size
        st.caption(f"Senaste batch-logg: `data/dossiers/_index/curate-batch.log` ({log_size/1024:.1f} KB)")
        with st.expander("Visa senaste batch-logg (sista 80 rader)"):
            text = CURATE_BATCH_LOG.read_text(encoding="utf-8", errors="replace")
            tail = "\n".join(text.splitlines()[-80:])
            st.code(tail)

    st.markdown("**Kör en specifik dossier (verifiera först med dry-run):**")
    draft_ids = [d["id"] for d in drafts]
    if draft_ids:
        target = st.selectbox("Draft att kurera", draft_ids, key="ai_curate_target")
        c1, c2 = st.columns(2)
        with c1:
            if st.button("🔍 Dry-run (visa förslag, skriv inget)"):
                with st.spinner(f"GPT-5.4 analyserar {target}…"):
                    ok, out = _run_cmd(
                        ["npx", "tsx", "scripts/dossiers/auto-curate.ts", "--dry-run", f"--only={target}"]
                    )
                (st.success if ok else st.error)(out[-3000:])
        with c2:
            if st.button("✅ Kör på riktigt (skriv ändringar)"):
                with st.spinner(f"GPT-5.4 kurerar {target}…"):
                    ok, out = _run_cmd(
                        ["npx", "tsx", "scripts/dossiers/auto-curate.ts", f"--only={target}"]
                    )
                (st.success if ok else st.error)(out[-3000:])
                if ok:
                    st.info("Glöm inte: kör `npm run dossiers:index && npm run dossiers:embeddings` efteråt.")
    else:
        st.info("Inga drafts kvar att kurera. 🎉")

    st.markdown("**Batch — kör i terminal (15+ min, ~$1-3 OpenAI-kostnad):**")
    st.code("npm run dossiers:curate                     # alla drafts", language="bash")
    st.code("npm run dossiers:curate -- --limit=5        # max 5 åt gången", language="bash")
    st.code("npm run dossiers:curate -- --force --only=<id>  # re-kurera aktiv", language="bash")


def _section_pipeline_actions() -> None:
    st.subheader("Pipeline-åtgärder")
    st.caption(
        "Korta åtgärder körs här direkt. Långa (scrape, enrich, embeddings, batch-curate) "
        "körs bättre från terminalen — visa kommandot."
    )

    cols = st.columns(2)

    with cols[0]:
        st.markdown("**Snabbt (kör här)**")
        if st.button("Bygg om master + by-category index"):
            ok, out = _run_cmd(["npm", "run", "dossiers:index"])
            (st.success if ok else st.error)(out[-1500:])
        if st.button("Regenerera scaffold-recommendations (merge — bevara dina edits)"):
            ok, out = _run_cmd(["npm", "run", "dossiers:recommend:merge"])
            (st.success if ok else st.error)(out[-1500:])
        if st.button("Bygg om kurations-kö"):
            ok, out = _run_cmd(["npm", "run", "dossiers:queue"])
            (st.success if ok else st.error)(out[-1500:])
        if st.button("Importera från enriched-data om → skiss-filer"):
            ok, out = _run_cmd(["npm", "run", "dossiers:import"])
            (st.success if ok else st.error)(out[-1500:])
        if st.button("Promota draft-dossiers från curated-promotions.txt"):
            ok, out = _run_cmd(["npm", "run", "dossiers:promote"])
            (st.success if ok else st.error)(out[-1500:])
        if st.button("Auto-extrahera filer + deps + env från _repo-cache"):
            ok, out = _run_cmd(["npm", "run", "dossiers:extract-files"])
            (st.success if ok else st.error)(out[-1500:])

    with cols[1]:
        st.markdown("**Långt — kör i terminal**")
        st.code("npm run dossiers:scrape", language="bash")
        st.caption("Hämtar katalog (~3 min, 419 templates)")
        st.code("npm run dossiers:enrich", language="bash")
        st.caption("Hämtar detaljsidor med riktiga badges (~14 min, 419 templates)")
        st.code("npm run dossiers:embeddings", language="bash")
        st.caption("Embeddings för alla active dossiers (~30 sek, kräver OPENAI_API_KEY)")
        st.code("npm run dossiers:clone-repos", language="bash")
        st.caption("Shallow-cklona alla draft-repon till _repo-cache/ (~5 min, ~290 MB)")
        st.code("npm run dossiers:curate", language="bash")
        st.caption("AI-kurera alla drafts via GPT-5.4 (~15 min, ~$1-3, kräver OPENAI_API_KEY)")
        st.code("npm run dossiers:rebuild", language="bash")
        st.caption("index + recommend:merge + embeddings i sekvens")


def _section_scaffold_overview() -> None:
    st.subheader("Scaffolds + variants")
    st.caption(
        "10 scaffolds är skeletten. Varje scaffold har 1-3 varianter (estetiska "
        "tolkningar). Embeddings (om de finns) gör att rätt variant väljs "
        "semantiskt utifrån prompten."
    )

    if not SCAFFOLD_VARIANTS_DIR.exists():
        st.warning("config/scaffold-variants/ saknas.")
        return

    variant_files = sorted(SCAFFOLD_VARIANTS_DIR.glob("*.json"))
    variant_data: list[dict[str, Any]] = []
    embedded_variant_ids: set[str] = set()
    if VARIANT_EMBEDDINGS_PATH.exists():
        ve = _load_json(VARIANT_EMBEDDINGS_PATH) or {}
        embedded_variant_ids = {e.get("id") for e in ve.get("embeddings", []) if e.get("id")}

    for vf in variant_files:
        if vf.stem.startswith("_"):
            continue
        v = _load_json(vf) or {}
        variant_data.append({
            "scaffold": v.get("scaffoldId", "—"),
            "variant_id": v.get("id", vf.stem),
            "label": v.get("label", "—"),
            "default": "✓" if v.get("isDefault") else "—",
            "fonts": ", ".join((v.get("design", {}) or {}).get("fonts", [])) or "—",
            "embedding": "✓" if v.get("id") in embedded_variant_ids else "—",
        })

    variant_data.sort(key=lambda r: (r["scaffold"], r["default"] != "✓", r["variant_id"]))
    st.dataframe(variant_data, width="stretch", hide_index=True)

    cols = st.columns(3)
    cols[0].metric("Variants totalt", len(variant_data))
    cols[1].metric("Med embedding", sum(1 for v in variant_data if v["embedding"] == "✓"))
    cols[2].metric("Default-variants", sum(1 for v in variant_data if v["default"] == "✓"))

    st.markdown("**Generera embeddings för variants:**")
    if st.button("Bygg variant-embeddings (kräver OPENAI_API_KEY)"):
        ok, out = _run_cmd(["npm", "run", "scaffolds:variant-embeddings"])
        (st.success if ok else st.error)(out[-2000:])


def _verdict_emoji(verdict: str) -> str:
    return {
        "ok": "✓",
        "source-archived": "⛔ archived",
        "source-stale": "⏳ stale",
        "source-unreachable": "✗ 404",
        "no-source": "—",
        "skipped": "⏭",
    }.get(verdict, verdict)


def _section_source_health() -> None:
    st.subheader("Källhälsa — GitHub-status för dossier-källor")
    st.caption(
        "Kollar att varje dossier `sourceRepoUrl` (a) inte är arkiverat på "
        "GitHub, (b) har commit nyare än 18 mån, (c) går att nå (inte 404). "
        "Dossiers med `_status: source-archived/-stale/-unreachable` filtreras "
        "automatiskt bort vid runtime-injektion."
    )

    cols = st.columns(3)
    with cols[0]:
        if st.button("🔍 Dry-run compat (ändrar inget)"):
            with st.spinner("Hämtar GitHub-data för alla dossiers…"):
                ok, out = _run_cmd(["npm", "run", "dossiers:compat"])
                (st.success if ok else st.error)(out[-2500:])
    with cols[1]:
        if st.button("✏️ Apply (uppdatera _status i manifests)", type="primary"):
            with st.spinner("Uppdaterar manifests + skriver report…"):
                ok, out = _run_cmd(["npm", "run", "dossiers:compat:apply"])
                if ok:
                    st.success(out[-2500:])
                    st.info("Kör `dossiers:rebuild` för att master.json + recommendations + embeddings ska reflektera de nya statuses.")
                else:
                    st.error(out[-2500:])
    with cols[2]:
        if st.button("📥 Bulk-enrich _enriched/ med GitHub-data"):
            with st.spinner("Hämtar GitHub-API för alla scrape-templates… (~2 min med GITHUB_TOKEN, 7+ min utan)"):
                ok, out = _run_cmd(["npm", "run", "dossiers:github-enrich"], timeout_s=600)
                (st.success if ok else st.error)(out[-2500:])

    report = _load_json(COMPAT_REPORT_PATH)
    if not report:
        st.info("Ingen compat-report ännu. Kör `Dry-run compat` ovan.")
        return

    totals = report.get("totals", {})
    st.markdown("**Senaste resultat**")
    m_cols = st.columns(6)
    m_cols[0].metric("ok", totals.get("ok", 0))
    m_cols[1].metric("archived", totals.get("source-archived", 0))
    m_cols[2].metric("stale", totals.get("source-stale", 0))
    m_cols[3].metric("unreachable", totals.get("source-unreachable", 0))
    m_cols[4].metric("no-source", totals.get("no-source", 0))
    m_cols[5].metric("applied", totals.get("applied", 0))

    results = report.get("results", [])
    bad = [r for r in results if r.get("verdict") not in ("ok", "no-source")]
    if bad:
        st.markdown(f"**Källproblem ({len(bad)} st)** — sortera kolumner för att hitta värsta")
        rows = []
        for r in bad:
            gh = r.get("github") or {}
            rows.append({
                "dossier": r["id"],
                "verdict": _verdict_emoji(r["verdict"]),
                "stars": gh.get("stargazers_count", "—"),
                "ageDays": r.get("ageDays", "—"),
                "archived": "ja" if gh.get("archived") else "—",
                "language": gh.get("language") or "—",
                "skäl": "; ".join(r.get("reasons", []))[:120],
            })
        st.dataframe(rows, width="stretch", hide_index=True)

    summary = _load_json(GITHUB_SUMMARY_PATH)
    if summary:
        st.markdown("**Bulk-enrich-status (alla scraped templates)**")
        verdicts = summary.get("verdicts", {})
        s_cols = st.columns(5)
        s_cols[0].metric("ok", verdicts.get("ok", 0))
        s_cols[1].metric("archived", verdicts.get("source-archived", 0))
        s_cols[2].metric("stale", verdicts.get("source-stale", 0))
        s_cols[3].metric("unreachable", verdicts.get("source-unreachable", 0))
        s_cols[4].metric("totalt", summary.get("totalSidecars", 0))
        st.caption(
            f"Senast: {summary.get('generatedAt', '—')}. "
            "Vid `dossiers:import` skippas archived/unreachable källor automatiskt."
        )

    with st.expander("Hur räknas en källa som dålig?"):
        st.markdown(
            "- **archived**: GitHub `repos/<owner>/<repo>` returnerar `archived: true`\n"
            "- **stale**: `pushed_at > 540 dagar (~18 mån)` sedan\n"
            "- **unreachable**: 404 / parse-error / nätverksfel\n"
            "- **no-source**: dossiern saknar `sourceRepoUrl` (hand-curated, ej skrap-källa)\n\n"
            "Recommendation: sätt `GITHUB_TOKEN` i `.env.local` för 5000 req/h "
            "(annars 60 req/h, räcker bara för aktiva dossiers — inte hela skrap-katalogen)."
        )


def _section_files_on_disk() -> None:
    st.subheader("Filer på disk")
    rows = [
        ("master.json", MASTER_PATH),
        ("by-category.json", BY_CATEGORY_PATH),
        ("scaffold-recommendations.json", RECOMMENDATIONS_PATH),
        ("dossier-embeddings.json", EMBEDDINGS_PATH),
        ("compat-report.json", COMPAT_REPORT_PATH),
        ("_enriched/_github-summary.json", GITHUB_SUMMARY_PATH),
        ("_curation-queue.md", CURATION_QUEUE_PATH),
        ("_enriched/ (folder)", ENRICHED_DIR),
    ]
    out: list[dict[str, Any]] = []
    for label, path in rows:
        if path.is_dir():
            count = sum(1 for _ in path.glob("*.json"))
            out.append({"Fil": label, "Status": "✓ finns", "Storlek": f"{count} filer"})
        elif path.exists():
            size = path.stat().st_size
            out.append({"Fil": label, "Status": "✓ finns", "Storlek": f"{size/1024:.1f} KB"})
        else:
            out.append({"Fil": label, "Status": "✗ saknas", "Storlek": "—"})
    st.table(out)


def render(*_args: Any, **_kwargs: Any) -> None:
    st.title("Dossiers")
    st.caption(
        "Pool av legoklossar (integrationer + UI-sektioner) tillgängliga för alla scaffolds. "
        "Möbleringsbara rekommendationer per scaffold styr ranking vid runtime-injektion. "
        "Format: `docs/architecture/dossier-format.md`"
    )

    tab_overview, tab_list, tab_health, tab_ai, tab_scaffold, tab_recommend, tab_curation, tab_pipeline, tab_files = st.tabs(
        ["Översikt", "Lista", "Källhälsa", "AI-kurera", "Scaffolds & Variants", "Möblera", "Kurations-kö", "Pipeline", "Filer"],
    )

    with tab_overview:
        _section_overview()
    with tab_list:
        _section_dossier_list()
    with tab_health:
        _section_source_health()
    with tab_ai:
        _section_ai_curate()
    with tab_scaffold:
        _section_scaffold_overview()
    with tab_recommend:
        _section_recommendations()
    with tab_curation:
        _section_curation_queue()
    with tab_pipeline:
        _section_pipeline_actions()
    with tab_files:
        _section_files_on_disk()
