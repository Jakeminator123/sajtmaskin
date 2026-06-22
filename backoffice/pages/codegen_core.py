from __future__ import annotations

import json

import streamlit as st

from backoffice.shared import (
    BackofficeContext,
    read_env_flag,
    read_json,
    render_where_panel,
    validate_json_against_schema,
    write_env_flag,
    write_json,
)


def _section_domain_rules(ctx: BackofficeContext) -> None:
    st.subheader("Domain rules (`config/domain-rules.json`)")
    st.caption(
        "Driver `domain-inference.ts`. Runtime bygger regex från `keywords_sv` + `keywords_en` "
        "per domän för att klassificera prompter. Dev-server behöver startas om efter ändring."
    )
    path = ctx.repo_root / "config" / "domain-rules.json"
    rules = read_json(path)
    if not (rules and isinstance(rules, list)):
        st.warning(f"Kunde inte läsa `{path.relative_to(ctx.repo_root)}`.")
        return
    rows = [
        {
            "domain": r.get("domain", ""),
            "briefHint": r.get("briefHint", ""),
            "keywords_sv": ", ".join(r.get("keywords_sv", [])),
            "keywords_en": ", ".join(r.get("keywords_en", [])),
        }
        for r in rules
    ]
    edited = st.data_editor(
        rows, width="stretch", num_rows="dynamic", key="codegen_core_domain_rules_editor",
    )
    if st.button("Spara domain rules", key="codegen_core_save_domain_rules"):
        out = []
        for row in edited:
            domain = (row.get("domain") or "").strip()
            if not domain:
                continue
            out.append(
                {
                    "domain": domain,
                    "briefHint": (row.get("briefHint") or "").strip(),
                    "keywords_sv": [k.strip() for k in (row.get("keywords_sv") or "").split(",") if k.strip()],
                    "keywords_en": [k.strip() for k in (row.get("keywords_en") or "").split(",") if k.strip()],
                }
            )
        schema_path = ctx.repo_root / "docs" / "schemas" / "strict" / "domain-rules.schema.json"
        errors = validate_json_against_schema(out, schema_path)
        if errors:
            st.error(
                "Domain rules sparades inte – schemavalideringen misslyckades:\n\n"
                + "\n".join(f"- {message}" for message in errors)
            )
            st.stop()
        path.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        st.success(f"Sparade {len(out)} domain rules.")


def _section_heuristic_tokens(ctx: BackofficeContext) -> None:
    st.subheader("Prompt heuristic tokens (`config/prompt-heuristic-tokens.json`)")
    st.caption(
        "Driver `prompt-heuristics.ts`. Styr vilka nyckelord som matchar i promptanalys. "
        "Dev-server behöver startas om efter ändring."
    )
    path = ctx.repo_root / "config" / "prompt-heuristic-tokens.json"
    data = read_json(path)
    if not (data and isinstance(data, dict)):
        st.warning(f"Kunde inte läsa `{path.relative_to(ctx.repo_root)}`.")
        return
    for cat_key, cat_val in data.items():
        desc = cat_val.get("description", "")
        tokens = cat_val.get("tokens", [])
        with st.expander(f"**{cat_key}** ({len(tokens)} tokens) — {desc}"):
            new_tokens = st.text_area(
                f"Tokens ({cat_key})",
                value=", ".join(tokens),
                key=f"codegen_core_heuristic_{cat_key}",
                height=80,
            )
            if st.button(f"Spara {cat_key}", key=f"codegen_core_save_heuristic_{cat_key}"):
                parsed = [t.strip() for t in new_tokens.split(",") if t.strip()]
                data[cat_key]["tokens"] = parsed
                schema_path = (
                    ctx.repo_root / "docs" / "schemas" / "strict" / "prompt-heuristic-tokens.schema.json"
                )
                errors = validate_json_against_schema(data, schema_path)
                if errors:
                    st.error(
                        f"Tokens för `{cat_key}` sparades inte – schemavalideringen misslyckades:\n\n"
                        + "\n".join(f"- {message}" for message in errors)
                    )
                    st.stop()
                path.write_text(
                    json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8",
                )
                st.success(f"Sparade {len(parsed)} tokens för `{cat_key}`.")


def _section_defer_init_routes(ctx: BackofficeContext) -> None:
    st.subheader("Deferred extra init routes")
    key = "SAJTMASKIN_DEFER_EXTRA_ROUTES_ON_INIT"
    current = read_env_flag(ctx, key)
    new = st.toggle(
        "Plan-many / build-one för init-generering",
        value=current,
        key="codegen_core_defer_routes_toggle",
        help=(
            f"Styr `{key}` i `.env.local`. När på får init-genereringar planera flera routes men "
            "bara fullt realisera primärrouten direkt; extrasidor blir shells med 'Skapa sida'-CTA."
        ),
    )
    if new != current:
        if write_env_flag(ctx, key, new):
            st.success(f"`{key}` satt till `{'true' if new else 'false'}` i `.env.local`.")
            st.caption("Dev-servern kan behöva startas om för att ändringen ska gälla i runtime.")
        else:
            st.error("Kunde inte skriva till `.env.local`. Kontrollera filrättigheter.")
    else:
        st.caption(f"Nuvarande: `{key}={'true' if current else 'false'}`")


def render(ctx: BackofficeContext) -> None:
    domain_map = read_json(ctx.domain_map_json) if ctx.domain_map_json.is_file() else {"pages": {}}
    st.header("Core Manifest (codegen-core-manifest.json)")
    render_where_panel("Codegen core", domain_map)

    st.info(
        "Styr ordningen och urvalet av **Core Rules**-fragment som konkateneras "
        "till den statiska delen av systemprompten. Se `config/prompt-core/_READ_ME_FIRST.md`."
    )

    path = ctx.config_dir / "codegen-core-manifest.json"
    if not path.is_file():
        st.error("`config/codegen-core-manifest.json` saknas.")
        return

    data = read_json(path)

    sep = st.text_input("fragmentSeparator", value=data.get("fragmentSeparator", "\n\n"))
    notes = data.get("editorNotes")
    if isinstance(notes, dict):
        with st.expander("editorNotes (read-only i UI — redigera i JSON om du vill)"):
            st.json(notes)

    frags = list(data.get("fragments") or [])
    st.subheader("Fragment (ordning = concat-ordning)")
    rows = [{"ordning": i + 1, "sökväg": f} for i, f in enumerate(frags)]
    edited = st.data_editor(
        rows,
        num_rows="dynamic",
        column_config={
            "ordning": st.column_config.NumberColumn("Ordning", min_value=1, step=1),
            "sökväg": st.column_config.TextColumn("Sökväg (relativt config/)", width="large"),
        },
        hide_index=True,
        width="stretch",
        key="codegen_core_frag_editor",
    )

    if st.button("Spara manifest", type="primary"):
        cleaned = []
        for r in edited:
            if not isinstance(r, dict):
                continue
            pth = (r.get("sökväg") or "").strip()
            if not pth:
                continue
            ordning = r.get("ordning")
            try:
                o = int(ordning)
            except (TypeError, ValueError):
                o = 10**6
            cleaned.append({"_o": o, "sökväg": pth})
        cleaned.sort(key=lambda x: x["_o"])
        new_frags = [x["sökväg"] for x in cleaned]
        out = {**data, "fragmentSeparator": sep, "fragments": new_frags}
        write_json(path, out)
        st.success("Sparat.")
        st.rerun()

    st.caption("Tips: nya rader läggs till i tabellen; tom `sökväg` ignoreras vid spar.")

    st.divider()
    _section_domain_rules(ctx)
    st.divider()
    _section_heuristic_tokens(ctx)
    st.divider()
    _section_defer_init_routes(ctx)
