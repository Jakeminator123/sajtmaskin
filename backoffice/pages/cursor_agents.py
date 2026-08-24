from __future__ import annotations

import streamlit as st

from backoffice.shared import BackofficeContext, read_text

CURSOR_AGENT_PAGE_EDITABLE = False

CURSOR_AGENT_DOCUMENTS: tuple[tuple[str, str], ...] = (
    (
        "docs/architecture/glossary.md",
        "glossary.md — kanoniska begrepp och namnskuggor",
    ),
    (
        "AGENTS.md",
        "AGENTS.md — tunn router för alla agenter",
    ),
    (
        ".cursor/README.md",
        ".cursor/README.md — Cursor-regler och selektiv kontext",
    ),
    (
        "docs/architecture/code-map.md",
        "code-map.md — mappar, integrationer, repo (översikt)",
    ),
)


def render(ctx: BackofficeContext) -> None:
    st.header("Cursor-agenter — kontext och terminologi")
    st.markdown(
        "Read-only karta över dokumenten som agenterna routas till. Ändra dem i en "
        "branch/PR så att schema, validatorer, review och historik följer med. "
        "Maskinvärden för branch, verifiering och review visas read-only i Control Plane."
    )

    labels = [pair[1] for pair in CURSOR_AGENT_DOCUMENTS]
    picked = st.radio("Välj dokument", labels, horizontal=True, key="cursor_agent_doc")
    label_to_rel = {lab: r for r, lab in CURSOR_AGENT_DOCUMENTS}
    rel = label_to_rel[picked]
    cursor_fp = ctx.repo_root / rel
    key_safe = rel.replace("/", "_").replace("\\", "_")

    st.caption(f"Aktuell fil: `{rel}`")
    if not cursor_fp.is_file():
        st.error(f"Filen finns inte: `{cursor_fp}`")
    else:
        body = read_text(cursor_fp)
        st.text_area(
            "Innehåll (read-only)",
            value=body,
            height=620,
            key=f"cursor_body_{key_safe}",
            disabled=True,
        )
