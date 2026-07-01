"""
Error-log RAG backoffice page — Phase 3 visualisation.

Surfaces:
- Producer NDJSON status (row count, latest mtime).
- Indexer status (snapshot meta from data/observability/error-log-tfidf-meta.json).
- Top-N most-frequent fault categories (count of faultId).
- Manual reindex trigger.

Reads logs/NDJSON by default. The optional manual reindex action writes the
TF-IDF snapshot under `data/observability/`; the auto-ingest hook in
`scripts/dev/next-runner.mjs` keeps the same index in sync at npm run dev|build|start.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import streamlit as st

from backoffice.shared import BackofficeContext


def _ndjson_status(repo_root: Path) -> dict[str, Any]:
    p = repo_root / "logs" / "llm-segmentts-and-index" / "error-log.ndjson"
    if not p.exists():
        return {"exists": False}
    stat = p.stat()
    return {
        "exists": True,
        "path": str(p.relative_to(repo_root)),
        "sizeBytes": stat.st_size,
        "mtime": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
    }


def _read_ndjson_rows(repo_root: Path, limit: int = 5000) -> list[dict[str, Any]]:
    p = repo_root / "logs" / "llm-segmentts-and-index" / "error-log.ndjson"
    if not p.exists():
        return []
    rows: list[dict[str, Any]] = []
    try:
        with p.open("r", encoding="utf-8", errors="replace") as fh:
            lines = fh.readlines()
        start = max(0, len(lines) - limit)
        for raw in lines[start:]:
            raw = raw.strip()
            if not raw:
                continue
            try:
                rows.append(json.loads(raw))
            except Exception:
                continue
    except Exception:
        return []
    return rows


def _indexer_meta(repo_root: Path) -> dict[str, Any] | None:
    p = repo_root / "data" / "observability" / "error-log-tfidf-meta.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def _trigger_reindex(repo_root: Path) -> tuple[bool, str]:
    script = repo_root / "scripts" / "observability" / "index-error-log-rag.mjs"
    if not script.exists():
        return False, "Indexer script saknas."
    try:
        result = subprocess.run(
            ["node", str(script), "--force"],
            cwd=repo_root,
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            return False, result.stderr or result.stdout or "Okänt fel."
        return True, result.stdout.strip() or "Klar."
    except Exception as exc:
        return False, str(exc)


def _prod_fault_matrix(repo_root: Path, use_prod: bool = True) -> dict[str, Any]:
    """Read the durable Postgres fault matrix (error_log_events) via the
    read-only `fault-matrix.mjs` script. `use_prod` points it at the pulled
    production snapshot so the human view matches what Vercel prod actually
    logged (the NDJSON view above is local-only)."""
    script = repo_root / "scripts" / "observability" / "fault-matrix.mjs"
    if not script.exists():
        return {"ok": False, "error": "fault-matrix.mjs saknas."}
    args = ["node", str(script), "--json", "--limit", "40"]
    if use_prod:
        args.append("--prod")
    try:
        result = subprocess.run(
            args, cwd=repo_root, capture_output=True, text=True, timeout=30
        )
        # On failure the script still emits a JSON error envelope on stdout.
        try:
            return json.loads(result.stdout or "{}")
        except Exception:
            return {"ok": False, "error": result.stderr or result.stdout or "Okänt fel."}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def render(ctx: BackofficeContext) -> None:
    st.header("Error-log RAG")
    st.caption(
        "Vector RAG över historiska fault/fix-events. "
        "Producer skriver NDJSON i `logs/llm-segmentts-and-index/error-log.ndjson`; "
        "indexer bygger TF-IDF-snapshot i `data/observability/`. "
        "Auto-ingest sker vid `npm run dev|build|start`. "
        "För aggregerade promotion-kandidater: kör `npm run faults:report` lokalt."
    )

    cols = st.columns(2)
    with cols[0]:
        st.subheader("Producer (NDJSON)")
        ndjson = _ndjson_status(ctx.repo_root)
        if not ndjson.get("exists"):
            st.warning(
                "Ingen producer-NDJSON ännu. Den skapas första gången en "
                "verifier-blocking-finding eller mekanisk fix loggas "
                "(RAG hårdkodat ON i development sedan omtag-04)."
            )
        else:
            st.json(ndjson)
    with cols[1]:
        st.subheader("Indexer (TF-IDF snapshot)")
        meta = _indexer_meta(ctx.repo_root)
        if meta is None:
            st.info(
                "Ingen indexerings-meta hittad. Tryck nedan för att forcera en reindex."
            )
        else:
            st.json(meta)

    st.divider()
    if st.button("Forcera reindex nu (`--force`)"):
        ok, output = _trigger_reindex(ctx.repo_root)
        if ok:
            st.success(output)
        else:
            st.error(output)

    st.divider()
    st.subheader("Prod fault-matris (error_log_events, Postgres)")
    st.caption(
        "Läser den DURABLA Postgres-store:n via "
        "`node scripts/observability/fault-matrix.mjs --prod` — dvs. felen från dina "
        "Vercel-**production**-tester, inte lokal NDJSON ovan. Read-only (SELECT). "
        "Kräver att du dragit prod-env: "
        "`vercel env pull .env.vercel.production.pulled --environment=production --yes`."
    )
    if st.button("Läs prod fault-matris"):
        matrix = _prod_fault_matrix(ctx.repo_root, use_prod=True)
        if not matrix.get("ok"):
            st.error(matrix.get("error", "Kunde inte läsa prod fault-matris."))
        elif matrix.get("tableMissing"):
            st.info("error_log_events saknas i prod-databasen ännu.")
        else:
            st.caption(
                f"Prod: {matrix.get('totalRows', 0)} rader, "
                f"{matrix.get('distinctFaults', 0)} distinkta fel."
            )
            st.dataframe(
                [
                    {
                        "fault": f.get("fault"),
                        "total": f.get("total"),
                        "chats": f.get("chats"),
                        "top_fixer": f.get("top_fixer") or "-",
                        "result": ", ".join(
                            f"{k}:{v}"
                            for k, v in (f.get("result_breakdown") or {}).items()
                        ),
                        "last_seen": f.get("last_seen"),
                    }
                    for f in matrix.get("faults", [])
                ],
                use_container_width=True,
                hide_index=True,
            )

    st.divider()
    st.subheader("Topp fault-kategorier (senaste 5000 rader)")
    rows = _read_ndjson_rows(ctx.repo_root)
    if not rows:
        st.caption(
            "Inga rader att analysera ännu. RAG är hårdkodat ON i "
            "development (omtag-04) — kör en generering och kom tillbaka."
        )
    else:
        counter = Counter()
        for row in rows:
            fault = row.get("fault") or "?"
            counter[fault] += 1
        top = counter.most_common(20)
        st.dataframe(
            [{"fault": k, "count": v} for k, v in top],
            use_container_width=True,
            hide_index=True,
        )
        st.caption(f"Total rader analyserade: {len(rows)}")

    st.divider()
    st.subheader("De 50 senaste rådata-raderna")
    if rows:
        st.dataframe(rows[-50:], use_container_width=True, hide_index=True)
