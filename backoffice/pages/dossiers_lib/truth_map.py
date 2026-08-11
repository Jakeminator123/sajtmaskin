"""Pure row/graph projection helpers for the dossier Systemkarta tab.

Input is the generated, runtime-registry-backed projection in
``data/dossiers/_index/capability-map.json``. Business rules stay in
TypeScript; this module only filters and renders the already-resolved facts.
"""

from __future__ import annotations

from typing import Any, Iterable


def _group_by_capability(groups: dict[str, Any]) -> dict[str, tuple[str, str]]:
    result: dict[str, tuple[str, str]] = {}
    for group_id, raw_info in groups.items():
        info = raw_info if isinstance(raw_info, dict) else {}
        label = str(info.get("label") or group_id)
        for raw_capability in info.get("capabilities") or []:
            capability = str(raw_capability).strip()
            if capability:
                result[capability] = (str(group_id), label)
    return result


def build_system_map_rows(projection: dict[str, Any]) -> list[dict[str, Any]]:
    """Flatten the canonical projection without re-deriving lifecycle policy."""
    groups = projection.get("groups") if isinstance(projection.get("groups"), dict) else {}
    group_lookup = _group_by_capability(groups)
    rows: list[dict[str, Any]] = []
    for raw_dossier in projection.get("dossiers") or []:
        if not isinstance(raw_dossier, dict):
            continue
        capability = str(raw_dossier.get("capability") or "")
        group_id, group_label = group_lookup.get(capability, ("other", "Övrigt"))
        env_vars = [env for env in (raw_dossier.get("envVars") or []) if isinstance(env, dict)]
        env_by_enforcement = {
            enforcement: sorted(
                str(env.get("key"))
                for env in env_vars
                if str(env.get("enforcement") or "build") == enforcement and env.get("key")
            )
            for enforcement in ("build", "feature-runtime", "warn-only")
        }
        file_roles = raw_dossier.get("fileRoles")
        if not isinstance(file_roles, dict):
            file_roles = {}
        rows.append(
            {
                "group_id": group_id,
                "group_label": group_label,
                "capability": capability,
                "id": str(raw_dossier.get("id") or ""),
                "label": str(raw_dossier.get("label") or ""),
                "class": str(raw_dossier.get("class") or ""),
                "providers": [str(value) for value in (raw_dossier.get("providers") or [])],
                "dependencies": [str(value) for value in (raw_dossier.get("dependencies") or [])],
                "default": raw_dossier.get("defaultForCapability") is True,
                "mock": str(raw_dossier.get("mock") or "none"),
                "f2_disposition": str(raw_dossier.get("f2Disposition") or ""),
                "f2_reason": str(raw_dossier.get("f2Reason") or ""),
                "build_server_requirement": raw_dossier.get("buildServerRequirement") is True,
                "build_server_reasons": [
                    str(value) for value in (raw_dossier.get("buildServerReasons") or [])
                ],
                "env_by_enforcement": env_by_enforcement,
                "file_roles": {str(key): int(value) for key, value in file_roles.items()},
                "summary_sv": str(raw_dossier.get("summarySv") or ""),
                "verification_status": str(raw_dossier.get("verificationStatus") or "accepted"),
                "last_verified": str(raw_dossier.get("lastVerified") or ""),
            }
        )
    return sorted(rows, key=lambda row: (row["group_label"], row["capability"], row["id"]))


def filter_system_map_rows(
    rows: Iterable[dict[str, Any]],
    *,
    groups: set[str] | None = None,
    classes: set[str] | None = None,
    f2_dispositions: set[str] | None = None,
    build_server_values: set[bool] | None = None,
    query: str = "",
) -> list[dict[str, Any]]:
    needle = query.strip().casefold()
    filtered: list[dict[str, Any]] = []
    for row in rows:
        if groups is not None and row["group_id"] not in groups:
            continue
        if classes is not None and row["class"] not in classes:
            continue
        if f2_dispositions is not None and row["f2_disposition"] not in f2_dispositions:
            continue
        if build_server_values is not None and row["build_server_requirement"] not in build_server_values:
            continue
        haystack = " ".join(
            [
                row["group_id"],
                row["group_label"],
                row["capability"],
                row["id"],
                row["label"],
                *row["providers"],
                *row["dependencies"],
            ]
        ).casefold()
        if needle and needle not in haystack:
            continue
        filtered.append(row)
    return filtered


def _dot_text(value: object) -> str:
    return str(value).replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ")


def build_system_map_dot(rows: Iterable[dict[str, Any]]) -> str:
    """Category → capability → dossier → provider, deterministic DOT."""
    row_list = list(rows)
    lines = [
        "digraph dossiers {",
        '  graph [rankdir="TB", bgcolor="transparent", pad="0.2", nodesep="0.25", ranksep="0.45"];',
        '  node [shape="box", style="rounded,filled", fontname="Arial", fontsize="10", color="#64748b"];',
        '  edge [color="#94a3b8", arrowsize="0.6"];',
    ]
    groups: dict[str, str] = {}
    capabilities: set[tuple[str, str]] = set()
    dossiers: set[tuple[str, str, str]] = set()
    providers: set[str] = set()
    edges: set[tuple[str, str]] = set()
    for row in row_list:
        group_node = f"group:{row['group_id']}"
        capability_node = f"cap:{row['capability']}"
        dossier_node = f"dossier:{row['class']}:{row['id']}"
        groups[group_node] = row["group_label"]
        capabilities.add((capability_node, row["capability"]))
        status = "Planerad F2" if row["f2_disposition"] == "deferred" else "Tillgänglig F2"
        dossiers.add((dossier_node, row["label"], status))
        edges.add((group_node, capability_node))
        edges.add((capability_node, dossier_node))
        for provider in row["providers"]:
            provider_node = f"provider:{provider}"
            providers.add(provider)
            edges.add((dossier_node, provider_node))

    for node_id, label in sorted(groups.items()):
        lines.append(
            f'  "{_dot_text(node_id)}" [label="{_dot_text(label)}", fillcolor="#dbeafe", shape="folder"];'
        )
    for node_id, label in sorted(capabilities):
        lines.append(
            f'  "{_dot_text(node_id)}" [label="{_dot_text(label)}", fillcolor="#e0e7ff"];'
        )
    for node_id, label, status in sorted(dossiers):
        fill = "#fef3c7" if status == "Planerad F2" else "#dcfce7"
        lines.append(
            f'  "{_dot_text(node_id)}" [label="{_dot_text(label)}\\n{status}", fillcolor="{fill}"];'
        )
    for provider in sorted(providers):
        node_id = f"provider:{provider}"
        lines.append(
            f'  "{_dot_text(node_id)}" [label="{_dot_text(provider)}", fillcolor="#f3e8ff", shape="component"];'
        )
    for left, right in sorted(edges):
        lines.append(f'  "{_dot_text(left)}" -> "{_dot_text(right)}";')
    lines.append("}")
    return "\n".join(lines)
