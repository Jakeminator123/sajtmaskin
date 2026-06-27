from __future__ import annotations

import json

import streamlit as st

from backoffice.shared import (
    BackofficeContext,
    read_json,
    render_where_panel,
    validate_json_against_schema,
    write_json,
)


def render(ctx: BackofficeContext) -> None:
    domain_map = read_json(ctx.domain_map_json) if ctx.domain_map_json.is_file() else {"pages": {}}
    st.header("env-policy.json")
    render_where_panel("env-policy", domain_map)
    ep = ctx.config_dir / "env-policy.json"
    env_data = read_json(ep)

    k_empty = len(env_data.get("knownEmptyOk") or [])
    k_rt = len(env_data.get("runtimeOnlyKeys") or [])
    k_extra = len(env_data.get("extraKnownKeys") or [])
    rules = env_data.get("rules") or []
    st.metric("Regler (rules)", len(rules))
    c1, c2, c3 = st.columns(3)
    c1.metric("knownEmptyOk", k_empty)
    c2.metric("runtimeOnlyKeys", k_rt)
    c3.metric("extraKnownKeys", k_extra)

    q = st.text_input("Sök regel (nyckel eller anteckning)", "")
    if q.strip():
        ql = q.strip().lower()
        filtered = [
            r
            for r in rules
            if ql in (r.get("key") or "").lower()
            or ql in (r.get("notes") or "").lower()
            or ql in (r.get("classification") or "").lower()
        ]
        st.write(f"**{len(filtered)}** träffar")
        st.dataframe(filtered, width="stretch", height=320)
    else:
        st.dataframe(rules[:80], width="stretch", height=280)
        if len(rules) > 80:
            st.caption(f"Visar första 80 av {len(rules)} regler — använd sök för att filtrera.")

    with st.expander("Redigera hela JSON (avancerat)"):
        raw_e = st.text_area(
            "env-policy.json",
            value=json.dumps(env_data, indent=2, ensure_ascii=False),
            height=400,
        )
        if st.button("Spara env-policy.json"):
            try:
                parsed = json.loads(raw_e)
            except json.JSONDecodeError as e:
                st.error(f"Ogiltig JSON: {e}")
                st.stop()
            # Validate-on-save mot strict-schemat (samma fail-closed-kärna som
            # ai_models manifest-editorn). Blockerar en schemabrytande edit innan
            # write_json, så en trasig env-policy aldrig hamnar på disk.
            schema_path = (
                ctx.repo_root / "docs" / "schemas" / "strict" / "env-policy.schema.json"
            )
            errs = validate_json_against_schema(parsed, schema_path)
            if errs:
                st.error(
                    "Sparar inte — env-policy bryter mot schemat:\n"
                    + "\n".join(f"- {message}" for message in errs)
                )
                st.stop()
            # Dubblett-koll på rules[].key. JSON Schema kan inte uttrycka
            # fält-unikhet över array-element, men runtime kollapsar regler på key
            # (Map i env-audit.ts, dict i manage_env.py) — en dubblett låter tyst
            # den sista posten vinna. Blockera innan write.
            rule_keys = [
                r.get("key")
                for r in (parsed.get("rules") or [])
                if isinstance(r, dict)
            ]
            dupes = sorted({k for k in rule_keys if k and rule_keys.count(k) > 1})
            if dupes:
                st.error(
                    "Sparar inte — dubblerade rules[].key (runtime kollapsar på key): "
                    + ", ".join(dupes)
                )
                st.stop()
            write_json(ep, parsed)
            st.success("Sparat (validerad mot env-policy.schema.json).")
            st.rerun()

