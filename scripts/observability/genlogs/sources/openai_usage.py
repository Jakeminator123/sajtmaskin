# -*- coding: utf-8 -*-
"""OpenAI Admin API: org-förbrukning i körningens tidsfönster.

Viktigt att inte övertolka: endpointen grupperar på `project_id`, `user_id`,
`api_key_id`, `model`, `batch` och `service_tier` — där `user_id` är
organisationens medlem/servicekonto, **inte** Sajtmaskins `users.id`. Med
`bucket_width=1m` går det att ringa in en körning i tiden, men om två
genereringar överlappar kan siffrorna inte separeras.

Org-siffran är därför en **kontroll** mot vår egen tokenloggning — inte en
per-körning-sanning. Kräver en **admin**-nyckel (`sk-admin-…`), inte
`OPENAI_API_KEY`.
"""

from __future__ import annotations

from typing import Any

from ..httpjson import HttpClient
from . import STATUS_OK, STATUS_PARTIAL, STATUS_UNAVAILABLE

DEFAULT_API_BASE = "https://api.openai.com"
ADMIN_KEY_ENV = ("OPENAI_ADMIN_KEY",)

#: `/v1/organization/usage/<yta>`. Completions täcker Chat Completions +
#: Responses API, alltså den absoluta merparten av Sajtmaskins OpenAI-trafik.
USAGE_SURFACES = (
    "completions",
    "embeddings",
    "images",
    "moderations",
    "audio_speeches",
    "audio_transcriptions",
    "vector_stores",
    "code_interpreter_sessions",
)

TOKEN_FIELDS = (
    "input_tokens",
    "input_cached_tokens",
    "output_tokens",
    "input_audio_tokens",
    "output_audio_tokens",
    "num_model_requests",
)

MAX_MINUTE_BUCKETS = 1440


def minute_buckets_for_window(start_epoch: int, end_epoch: int) -> int:
    minutes = max(1, (int(end_epoch) - int(start_epoch) + 59) // 60)
    return min(minutes, MAX_MINUTE_BUCKETS)


def collect(
    *,
    admin_key: str | None,
    start_epoch: int,
    end_epoch: int,
    project_ids: list[str] | None = None,
    api_base: str = DEFAULT_API_BASE,
    timeout_s: float = 30.0,
) -> dict[str, Any]:
    if not admin_key:
        return {
            "status": STATUS_UNAVAILABLE,
            "reason": (
                "Ingen admin-nyckel. Sätt "
                + " eller ".join(ADMIN_KEY_ENV)
                + " (Settings → Organization → Admin keys). Vanlig OPENAI_API_KEY "
                "har inte åtkomst till usage/costs."
            ),
        }

    client = HttpClient(
        headers={"Authorization": f"Bearer {admin_key}", "Accept": "application/json"},
        timeout_s=timeout_s,
    )
    limit = minute_buckets_for_window(start_epoch, end_epoch)
    warnings: list[str] = []
    surfaces: dict[str, Any] = {}

    for surface in USAGE_SURFACES:
        result = client.get(
            f"{api_base}/v1/organization/usage/{surface}",
            params={
                "start_time": start_epoch,
                "end_time": end_epoch,
                "bucket_width": "1m",
                "limit": limit,
                "group_by": ["model", "project_id"],
                "project_ids": project_ids or None,
            },
        )
        entry = result.as_dict()
        if result.ok:
            entry["totals"] = sum_usage(result.payload)
        else:
            warnings.append(f"usage/{surface}: {result.error or result.status}")
        surfaces[surface] = entry

    costs = client.get(
        f"{api_base}/v1/organization/costs",
        params={
            "start_time": _day_floor(start_epoch),
            "end_time": end_epoch,
            "bucket_width": "1d",
            "limit": 7,
            "group_by": ["line_item", "project_id"],
        },
    )
    if not costs.ok:
        warnings.append(f"costs: {costs.error or costs.status}")

    out: dict[str, Any] = {
        "status": STATUS_OK,
        "window": {"startEpoch": start_epoch, "endEpoch": end_epoch, "bucketWidth": "1m", "buckets": limit},
        "surfaces": surfaces,
        "costs": {**costs.as_dict(), "totals": sum_costs(costs.payload) if costs.ok else None},
        "attributionNote": (
            "Org-nivå i tidsfönstret. Kan inte attribueras till en enskild körning "
            "eller slutanvändare — jämför mot measured-tokens, dra inga slutsatser om "
            "en specifik användare."
        ),
    }
    if warnings:
        out["warnings"] = warnings
        out["status"] = STATUS_PARTIAL
    return out


def _buckets(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    data = payload.get("data")
    return [row for row in data if isinstance(row, dict)] if isinstance(data, list) else []


def sum_usage(payload: Any) -> dict[str, Any]:
    totals: dict[str, int] = {field: 0 for field in TOKEN_FIELDS}
    by_model: dict[str, dict[str, int]] = {}
    for bucket in _buckets(payload):
        results = bucket.get("results")
        if not isinstance(results, list):
            continue
        for row in results:
            if not isinstance(row, dict):
                continue
            model = str(row.get("model") or "okänd")
            model_totals = by_model.setdefault(model, {field: 0 for field in TOKEN_FIELDS})
            for field in TOKEN_FIELDS:
                value = row.get(field)
                if isinstance(value, (int, float)):
                    totals[field] += int(value)
                    model_totals[field] += int(value)
    return {
        "totals": totals,
        "byModel": [{"model": model, **values} for model, values in sorted(by_model.items())],
    }


def sum_costs(payload: Any) -> dict[str, Any]:
    total = 0.0
    currency = "usd"
    by_line_item: dict[str, float] = {}
    for bucket in _buckets(payload):
        results = bucket.get("results")
        if not isinstance(results, list):
            continue
        for row in results:
            if not isinstance(row, dict):
                continue
            amount = row.get("amount")
            if not isinstance(amount, dict):
                continue
            value = amount.get("value")
            if not isinstance(value, (int, float)):
                continue
            currency = str(amount.get("currency") or currency)
            total += float(value)
            key = str(row.get("line_item") or "okänd")
            by_line_item[key] = by_line_item.get(key, 0.0) + float(value)
    return {
        "amount": round(total, 6),
        "currency": currency,
        "byLineItem": [
            {"lineItem": key, "amount": round(value, 6)}
            for key, value in sorted(by_line_item.items(), key=lambda item: item[1], reverse=True)
        ],
        "note": "Costs-bucketen är per DYGN — inte begränsad till körningens minuter.",
    }


def _day_floor(epoch: int) -> int:
    return (int(epoch) // 86_400) * 86_400
