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
CURATION_QUEUE_PATH = RAW_ROOT / "_curation-queue.md"
ENRICHED_DIR = RAW_ROOT / "_enriched"

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


def _run_cmd(cmd: list[str], cwd: Path = REPO_ROOT) -> tuple[bool, str]:
    """Run a shell command and capture output. Returns (ok, combined_output)."""
    try:
        result = subprocess.run(
            cmd, cwd=str(cwd), capture_output=True, text=True, check=False, timeout=120,
        )
        out = (result.stdout or "") + (result.stderr or "")
        return result.returncode == 0, out
    except subprocess.TimeoutExpired:
        return False, "Command timed out (>2 min). Run from terminal for long jobs (e.g. dossiers:enrich)."
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


def _section_dossier_list() -> None:
    st.subheader("Alla dossiers")
    master = _load_json(MASTER_PATH)
    if not master or master.get("totalDossiers", 0) == 0:
        st.info("Inga dossiers att visa.")
        return

    dossiers = master.get("dossiers", [])

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
        rows.append({
            "id": d["id"],
            "kind": d["kind"],
            "category": d["category"],
            "label": d["label"],
            "status": status,
            "files_present": d.get("_filesPresent", 0),
            "primary_for": ", ".join(d.get("scaffoldFit", {}).get("primary", [])) or "—",
        })
    rows.sort(key=lambda r: (r["status"] != "active", r["category"], r["id"]))
    st.dataframe(rows, width="stretch", hide_index=True)


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


def _section_curation_queue() -> None:
    st.subheader("Kurations-kö (skiss-filer som väntar på promotion)")
    if not CURATION_QUEUE_PATH.exists():
        st.info(
            "Inga skiss-filer. Kör pipeline: `npm run dossiers:scrape && "
            "npm run dossiers:enrich && npm run dossiers:import && "
            "npm run dossiers:queue`."
        )
        return
    text = CURATION_QUEUE_PATH.read_text(encoding="utf-8")
    skiss_count = sum(1 for line in text.splitlines() if line.strip().startswith("- [ ]"))
    st.caption(f"{skiss_count} kandidater i kön. Markera `[x]` i kö-filen + lägg id i `scripts/dossiers/curated-promotions.txt` för att promota till draft.")
    with st.expander("Visa kö (markdown)"):
        st.markdown(text)


def _section_pipeline_actions() -> None:
    st.subheader("Pipeline-åtgärder")
    st.caption(
        "Korta åtgärder körs här direkt. Långa (scrape, enrich, embeddings) "
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

    with cols[1]:
        st.markdown("**Långt — kör i terminal**")
        st.code("npm run dossiers:scrape", language="bash")
        st.caption("Hämtar katalog (~3 min, 419 templates)")
        st.code("npm run dossiers:enrich", language="bash")
        st.caption("Hämtar detaljsidor med riktiga badges (~14 min, 419 templates)")
        st.code("npm run dossiers:embeddings", language="bash")
        st.caption("Embeddings för alla active dossiers (~30 sek, kräver OPENAI_API_KEY)")
        st.code("npm run dossiers:rebuild", language="bash")
        st.caption("index + recommend:merge + embeddings i sekvens")


def _section_files_on_disk() -> None:
    st.subheader("Filer på disk")
    rows = [
        ("master.json", MASTER_PATH),
        ("by-category.json", BY_CATEGORY_PATH),
        ("scaffold-recommendations.json", RECOMMENDATIONS_PATH),
        ("dossier-embeddings.json", EMBEDDINGS_PATH),
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

    tab_overview, tab_list, tab_recommend, tab_curation, tab_pipeline, tab_files = st.tabs(
        ["Översikt", "Lista", "Möblera", "Kurations-kö", "Pipeline", "Filer"],
    )

    with tab_overview:
        _section_overview()
    with tab_list:
        _section_dossier_list()
    with tab_recommend:
        _section_recommendations()
    with tab_curation:
        _section_curation_queue()
    with tab_pipeline:
        _section_pipeline_actions()
    with tab_files:
        _section_files_on_disk()
