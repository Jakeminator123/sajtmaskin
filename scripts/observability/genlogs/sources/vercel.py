# -*- coding: utf-8 -*-
"""Vercel: build-loggar för användarsajtens deploy + runtime-events för appen.

Två projekt-id:n hålls isär (samma fälla som `/logg` varnar för):

* **appen** — `VERCEL_PROJECT_ID` / `.vercel/project.json`. Här körs genereringen.
* **användarsajten** — `deployments.vercel_project_id`, ett eget projekt per sajt
  vid F3-publicering.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ..httpjson import HttpClient
from . import STATUS_OK, STATUS_PARTIAL, STATUS_UNAVAILABLE

DEFAULT_API_BASE = "https://api.vercel.com"

#: Symptom som återkommer i DB-pool-felsökning (se `/logg`-skillen). Motsatta
#: fixar, så de måste särskiljas i stället för att buntas som "DB-fel".
POOL_MARKERS = {
    "connect_timeout": "timeout exceeded when trying to connect",
    "max_sessions": "EMAXCONNSESSION",
}


def read_linked_project(repo_root: Path) -> dict[str, str]:
    """`.vercel/project.json` (gitignorerad) — `orgId` är teamId i API-anrop."""
    path = repo_root / ".vercel" / "project.json"
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    out: dict[str, str] = {}
    if isinstance(raw, dict):
        if isinstance(raw.get("projectId"), str):
            out["projectId"] = raw["projectId"]
        if isinstance(raw.get("orgId"), str):
            out["teamId"] = raw["orgId"]
    return out


def collect(
    *,
    token: str | None,
    team_id: str | None,
    app_project_id: str | None,
    deploy_rows: list[dict[str, Any]],
    since_ms: int | None,
    until_ms: int | None,
    run_at_ms: int | None = None,
    version_id: str | None = None,
    limit: int = 100,
    api_base: str = DEFAULT_API_BASE,
    timeout_s: float = 20.0,
) -> dict[str, Any]:
    if not token:
        return {
            "status": STATUS_UNAVAILABLE,
            "reason": "VERCEL_TOKEN saknas (behövs för build-/runtime-loggar).",
        }

    client = HttpClient(
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        timeout_s=timeout_s,
    )
    team_params = {"teamId": team_id} if team_id else {}
    warnings: list[str] = []
    out: dict[str, Any] = {
        "status": STATUS_OK,
        "teamId": team_id,
        "appProjectId": app_project_id,
        "app": {},
        "site": {},
    }

    # --- Appen: den prod-deploy som körde när genereringen skedde ------------
    if app_project_id:
        # `until` = körningens tidpunkt, inte fönstrets slut. Fönstret sträcker sig
        # framåt för att fånga loggar, men en prod-deploy som landade EFTER
        # körningen betjänade den aldrig.
        selection_cutoff = run_at_ms if run_at_ms is not None else until_ms
        listing = client.get(
            f"{api_base}/v6/deployments",
            params={
                **team_params,
                "projectId": app_project_id,
                "target": "production",
                "limit": 1,
                "until": selection_cutoff,
            },
        )
        out["app"]["deploymentSelection"] = (
            "nyaste prod-deploy skapad före körningens tidpunkt "
            "(rollback/promotion kan avvika)"
        )
        out["app"]["deploymentSelectionCutoffMs"] = selection_cutoff
        out["app"]["productionDeployment"] = listing.as_dict()
        deployment_id = _first_deployment_id(listing.payload)
        if deployment_id:
            events = client.get(
                f"{api_base}/v3/deployments/{deployment_id}/events",
                params={
                    **team_params,
                    "direction": "backward",
                    "limit": limit,
                    "since": since_ms,
                    "until": until_ms,
                },
            )
            out["app"]["deploymentId"] = deployment_id
            out["app"]["events"] = events.as_dict()
            out["app"]["poolHealth"] = scan_pool_health(events.payload)
            if not events.ok:
                warnings.append(f"App-events: {events.error or events.status}")
        else:
            warnings.append("Hittade ingen prod-deploy för appen.")
    else:
        warnings.append(
            "VERCEL_PROJECT_ID saknas (kör `npm run vercel:link` eller sätt env) — "
            "appens runtime-events hoppades över."
        )

    # --- Användarsajten: bara om DEN HÄR versionen publicerats ---------------
    site_rows, other_versions = select_site_deploy_rows(deploy_rows, version_id)
    if not site_rows:
        note = "Ingen deploy-rad för versionen — sajten är sannolikt bara en preview (F2)."
        if other_versions:
            # Att visa en annan versions byggfel som om det vore den här
            # körningens är värre än att inte visa något.
            note += f" Andra versioner i chatten har deploys: {', '.join(other_versions)}."
        out["site"] = {"status": "no_deployment", "note": note}
    else:
        row = site_rows[0]
        deployment_id = str(row["vercel_deployment_id"])
        site_team = str(row.get("vercel_team_id") or "") or team_id
        site_params = {"teamId": site_team} if site_team else {}
        detail = client.get(
            f"{api_base}/v13/deployments/{deployment_id}", params=site_params
        )
        build = client.get(
            f"{api_base}/v3/deployments/{deployment_id}/events",
            params={**site_params, "builds": 1, "direction": "backward", "limit": limit},
        )
        out["site"] = {
            "status": "ok" if detail.ok else "error",
            "vercelDeploymentId": deployment_id,
            "vercelProjectId": row.get("vercel_project_id"),
            "url": row.get("url"),
            "dbStatus": row.get("status"),
            "deployment": detail.as_dict(),
            "buildEvents": build.as_dict(),
            "buildLogTail": build_log_tail(build.payload),
        }
        if not detail.ok:
            warnings.append(f"Sajtens deploy: {detail.error or detail.status}")
        if not build.ok:
            warnings.append(f"Sajtens build-events: {build.error or build.status}")

    if warnings:
        out["warnings"] = warnings
        out["status"] = STATUS_PARTIAL
    return out


def select_site_deploy_rows(
    deploy_rows: list[dict[str, Any]], version_id: str | None
) -> tuple[list[dict[str, Any]], list[str]]:
    """Deploy-rader för versionen + vilka andra versioner som har deploys.

    `deployments` hämtas per chat. Utan versionsfilter skulle en tidigare
    publicerad version kunna leverera build-loggen för en follow-up som bara är
    en preview.
    """
    usable = [row for row in deploy_rows if row.get("vercel_deployment_id")]
    if not version_id:
        return usable, []
    mine = [row for row in usable if str(row.get("version_id") or "") == version_id]
    if mine:
        return mine, []
    others = sorted(
        {str(row.get("version_id")) for row in usable if row.get("version_id")}
    )
    return [], others


def _first_deployment_id(payload: Any) -> str | None:
    if isinstance(payload, dict):
        deployments = payload.get("deployments")
        if isinstance(deployments, list) and deployments:
            first = deployments[0]
            if isinstance(first, dict):
                for key in ("uid", "id"):
                    value = first.get(key)
                    if isinstance(value, str) and value:
                        return value
    return None


def _event_rows(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    if isinstance(payload, dict):
        for key in ("events", "logs", "rows"):
            value = payload.get(key)
            if isinstance(value, list):
                return [row for row in value if isinstance(row, dict)]
    return []


def event_text(row: dict[str, Any]) -> str:
    payload = row.get("payload")
    if isinstance(payload, dict):
        for key in ("text", "message"):
            value = payload.get(key)
            if isinstance(value, str) and value:
                return value
    for key in ("text", "message"):
        value = row.get(key)
        if isinstance(value, str) and value:
            return value
    return ""


def build_log_tail(payload: Any, *, max_lines: int = 60) -> list[str]:
    """Sista textraderna ur en build-event-ström — där byggfelet normalt står.

    Vercels event-svar kommer i kronologisk ordning även med
    `direction=backward` (bakåt gäller pagineringen, inte raderna), så slutet är
    det intressanta. Samma val som `getVercelDeploymentBuildLogText` i
    `src/lib/vercel-deploy.ts` gör.
    """
    lines = [text for row in _event_rows(payload) if (text := event_text(row).strip())]
    return lines[-max_lines:]


def scan_pool_health(payload: Any) -> dict[str, Any]:
    """Räkna DB-pool-symptomen. 0 träffar på båda = poolen frisk."""
    counts = {name: 0 for name in POOL_MARKERS}
    for row in _event_rows(payload):
        text = event_text(row)
        if not text:
            continue
        for name, marker in POOL_MARKERS.items():
            if marker.lower() in text.lower():
                counts[name] += 1
    healthy = all(value == 0 for value in counts.values())
    return {
        "counts": counts,
        "healthy": healthy,
        "interpretation": (
            "Poolen ser frisk ut i det hämtade fönstret."
            if healthy
            else "connect_timeout → höj POSTGRES_POOL_MAX. EMAXCONNSESSION → sänk den "
            "eller kör direkt-URL. Vrid aldrig ratten utan att veta vilket felet är."
        ),
    }
