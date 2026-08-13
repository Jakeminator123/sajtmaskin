"""Selection UI for the bounded Template (v0-mall) curator.

Loading and filtering the catalog only reads committed files. Network access is
deferred until the operator has selected exact template ids and presses
``Analysera valda``. The runner verifies each Blob archive against the manifest
SHA and treats ZIP contents as data; it never extracts or executes template code.

Addenda are not written during analysis. After a fresh report the operator can
press an explicit button that runs the runner-owned ``templates:addenda --write
--ids=…`` command.
"""

from __future__ import annotations

import dataclasses
import hashlib
import json
import shlex
from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import Any

import streamlit as st

from backoffice.shared import (
    BackofficeContext,
    render_building_blocks_nav,
    run_repo_command,
    tech_details,
)

PAGE_NAME = "Mallar (v0): kurera Blob-arkiv"

_REPORT_STATE_KEY = "template_curator_report"
_REPORT_BINDING_KEY = "template_curator_report_binding"
_REPORT_ERROR_KEY = "template_curator_report_error"
_ADDENDA_WRITE_RESULT_KEY = "template_curator_addenda_write"
_FILTER_STATE_KEY = "template_curator_catalog_filter"
_REPORT_VIEW_FILTER_KEYS = (
    "template_curator_decision_filter",
    "template_curator_kind_filter",
)

_SCOPE_LABELS: tuple[tuple[str, str], ...] = (
    ("blob", "Alla i Blob-manifestet"),
    ("preview_fit", "Ryms i preview"),
    ("gallery", "Finns i genererad gallerifil"),
    ("site_visible", "Synliga på sajten"),
    ("variant_cited", "Citerade av varianter"),
)


def _value(value: Any, *names: str, default: Any = None) -> Any:
    """Read one of ``names`` from a dataclass/object/mapping."""
    for name in names:
        if isinstance(value, Mapping) and name in value:
            return value[name]
        if hasattr(value, name):
            return getattr(value, name)
    return default


def _jsonable(value: Any) -> Any:
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return {key: _jsonable(item) for key, item in dataclasses.asdict(value).items()}
    if isinstance(value, Mapping):
        return {str(key): _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set, frozenset)):
        return [_jsonable(item) for item in value]
    if isinstance(value, Path):
        return value.as_posix()
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def _record_id(record: Any) -> str:
    return str(_value(record, "id", "template_id", "templateId", default="")).strip()


def _record_title(record: Any) -> str:
    return str(_value(record, "title", default=_record_id(record))).strip()


def _record_category(record: Any) -> str:
    return str(_value(record, "category", default="okategoriserad")).strip()


def _record_archive_sha(record: Any) -> str:
    return (
        str(_value(record, "archive_sha256", "archiveSha256", default=""))
        .strip()
        .lower()
    )


def _format_catalog_option(template_id: str, lookup: Mapping[str, Any]) -> str:
    """Label for the multiselect. Tolerate AppTest re-feeding the formatted label."""

    key = str(template_id)
    record = lookup.get(key)
    if record is None and " · " in key:
        maybe_id = key.rsplit(" · ", 1)[-1].strip()
        record = lookup.get(maybe_id)
        if record is not None:
            key = maybe_id
    if record is None:
        return key
    return f"{_record_title(record)} · {_record_category(record)} · {key}"


def _record_lookup(snapshot: Any) -> dict[str, Any]:
    direct = _value(snapshot, "by_id", "records_by_id", "templates_by_id")
    if isinstance(direct, Mapping):
        return {str(key): value for key, value in direct.items()}
    records = _value(snapshot, "records", "templates", default=()) or ()
    return {_record_id(record): record for record in records if _record_id(record)}


def _scope_value(name: str) -> Any:
    from scripts.template_curator import catalog as curator_catalog

    scope_type = curator_catalog.CatalogScope
    try:
        return scope_type(name)
    except (TypeError, ValueError):
        return getattr(scope_type, name.upper())


def _scope_records(snapshot: Any, scope_name: str) -> tuple[Any, ...]:
    from scripts.template_curator import catalog as curator_catalog

    return tuple(curator_catalog.scope_records(snapshot, _scope_value(scope_name)))


def _scope_counts(snapshot: Any) -> dict[str, int]:
    supplied = _value(snapshot, "counts", "scope_counts")
    result: dict[str, int] = {}
    if isinstance(supplied, Mapping):
        for scope_name, _label in _SCOPE_LABELS:
            enum_value = _scope_value(scope_name)
            raw = supplied.get(scope_name, supplied.get(enum_value))
            if raw is not None:
                result[scope_name] = int(raw)
    for scope_name, _label in _SCOPE_LABELS:
        result.setdefault(scope_name, len(_scope_records(snapshot, scope_name)))
    return result


def _filter_catalog_records(
    records: Iterable[Any],
    *,
    category: str,
    query: str,
) -> tuple[Any, ...]:
    """Route filtering through the catalog owner, not a second UI registry."""
    from scripts.template_curator import catalog as curator_catalog

    categories = () if category == "Alla" else (category,)
    return tuple(
        curator_catalog.filter_records(
            records,
            categories=categories,
            search=query,
        )
    )


def _addendum_binding(snapshot: Any, record: Any) -> dict[str, Any]:
    template_id = _record_id(record)
    addenda = _value(snapshot, "addenda", "addenda_by_id", default={}) or {}
    item = addenda.get(template_id) if isinstance(addenda, Mapping) else None
    if item is not None:
        payload = _jsonable(item)
        state = _value(
            item, "state", "status", "review_status", "reviewStatus", default="present"
        )
    else:
        payload = {
            "status": _value(record, "addendum_status", default="missing"),
            "reviewStatus": _value(record, "addendum_review_status", default=None),
            "sourceArchiveSha256": _value(
                record, "addendum_source_archive_sha256", default=None
            ),
            "extractorSha256": _value(
                record, "addendum_extractor_sha256", default=None
            ),
            "structuralReferences": _value(record, "structural_references", default=()),
        }
        state = payload["status"]
    canonical = json.dumps(
        payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    )
    return {
        "state": str(state),
        "sha256": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
    }


def build_report_binding(snapshot: Any, records: Iterable[Any]) -> dict[str, Any]:
    """Bind a report to every input that can make its conclusions stale."""
    ordered = tuple(records)
    extractor_sha = str(
        _value(
            snapshot, "extractor_sha256", "extractor_sha", "extractorSha256", default=""
        )
    ).lower()
    inputs = [
        {
            "id": _record_id(record),
            "archiveSha256": _record_archive_sha(record),
            "addendum": _addendum_binding(snapshot, record),
        }
        for record in ordered
    ]
    canonical = json.dumps(
        {
            "extractorSha256": extractor_sha,
            "addendaValid": _value(snapshot, "addenda_valid", default=None),
            "addendaError": _value(snapshot, "addenda_error", default=None),
            "templates": inputs,
        },
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return {
        "version": 1,
        "extractorSha256": extractor_sha,
        "addendaValid": _value(snapshot, "addenda_valid", default=None),
        "addendaError": _value(snapshot, "addenda_error", default=None),
        "templates": inputs,
        "sha256": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
    }


def report_is_fresh(stored_binding: Any, current_binding: Mapping[str, Any]) -> bool:
    return isinstance(stored_binding, Mapping) and stored_binding.get(
        "sha256"
    ) == current_binding.get("sha256")


def _archive_identity(binding: Mapping[str, Any]) -> tuple[Any, ...]:
    templates = binding.get("templates") or ()
    rows = []
    for item in templates:
        if not isinstance(item, Mapping):
            rows.append(item)
            continue
        rows.append((str(item.get("id")), str(item.get("archiveSha256"))))
    return (binding.get("extractorSha256"), tuple(rows))


def absorb_addenda_binding_update(
    stored_binding: Any,
    current_binding: Mapping[str, Any],
    write_result: Any,
) -> Any:
    """Keep the report visible after our own addenda write updates catalog status.

    Archive SHA / extractor / selection still invalidate. Only addendum-status
    and registry-validity changes from a successful write are absorbed.
    """
    if not (
        isinstance(stored_binding, Mapping)
        and isinstance(write_result, Mapping)
        and write_result.get("ok")
        and write_result.get("kind") == "write"
        and _archive_identity(stored_binding) == _archive_identity(current_binding)
    ):
        return stored_binding
    return dict(current_binding)


def _runner_result(
    repo_root: Path,
    snapshot: Any,
    template_ids: tuple[str, ...],
    *,
    scope_name: str,
) -> Any:
    """Single adapter around the runner's public, side-effect-bounded entrypoint."""
    from scripts.template_curator.runner import curate_templates, write_report

    lookup = _record_lookup(snapshot)
    records = tuple(lookup[template_id] for template_id in template_ids)
    report = curate_templates(
        records,
        repo_root=repo_root,
        scope=scope_name,
        extractor_sha256=_value(snapshot, "extractor_sha256", default=None),
        catalog_counts={
            scope.value if hasattr(scope, "value") else str(scope): count
            for scope, count in (
                _value(snapshot, "scope_counts", default={}) or {}
            ).items()
        },
        catalog_error=_value(snapshot, "error", default=None),
        addenda_valid=_value(snapshot, "addenda_valid", default=None),
    )
    report = {**report, "reportBinding": build_report_binding(snapshot, records)}
    report_path = write_report(report, repo_root)
    return {**report, "reportPath": str(report_path)}


def _report_profiles(report: Any) -> tuple[Any, ...]:
    profiles = _value(report, "profiles", "results", "templates", default=()) or ()
    if isinstance(profiles, Mapping):
        return tuple(profiles.values())
    return tuple(profiles)


def _profile_decision(profile: Any) -> str:
    return str(_value(profile, "decision", "status", default="review"))


def _profile_kind(profile: Any) -> str:
    return str(_value(profile, "kind", "site_kind", "siteKind", default="unknown"))


def _profile_id(profile: Any) -> str:
    return str(_value(profile, "template_id", "templateId", "id", default="okänd"))


def _string_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, Mapping):
        return [f"{key}: {item}" for key, item in value.items()]
    if isinstance(value, Iterable):
        return [str(item) for item in value]
    return [str(value)]


def _addendum_write_commands(report: Any) -> tuple[str, ...]:
    """Return only the runner-owned, already-gated addendum commands."""

    return tuple(
        _string_list(_value(report, "addendumCandidateCommands", default=()))
    )


def _npm_command_tuple(command: str) -> tuple[str, ...]:
    """Parse a runner-owned npm command. Reject anything that is not npm."""

    parts = tuple(part for part in shlex.split(command, posix=True) if part)
    if len(parts) < 3 or parts[0] != "npm" or parts[1] != "run":
        raise ValueError(f"vägrade köra icke-npm-kommando: {command}")
    return parts


def _store_addenda_command_result(kind: str, result: Mapping[str, Any]) -> None:
    st.session_state[_ADDENDA_WRITE_RESULT_KEY] = {**dict(result), "kind": kind}


def _render_addenda_command_result() -> None:
    write_result = st.session_state.get(_ADDENDA_WRITE_RESULT_KEY)
    if not isinstance(write_result, Mapping):
        return
    if write_result.get("ok"):
        if write_result.get("kind") == "check":
            st.success(
                "Addenda-registret är giltigt. Inget skrevs — det här var bara en kontroll."
            )
        else:
            st.success(
                "Kommandot lyckades. `config/variant-template-addenda.json` är uppdaterad "
                "i worktreet — committa när du granskat diffen."
            )
    else:
        error = write_result.get("error") or write_result.get("stderrTail") or "okänt fel"
        st.error(f"Addenda-kommandot misslyckades: {error}")
    stdout_tail = str(write_result.get("stdoutTail") or "").strip()
    stderr_tail = str(write_result.get("stderrTail") or "").strip()
    if stdout_tail:
        with st.expander("stdout", expanded=False):
            st.code(stdout_tail, language="text")
    if stderr_tail:
        with st.expander("stderr", expanded=not write_result.get("ok")):
            st.code(stderr_tail, language="text")


def _render_profile(profile: Any, record: Any | None) -> None:
    template_id = _profile_id(profile)
    title = _record_title(record) if record is not None else template_id
    decision = _profile_decision(profile)
    kind = _profile_kind(profile)
    with st.expander(f"{title} · {decision} · {kind}", expanded=False):
        st.caption(
            f"ID: `{template_id}` · kategori: `{_record_category(record) if record else 'okänd'}`"
        )
        summary = _value(profile, "summary", "reason", "decision_reason", default="")
        if summary:
            st.write(str(summary))
        issues = _string_list(_value(profile, "issues", default=()))
        if issues:
            st.markdown("**Skäl/signaler**")
            st.markdown("\n".join(f"- `{issue}`" for issue in issues))

        packages = _value(profile, "packages", "package_profile", "packageProfile")
        if packages is None:
            compatibility = _value(
                profile, "host_compatibility", "hostCompatibility", default={}
            )
            packages = _value(compatibility, "packages", default=())
        features = _value(
            profile, "features", "feature_candidates", "featureCandidates"
        )
        paths = _value(
            profile,
            "implementation_paths",
            "implementationPaths",
            "source_paths",
            default=(),
        )
        if not paths:
            paths = [
                *_string_list(_value(profile, "entry_files", "entryFiles", default=())),
                *_string_list(_value(profile, "route_files", "routeFiles", default=())),
            ]
        addendum = _value(profile, "addendum", "addendum_state", "addendumState")

        cols = st.columns(2)
        with cols[0]:
            st.markdown("**Paket och kompatibilitet**")
            if packages:
                st.json(_jsonable(packages))
            else:
                st.caption("Inga paket hittades.")
        with cols[1]:
            st.markdown("**Feature-kandidater**")
            if features:
                st.json(_jsonable(features))
            else:
                st.caption("Inga feature-kandidater hittades.")

        st.markdown("**Implementationssökvägar**")
        path_rows = _string_list(paths)
        if path_rows:
            st.code("\n".join(path_rows), language="text")
        else:
            st.caption("Inga avgränsade implementationssökvägar hittades.")

        st.markdown("**Addendum-status**")
        if addendum:
            st.json(_jsonable(addendum))
        else:
            st.caption("Ingen addendum-post rapporterad.")

        candidate = _value(
            profile, "profile_candidate", "profileCandidate", default=profile
        )
        candidate_bytes = json.dumps(
            _jsonable(candidate), ensure_ascii=False, indent=2, sort_keys=True
        ).encode("utf-8")
        st.download_button(
            "Ladda ned profil-kandidat (JSON)",
            data=candidate_bytes,
            file_name=f"template-profile-{template_id}.json",
            mime="application/json",
            key=f"template_curator_profile_download_{template_id}",
        )


def _render_report(ctx: BackofficeContext, report: Any, snapshot: Any) -> None:
    payload = _jsonable(report)
    profiles = _report_profiles(report)
    decisions = sorted({_profile_decision(profile) for profile in profiles})
    kinds = sorted({_profile_kind(profile) for profile in profiles})

    filter_cols = st.columns(2)
    with filter_cols[0]:
        decision = st.selectbox(
            "Beslut",
            ["Alla", *decisions],
            key="template_curator_decision_filter",
        )
    with filter_cols[1]:
        kind = st.selectbox(
            "Typ",
            ["Alla", *kinds],
            key="template_curator_kind_filter",
        )

    visible = tuple(
        profile
        for profile in profiles
        if (decision == "Alla" or _profile_decision(profile) == decision)
        and (kind == "Alla" or _profile_kind(profile) == kind)
    )
    counts = {
        "qualified": sum(_profile_decision(item) == "qualified" for item in profiles),
        "review": sum(_profile_decision(item) == "review" for item in profiles),
        "rejected": sum(_profile_decision(item) == "rejected" for item in profiles),
        "app": sum(_profile_kind(item) == "app" for item in profiles),
        "website": sum(_profile_kind(item) == "website" for item in profiles),
    }
    metric_cols = st.columns(5)
    for column, (label, value) in zip(metric_cols, counts.items()):
        column.metric(label, value)

    lookup = _record_lookup(snapshot)
    for profile in visible:
        _render_profile(profile, lookup.get(_profile_id(profile)))

    report_bytes = json.dumps(
        payload, ensure_ascii=False, indent=2, sort_keys=True
    ).encode("utf-8")
    st.download_button(
        "Ladda ned hela rapporten (JSON)",
        data=report_bytes,
        file_name="template-curation-report.json",
        mime="application/json",
        key="template_curator_report_download",
    )

    st.markdown(
        "**Addenda skrivs inte av analysen.** Efter granskning kan du köra det "
        "runner-ägda kommandot här — det uppdaterar `config/variant-template-addenda.json` "
        "för just de analyserade kandidaterna (inte rejected, bara runtime-kvalificerade)."
    )
    candidate_commands = _addendum_write_commands(report)
    if candidate_commands:
        st.code("\n".join(candidate_commands), language="bash")
        write_col, check_col = st.columns(2)
        with write_col:
            if st.button(
                "Skriv addenda för kandidaterna",
                type="primary",
                key="template_curator_write_addenda",
                help="Kör runner-kommandot oförändrat. Hämtar SHA-verifierade ZIP:ar och skriver registret.",
            ):
                try:
                    command = _npm_command_tuple(candidate_commands[0])
                except ValueError as exc:
                    _store_addenda_command_result(
                        "write", {"ok": False, "error": str(exc)}
                    )
                else:
                    with st.spinner("Skriver variant-template-addenda.json …"):
                        _store_addenda_command_result(
                            "write",
                            run_repo_command(ctx.repo_root, command, timeout=1200),
                        )
        with check_col:
            check_command = _value(report, "addendaCheckCommand", default=None)
            if isinstance(check_command, str) and check_command:
                if st.button(
                    "Kontrollera addenda-registret",
                    key="template_curator_check_addenda",
                    help=check_command,
                ):
                    try:
                        command = _npm_command_tuple(check_command)
                    except ValueError as exc:
                        _store_addenda_command_result(
                            "check", {"ok": False, "error": str(exc)}
                        )
                    else:
                        with st.spinner("Kör templates:addenda:check …"):
                            _store_addenda_command_result(
                                "check",
                                run_repo_command(ctx.repo_root, command, timeout=180),
                            )
    else:
        st.caption(
            "Inga analyserade mallar klarade både besluts- och runtime-grinden för addendum."
        )
        check_command = _value(report, "addendaCheckCommand", default=None)
        if isinstance(check_command, str) and check_command:
            st.code(check_command, language="bash")
    st.caption(
        "Om en manuellt granskad post har blivit stale krävs det uttryckliga "
        "tillägget `--refresh-reviewed`; det ersätter manuella utdrag. "
        "Den knappen skickar inte den flaggan."
    )


def _filter_signature(scope: str, category: str, query: str, limit: int) -> str:
    return json.dumps(
        {"scope": scope, "category": category, "query": query, "limit": limit},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def _clear_report_state() -> None:
    for key in (
        _REPORT_STATE_KEY,
        _REPORT_BINDING_KEY,
        _REPORT_ERROR_KEY,
        _ADDENDA_WRITE_RESULT_KEY,
        *_REPORT_VIEW_FILTER_KEYS,
    ):
        st.session_state.pop(key, None)


def render(ctx: BackofficeContext) -> None:
    st.header(PAGE_NAME)
    render_building_blocks_nav(PAGE_NAME)
    st.markdown(
        "Välj exakt vilka Template-arkiv som ska analyseras. Katalogen och filtren "
        "är lokala och read-only; **ingen nätverksåtkomst sker innan du klickar "
        "Analysera valda**. Arkiven SHA-verifieras och läses statiskt — mallkod körs aldrig."
    )
    with tech_details():
        st.markdown("- Katalog: `src/lib/templates/template-blob-manifest.json`")
        st.markdown("- Kurator: `scripts/template_curator/`")
        st.markdown(
            "- Lokala rapporter/cache: `data/backoffice/template-curator/` (gitignored)"
        )
        st.markdown(
            "- Addenda: `config/variant-template-addenda.json` (analysen är read-only; "
            "skrivning sker bara via den explicita knappen efter analys)"
        )

    try:
        from scripts.template_curator import catalog as curator_catalog

        snapshot = curator_catalog.load_catalog(repo_root=ctx.repo_root)
    except (OSError, ValueError, TypeError) as exc:
        st.error(f"Kunde inte läsa mallkatalogen: {exc}")
        return

    catalog_error = _value(snapshot, "error", "validation_error")
    if catalog_error:
        st.error(f"Katalogen är inte analyserbar: {catalog_error}")
        return

    counts = _scope_counts(snapshot)
    metric_cols = st.columns(len(_SCOPE_LABELS))
    for column, (scope_name, label) in zip(metric_cols, _SCOPE_LABELS):
        column.metric(label, counts[scope_name])

    scope_by_label = {label: name for name, label in _SCOPE_LABELS}
    scope_label = st.selectbox("Population", tuple(scope_by_label), index=3)
    scope_name = scope_by_label[scope_label]
    scoped = _scope_records(snapshot, scope_name)
    categories = sorted({_record_category(record) for record in scoped})

    filter_cols = st.columns([2, 3, 1])
    with filter_cols[0]:
        category = st.selectbox("Kategori", ["Alla", *categories])
    with filter_cols[1]:
        query = st.text_input("Sök på namn, id eller kategori")
    with filter_cols[2]:
        limit = int(
            st.number_input(
                "Visa högst",
                min_value=1,
                max_value=max(len(scoped), 1),
                value=min(100, max(len(scoped), 1)),
                step=10,
            )
        )

    filtered = _filter_catalog_records(scoped, category=category, query=query)
    visible = filtered[:limit]
    visible_lookup = {_record_id(record): record for record in visible}
    option_ids = tuple(visible_lookup)
    st.caption(f"{len(filtered)} träffar; {len(visible)} visas som valbara.")

    current_filter = _filter_signature(scope_name, category, query, limit)
    previous_filter = st.session_state.get(_FILTER_STATE_KEY)
    if previous_filter is not None and previous_filter != current_filter:
        _clear_report_state()
    st.session_state[_FILTER_STATE_KEY] = current_filter

    selected_ids = tuple(
        st.multiselect(
            "Exakt urval",
            options=option_ids,
            format_func=lambda template_id: _format_catalog_option(
                template_id, visible_lookup
            ),
            help="Bara dessa id:n hämtas när du startar analysen.",
        )
    )
    selected_records = tuple(
        visible_lookup[template_id] for template_id in selected_ids
    )
    current_binding = build_report_binding(snapshot, selected_records)

    analyze = st.button(
        "Analysera valda",
        type="primary",
        disabled=not selected_ids,
        help="Hämtar och SHA-verifierar valda ZIP-filer. Ingen mallkod exekveras.",
    )
    if analyze:
        _clear_report_state()
        try:
            with st.spinner(f"Analyserar {len(selected_ids)} valda arkiv…"):
                report = _runner_result(
                    ctx.repo_root, snapshot, selected_ids, scope_name=scope_name
                )
        except (OSError, ValueError, RuntimeError, TimeoutError) as exc:
            st.session_state[_REPORT_ERROR_KEY] = str(exc)
        else:
            st.session_state[_REPORT_STATE_KEY] = report
            st.session_state[_REPORT_BINDING_KEY] = current_binding

    error = st.session_state.get(_REPORT_ERROR_KEY)
    if error:
        st.error(
            f"Analysen misslyckades; eventuell tidigare rapport har ogiltigförklarats: {error}"
        )

    report = st.session_state.get(_REPORT_STATE_KEY)
    stored_binding = absorb_addenda_binding_update(
        st.session_state.get(_REPORT_BINDING_KEY),
        current_binding,
        st.session_state.get(_ADDENDA_WRITE_RESULT_KEY),
    )
    if stored_binding is not st.session_state.get(_REPORT_BINDING_KEY):
        st.session_state[_REPORT_BINDING_KEY] = stored_binding
    if report is None:
        _render_addenda_command_result()
        return
    if not report_is_fresh(stored_binding, current_binding):
        _render_addenda_command_result()
        st.warning(
            "Rapporten är stale för det aktuella urvalet, arkiv-SHA:n, extractorn "
            "eller addendum-statusen. Kör analysen igen."
        )
        return

    st.success(f"Analysen är bunden till {len(selected_ids)} valda mallar.")
    _render_report(ctx, report, snapshot)
    _render_addenda_command_result()
