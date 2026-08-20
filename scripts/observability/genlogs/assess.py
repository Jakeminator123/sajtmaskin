# -*- coding: utf-8 -*-
"""Bedömning: gick körningen bra?

Rapporten ska svara på frågan innan detaljerna, precis som `/logg`-skillen kräver.
Signalerna läses från de rader som redan finns — inget härleds ur gissningar, och
en okänd signal ger `delvis` snarare än falsk grönt.
"""

from __future__ import annotations

import datetime as dt
import json
import re
from typing import Any

VERDICT_OK = "lyckad"
VERDICT_PARTIAL = "delvis"
VERDICT_FAILED = "misslyckad"
VERDICT_UNKNOWN = "okänd"

#: `generation_telemetry.quality_gate_result` skrivs av
#: `src/lib/gen/stream/finalize-version/persist-telemetry.ts` som
#: `preflight_passed` / `preflight_failed` / `verifier_failed`. Delsträngsmatchning
#: i stället för en exakt lista, så ett nytt `*_failed`-värde inte tyst blir grönt.
_FAIL_MARKERS = ("fail", "block", "error", "refus")
#: Grönt kräver ett helt ord — annars skulle "okant" (i ett okänt värde) läsas
#: som "ok" och göra en obekant status tyst grön.
_PASS_WORDS = {"pass", "passed", "ok", "clean", "verified"}

#: `engine_versions.verification_state` — se `src/lib/db/engine-version-lifecycle.ts`.
_VERIFICATION_FAILED = {"failed"}
_VERIFICATION_PASSED = {"passed"}
_VERIFICATION_PENDING = {"pending", "verifying", "repairing"}
_VERIFICATION_DEGRADED = {"repair_available", "superseded"}


def gate_outcome(value: str | None) -> str | None:
    """`"pass"`, `"fail"` eller `None` när värdet inte säger något."""
    if not value:
        return None
    text = value.strip().lower()
    if any(marker in text for marker in _FAIL_MARKERS):
        return "fail"
    if _PASS_WORDS & set(re.split(r"[^a-z0-9]+", text)):
        return "pass"
    return None

#: `engine_generation_logs` saknar `version_id`, så raden knyts till versionen via
#: tid. Versionsraden skapas i början av finalize men genereringsloggen skrivs i
#: slutet — efter preflight, verifier och preview-boot — så avståndet kan bli
#: minuter i en långsam körning.
#:
#: Fönstret är därför generöst. Det är inte det som skiljer versioner från
#: varandra: `generation_for_version` kräver att raden ligger NÄRMAST just den
#: bedömda versionen av alla kända versioner. Fönstret är bara en yttre gräns mot
#: att en helt orelaterad rad plockas upp i en tom chat.
GENERATION_MATCH_WINDOW_S = 3600


def _latest(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return rows[0] if rows else {}


#: `quality_gate_result` ska alltid komma från den NYASTE raden — en godkänd
#: server-repair stämplar en ny `preflight_passed` som medvetet ersätter finalizes
#: gamla signal (`getLatestQualityGateResultForVersion` gör samma val).
_NEWEST_WINS_FIELDS = ("quality_gate_result", "reported_quality_gate", "product_blocked")


def merge_telemetry(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Slå samman versionens telemetri-rader (nyast först) till en vy.

    `recordRepairPassedQualityGate` skriver en tunn extra rad med bara
    `quality_gate_result` ifylld. Att bara läsa nyaste raden tappar därför
    `preview_success` från finalize-raden, och en frisk körning ser plötsligt
    obekräftad ut. Nyaste icke-null vinner per fält — utom gate-fältet, där
    nyaste raden alltid vinner även när den är tom.
    """
    if not rows:
        return {}
    merged: dict[str, Any] = {}
    for row in rows:
        for key, value in row.items():
            if key in _NEWEST_WINS_FIELDS:
                continue
            if value is not None and merged.get(key) is None:
                merged[key] = value
    for key in _NEWEST_WINS_FIELDS:
        merged[key] = rows[0].get(key)
    return merged


def rows_for_version(rows: list[dict[str, Any]], version_id: str | None) -> list[dict[str, Any]]:
    """Filtrera till versionen som bedöms.

    Loggarna hämtas per chat, så en chat med flera versioner skulle annars kunna
    bedömas på en annan versions preview-/gate-signaler. Rader utan `version_id`
    (t.ex. `engine_generation_logs`) behålls — de kan bara knytas till chatten.
    """
    if not version_id:
        return list(rows)
    kept: list[dict[str, Any]] = []
    for row in rows:
        if "version_id" not in row:
            kept.append(row)
        elif str(row.get("version_id") or "") == version_id:
            kept.append(row)
    return kept


def _as_int(value: Any) -> int:
    try:
        return int(value) if value is not None else 0
    except (TypeError, ValueError):
        return 0


def _as_datetime(value: Any) -> dt.datetime | None:
    if isinstance(value, dt.datetime):
        return value if value.tzinfo else value.replace(tzinfo=dt.timezone.utc)
    if isinstance(value, str) and value:
        try:
            parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=dt.timezone.utc)
    return None


def _version_id_of(row: dict[str, Any]) -> str | None:
    value = row.get("version_id") or row.get("id")
    return str(value) if value else None


def generation_for_version(
    rows: list[dict[str, Any]],
    version_created_at: Any,
    *,
    versions: list[dict[str, Any]] | None = None,
    target_version_id: str | None = None,
    window_s: int = GENERATION_MATCH_WINDOW_S,
) -> dict[str, Any]:
    """Genereringsloggen som hör till versionen, annars tom.

    `engine_generation_logs` saknar `version_id`, så kopplingen görs på tid — men
    tid räcker inte ensam: `logGeneration` är best-effort, så en version utan egen
    rad skulle kunna ärva en annan versions `success=False`. Därför krävs att
    raden är **närmast just den här versionen** av alla kända versioner i chatten.
    Är den närmare en annan version lämnas signalen okänd.
    """
    target = _as_datetime(version_created_at)
    if target is None:
        return {}
    known = [row for row in (versions or []) if _as_datetime(row.get("created_at"))]

    candidates: list[tuple[float, dict[str, Any]]] = []
    for row in rows:
        created = _as_datetime(row.get("created_at"))
        if created is None:
            continue
        delta = abs((created - target).total_seconds())
        if delta <= window_s:
            candidates.append((delta, row))

    if target_version_id is None or not known:
        # Utan versionslista går ägarskap inte att avgöra. Hellre okänd signal än
        # en rad som kan höra till en annan version.
        return {}
    for _, row in sorted(candidates, key=lambda item: item[0]):
        if _nearest_version_id(row, known) == target_version_id:
            return row
    return {}


def _as_meta(value: Any) -> dict[str, Any] | None:
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value:
        try:
            parsed = json.loads(value)
        except ValueError:
            return None
        return parsed if isinstance(parsed, dict) else None
    return None


def product_blocked_from_errors(errors: list[dict[str, Any]]) -> bool:
    """Nyaste `product_postcheck.summary` vinner — samma signal som mjs-overlayen."""
    summaries = [
        row for row in errors if str(row.get("category") or "") == "product_postcheck.summary"
    ]
    if not summaries:
        return False
    timed = [(row, ts) for row in summaries if (ts := _as_datetime(row.get("created_at")))]
    chosen = max(timed, key=lambda item: item[1])[0] if timed else summaries[0]
    meta = _as_meta(chosen.get("meta"))
    return bool(meta and meta.get("productBlocked") is True)


def resolve_reported_quality_gate(finalize: str | None, product_blocked: bool) -> str | None:
    """Python-läsare av overlayen. Regeln ägs av `scripts/db/lib/reported-quality-gate.mjs`."""
    if finalize == "preflight_passed" and product_blocked:
        return "product_blocked"
    return finalize


def _nearest_version_id(row: dict[str, Any], versions: list[dict[str, Any]]) -> str | None:
    created = _as_datetime(row.get("created_at"))
    if created is None or not versions:
        return None
    best_id: str | None = None
    best_delta = float("inf")
    for version in versions:
        version_created = _as_datetime(version.get("created_at"))
        if version_created is None:
            continue
        delta = abs((version_created - created).total_seconds())
        if delta < best_delta:
            best_delta = delta
            best_id = _version_id_of(version)
    return best_id


def assess_run(
    *,
    version: dict[str, Any] | None,
    db_data: dict[str, list[dict[str, Any]]],
    fly: dict[str, Any] | None = None,
    version_id: str | None = None,
) -> dict[str, Any]:
    if not version:
        return {
            "verdict": VERDICT_UNKNOWN,
            "reasons": ["Ingen version hittades i databasen — det finns ingen körning att bedöma."],
            "signals": {},
        }

    target_version = version_id or str(version.get("version_id") or version.get("id") or "") or None
    telemetry_rows = rows_for_version(db_data.get("telemetry") or [], target_version)
    telemetry = merge_telemetry(telemetry_rows)
    generation = generation_for_version(
        db_data.get("generations") or [],
        version.get("created_at"),
        versions=db_data.get("versions") or [],
        target_version_id=target_version,
    )
    errors = rows_for_version(db_data.get("errors") or [], target_version)
    deploys = rows_for_version(db_data.get("deploys") or [], target_version)

    error_rows = [row for row in errors if str(row.get("level") or "").lower() == "error"]
    warning_rows = [row for row in errors if str(row.get("level") or "").lower() == "warning"]

    preview_success = telemetry.get("preview_success")
    finalize_gate = str(telemetry.get("quality_gate_result") or "") or None
    if telemetry.get("product_blocked") is True:
        product_blocked = True
    elif telemetry.get("product_blocked") is False:
        product_blocked = False
    else:
        product_blocked = product_blocked_from_errors(errors)
    reported = telemetry.get("reported_quality_gate")
    candidate = reported if isinstance(reported, str) and reported.strip() else finalize_gate
    quality_gate = resolve_reported_quality_gate(candidate, product_blocked)
    verification_state = str(version.get("verification_state") or "") or None
    generation_ok = generation.get("success")
    deploy = _latest(deploys)

    signals = {
        "previewSuccess": preview_success,
        "qualityGateResult": quality_gate,
        "qualityGateResultFinalize": finalize_gate,
        "qualityGateOverlaid": bool(quality_gate and finalize_gate and quality_gate != finalize_gate),
        "productBlocked": product_blocked,
        "verificationState": verification_state,
        "releaseState": str(version.get("release_state") or "") or None,
        "lifecycleStage": str(version.get("lifecycle_stage") or "") or None,
        "generationSuccess": generation_ok,
        "retryCount": _as_int(telemetry.get("retry_count")),
        "autofixApplied": telemetry.get("autofix_applied"),
        "preflightErrorCount": _as_int(telemetry.get("preflight_error_count")),
        "errorRows": len(error_rows),
        "warningRows": len(warning_rows),
        "deployStatus": (str(deploy.get("status")) if deploy.get("status") else None),
        # En session som hör till en ANNAN version är inte den här körningens
        # preview — annars ser rapporten ut att ha bevis den inte har.
        "previewSessionFound": bool((fly or {}).get("matchedSession"))
        and not (fly or {}).get("sessionVersionMismatch"),
        "previewSessionVersionMismatch": (fly or {}).get("sessionVersionMismatch") or None,
        "assessedVersionId": target_version,
        "generationLogMatched": bool(generation),
    }

    reasons: list[str] = []
    failed = False
    degraded = False

    if generation_ok is False:
        failed = True
        message = str(generation.get("error_message") or "").strip()
        reasons.append("Genereringen misslyckades" + (f": {message}" if message else "."))
    if preview_success is False:
        failed = True
        blocking = str(telemetry.get("preview_blocking_reason") or "").strip()
        reasons.append("Preview kom aldrig upp" + (f" ({blocking})" if blocking else "."))
    gate = gate_outcome(quality_gate)
    if product_blocked:
        failed = True
        reasons.append("Product Postcheck blockerade produkten.")
    elif gate == "fail":
        failed = True
        reasons.append(f"RenderGate föll: {quality_gate}.")
    if verification_state and verification_state.lower() in _VERIFICATION_FAILED:
        failed = True
        reasons.append("Verifieringen föll (verification_state=failed).")
    elif verification_state and verification_state.lower() in _VERIFICATION_DEGRADED:
        degraded = True
        reasons.append(f"Versionen är i mellanläge: {verification_state}.")
    if error_rows:
        degraded = True
        reasons.append(f"{len(error_rows)} felrad(er) i pipeline-loggen.")
    if signals["preflightErrorCount"]:
        degraded = True
        reasons.append(f"{signals['preflightErrorCount']} preflight-fel.")
    if signals["retryCount"]:
        degraded = True
        reasons.append(f"{signals['retryCount']} retry i genereringen.")
    if telemetry.get("autofix_applied"):
        degraded = True
        reasons.append("Normalize/autofix behövde gripa in.")
    # `deployments.status` normaliseras till pending/building/ready/error/cancelled
    # (`mapVercelReadyStateToStatus`). Delsträng, så både brittisk och amerikansk
    # stavning av avbruten fångas.
    deploy_status = str(deploy.get("status") or "").lower()
    if deploy_status and any(marker in deploy_status for marker in ("error", "fail", "cancel")):
        failed = True
        reasons.append(f"Deploy-status: {deploy.get('status')}.")

    verification = (verification_state or "").lower()
    # Positiva bekräftelser på att previewn hör till just den här körningen.
    # Enbart "en rad finns" duger inte — den kan bära ett okänt utfall.
    confirmations: list[str] = []
    if gate == "pass":
        confirmations.append(f"RenderGate {quality_gate}")
    if verification in _VERIFICATION_PASSED:
        confirmations.append(f"verifiering {verification_state}")
    if generation.get("success") is True:
        confirmations.append("lyckad genereringslogg")

    if failed:
        verdict = VERDICT_FAILED
    elif not telemetry_rows and preview_success is None:
        verdict = VERDICT_UNKNOWN
        reasons.append("Ingen telemetri för versionen — går inte att bedöma preview.")
    elif verification in _VERIFICATION_PENDING:
        # Raden har inte satt sig än. En uppkommen preview är ett gott tecken men
        # inte ett slutresultat — verifieringen kan fortfarande falla.
        if preview_success is True:
            verdict = VERDICT_PARTIAL
            reasons.append(
                f"Preview kom upp, men verifieringen har inte satt sig ({verification_state})."
            )
        else:
            verdict = VERDICT_UNKNOWN
            reasons.append(f"Verifieringen har inte satt sig än ({verification_state}).")
    elif preview_success is True and not degraded and confirmations:
        verdict = VERDICT_OK
        reasons.append(
            "Preview kom upp, inga fel- eller retry-signaler, bekräftat av: "
            + ", ".join(confirmations)
            + "."
        )
    elif preview_success is True and not degraded:
        # Preview är uppe, men inget bekräftar att det är DEN HÄR körningens
        # preview: ingen godkänd gate, ingen godkänd verifiering och ingen lyckad
        # genereringslogg. En stale preview från en tidigare version ser ut precis
        # så — okända signaler ska ge delvis, inte falskt grönt.
        verdict = VERDICT_PARTIAL
        reasons.append(
            "Preview är uppe men ingen bekräftande signal finns (varken godkänd "
            "gate, godkänd verifiering eller matchad genereringslogg)."
        )
    elif verification in _VERIFICATION_PASSED and preview_success is None:
        # `preview_success = null` betyder "preview inte bekräftad", inte lyckad
        # (persist-telemetry.ts). Grönt kräver en bekräftad preview.
        verdict = VERDICT_PARTIAL
        reasons.append(
            f"Verifiering: {verification_state}, men previewn är inte bekräftad "
            "(preview_success saknas)."
        )
    elif preview_success is None and not telemetry_rows:
        verdict = VERDICT_UNKNOWN
        reasons.append("Ingen telemetri för versionen — går inte att bedöma preview.")
    else:
        verdict = VERDICT_PARTIAL
        if not reasons:
            reasons.append("Körningen gick igenom men utan entydig preview-signal.")

    return {"verdict": verdict, "reasons": reasons, "signals": signals}
