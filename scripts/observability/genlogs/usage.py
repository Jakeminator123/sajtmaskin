# -*- coding: utf-8 -*-
"""Tokenrollup: vad körningen förbrukade, och vad vi ännu inte mäter.

Tre sanningar hålls isär medvetet:

* **run** — tokens knutna till den version rapporten handlar om. Det är svaret på
  "vad kostade den här körningen".
* **chat** — allt som loggats för hela chatten (alla follow-ups). Bredare, och
  får aldrig blandas in i run-summan.
* **external** — leverantörens org-siffra i samma tidsfönster (OpenAI Admin API,
  D-ID credits). Kan inte attribueras till en körning eller slutanvändare.

Skillnaden mellan run och det som *inte* loggas alls är `coverage` — och den är
hela poängen med rapporten.

Radval per scope. Två fel ska undvikas samtidigt: att räkna samma anrop två gånger,
och att tappa anrop som bara finns i den äldre källan.

`llm_usage` skrivs av varje fas (steg 2 i planen) och är därför förstahandskällan.
Men en rad kan saknas där: chatten kan sträcka sig över instrumenteringen, eller så
uteblev skrivningen. Därför:

| Scope | Regel |
| --- | --- |
| run | `llm_usage` för versionen. Saknas codegen-fasen där tas `generation_telemetry` för versionen med — den raden ÄR codegen. |
| chat | `llm_usage` för chatten + de `engine_generation_logs`-rader som inte har en motsvarande codegen-rad i `llm_usage` (matchat på tid). |

Efter instrumenteringen skriver codegen till BÅDA tabellerna, så de raderna räknas
en gång. Uteblev `llm_usage`-skrivningen är genereringsraden enda källan och tas
med. `engine_generation_logs` saknar `version_id` och kan aldrig summeras per
körning.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from typing import Any, Iterable

from .pricing import PricingTable

#: Alla LLM-/API-ytor som kan kosta pengar i en körning, och var de bor.
#: `logged_today=True` = fasen skriver `llm_usage` via `recordLlmUsage` idag.
#: Kartan speglar callsites i src/ (grep `recordLlmUsage(`) — uppdaterad
#: 2026-08-19; den var stale och påstod att brief/verifier/fixer inte loggades.
KNOWN_LLM_PHASES: tuple[dict[str, Any], ...] = (
    {"phase": "codegen", "label": "Codegen-ström (own-engine)", "owner": "src/lib/gen/stream/stream-format.ts", "logged_today": True},
    {"phase": "planner", "label": "Plan-läge (planner)", "owner": "src/lib/own-engine/session/own-engine-plan-mode.ts", "logged_today": True},
    {"phase": "brief", "label": "Deep Brief / Snapshot-Brief", "owner": "src/lib/builder/site-brief-generation.ts", "logged_today": True},
    {"phase": "verifier", "label": "verifier", "owner": "src/lib/gen/verify/verifier-pass.ts", "logged_today": True},
    {"phase": "fixer", "label": "RepairGate (LLM-fixer)", "owner": "src/lib/gen/autofix/llm-fixer.ts", "logged_today": True},
    {"phase": "prompt_assist", "label": "Prompt assist (heuristik, ingen LLM idag)", "owner": "src/lib/builder/prompt-assist/", "logged_today": False},
    {"phase": "embeddings", "label": "Embeddings (scaffold/template)", "owner": "src/lib/gen/scaffolds/scaffold-search.ts", "logged_today": True},
    {"phase": "classifier", "label": "Intent-/match-klassificerare", "owner": "src/lib/providers/own-engine/", "logged_today": True},
    {"phase": "qa", "label": "QA-kortslutning i chatten", "owner": "src/lib/api/engine/chats/chat-message-stream/qa-short-circuit.ts", "logged_today": True},
    {"phase": "wizard", "label": "Wizard (enrich/competitors/lookup)", "owner": "src/app/api/wizard/", "logged_today": False},
    {"phase": "audit", "label": "Audit/analyze", "owner": "src/app/api/audit/", "logged_today": False},
    {"phase": "sajtagenten", "label": "Sajtagenten (OpenClaw-gateway)", "owner": "infra/openclaw/", "logged_today": False},
    {"phase": "avatar", "label": "D-ID (video/TTS — credits, ej tokens)", "owner": "src/lib/openclaw/use-did-avatar.ts", "logged_today": False},
)

TOKEN_KEYS = {
    "prompt": ("input_tokens", "prompt_tokens"),
    "completion": ("output_tokens", "completion_tokens"),
    "cached": ("cached_input_tokens",),
    "cache_write": ("cache_write_tokens",),
    "reasoning": ("reasoning_tokens",),
}


def _as_int(value: Any) -> int:
    try:
        if value is None:
            return 0
        return int(value)
    except (TypeError, ValueError):
        return 0


def _first_int(row: dict[str, Any], keys: tuple[str, ...]) -> int:
    for key in keys:
        if key in row and row[key] is not None:
            return _as_int(row[key])
    return 0


def rows_for_version(rows: Iterable[dict[str, Any]], version_id: str | None) -> list[dict[str, Any]]:
    """Bara rader som hör till versionen. Utan `version_id` blir svaret tomt —
    hellre inget än fel version."""
    if not version_id:
        return []
    return [row for row in rows if str(row.get("version_id") or "") == version_id]


@dataclass
class ModelTotals:
    model: str
    calls: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cached_input_tokens: int = 0
    phases: set[str] = field(default_factory=set)

    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens


def _accumulate(
    rows: Iterable[dict[str, Any]], *, default_phase: str
) -> dict[str, ModelTotals]:
    buckets: dict[str, ModelTotals] = {}
    for row in rows:
        # Rader utan någon tokenvolym är inte LLM-anrop. `recordRepairPassedQualityGate`
        # stämplar t.ex. en tunn telemetri-rad med bara gate-resultatet — den ska
        # inte räknas som ett extra anrop eller flaggas som dubbelräkning.
        if not has_token_fields([row]):
            continue
        model = str(row.get("model") or "okänd")
        bucket = buckets.setdefault(model, ModelTotals(model=model))
        bucket.calls += 1
        bucket.prompt_tokens += _first_int(row, TOKEN_KEYS["prompt"])
        bucket.completion_tokens += _first_int(row, TOKEN_KEYS["completion"])
        bucket.cached_input_tokens += _first_int(row, TOKEN_KEYS["cached"])
        bucket.phases.add(str(row.get("phase") or default_phase))
    return buckets


def _price_buckets(
    buckets: dict[str, ModelTotals], pricing: PricingTable, tier: str
) -> tuple[list[dict[str, Any]], list[str], float, bool]:
    by_model: list[dict[str, Any]] = []
    unpriced: list[str] = []
    total_usd = 0.0
    priced_any = False
    for bucket in sorted(buckets.values(), key=lambda item: item.total_tokens, reverse=True):
        usd, price = pricing.cost_usd(
            bucket.model,
            prompt_tokens=bucket.prompt_tokens,
            completion_tokens=bucket.completion_tokens,
            cached_input_tokens=bucket.cached_input_tokens,
            tier=tier,
        )
        if usd is None:
            unpriced.append(bucket.model)
        else:
            priced_any = True
            total_usd += usd
        by_model.append(
            {
                "model": bucket.model,
                "priceKey": price.key if price else None,
                "priceLabel": price.label if price else None,
                "provider": price.provider if price else None,
                "estimatedPrice": bool(price.estimated) if price else None,
                "calls": bucket.calls,
                "phases": sorted(bucket.phases),
                "promptTokens": bucket.prompt_tokens,
                "cachedInputTokens": bucket.cached_input_tokens,
                "completionTokens": bucket.completion_tokens,
                "totalTokens": bucket.total_tokens,
                "usd": round(usd, 6) if usd is not None else None,
                "sek": pricing.to_sek(usd),
            }
        )
    return by_model, unpriced, total_usd, priced_any


def _totals(by_model: list[dict[str, Any]], total_usd: float, priced_any: bool, pricing: PricingTable) -> dict[str, Any]:
    return {
        "calls": sum(row["calls"] for row in by_model),
        "promptTokens": sum(row["promptTokens"] for row in by_model),
        "cachedInputTokens": sum(row["cachedInputTokens"] for row in by_model),
        "completionTokens": sum(row["completionTokens"] for row in by_model),
        "totalTokens": sum(row["totalTokens"] for row in by_model),
        "usd": round(total_usd, 6) if priced_any else None,
        "sek": pricing.to_sek(total_usd) if priced_any else None,
    }


def _phase_totals(rows: Iterable[dict[str, Any]], *, default_phase: str) -> list[dict[str, Any]]:
    buckets: dict[str, dict[str, int]] = {}
    for row in rows:
        if not has_token_fields([row]):
            continue
        phase = str(row.get("phase") or default_phase)
        bucket = buckets.setdefault(phase, {"calls": 0, "promptTokens": 0, "completionTokens": 0})
        bucket["calls"] += 1
        bucket["promptTokens"] += _first_int(row, TOKEN_KEYS["prompt"])
        bucket["completionTokens"] += _first_int(row, TOKEN_KEYS["completion"])
    return [
        {"phase": phase, **values, "totalTokens": values["promptTokens"] + values["completionTokens"]}
        for phase, values in sorted(
            buckets.items(),
            key=lambda item: item[1]["promptTokens"] + item[1]["completionTokens"],
            reverse=True,
        )
    ]


def has_token_fields(rows: Iterable[dict[str, Any]]) -> bool:
    """Bär raderna faktiskt någon tokenvolym?

    Två fall som båda måste ge `False`, eftersom de annars blir "0 tokens" som ser
    ut som ett mätvärde: kolumnen saknas helt (reservvägen `dump-logs.mjs` har
    fasta kolumnlistor) och kolumnen finns men är `NULL` (ingen usage skrevs).
    """
    wanted = (*TOKEN_KEYS["prompt"], *TOKEN_KEYS["completion"])
    return any(row.get(key) is not None for row in rows for key in wanted)


def _created_at_epoch(row: dict[str, Any]) -> float | None:
    """Tidsstämpel i sekunder. Hanterar både `datetime` (pg8000) och ISO-text
    (reservvägen via dump-logs.mjs)."""
    value = row.get("created_at")
    if isinstance(value, dt.datetime):
        stamped = value if value.tzinfo else value.replace(tzinfo=dt.timezone.utc)
        return stamped.timestamp()
    if isinstance(value, str) and value:
        try:
            parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
        stamped = parsed if parsed.tzinfo else parsed.replace(tzinfo=dt.timezone.utc)
        return stamped.timestamp()
    return None


#: Codegen skriver `engine_generation_logs` och `llm_usage` i samma finalize-steg,
#: alltså inom sekunder. Fönstret avgör vilka rader som är samma anrop.
SAME_CALL_WINDOW_S = 120


def generation_rows_without_usage_row(
    generations: list[dict[str, Any]],
    llm_usage: list[dict[str, Any]],
    *,
    window_s: int = SAME_CALL_WINDOW_S,
) -> list[dict[str, Any]]:
    """Genereringsrader som INTE redan finns som en codegen-rad i `llm_usage`.

    Efter instrumenteringen skriver codegen till båda tabellerna, så de raderna ska
    räknas en gång. Men en `llm_usage`-skrivning kan ha uteblivit (misslyckad insert,
    reducerat läge, delvis instrumentering) — då är genereringsraden enda källan och
    måste med. Matchningen görs på tid, eftersom `engine_generation_logs` saknar både
    `version_id` och fas.
    """
    codegen_rows = [
        row
        for row in llm_usage
        if str(row.get("phase") or "") == "codegen" and has_token_fields([row])
    ]
    codegen_times = [
        stamp for row in codegen_rows if (stamp := _created_at_epoch(row)) is not None
    ]
    kept: list[dict[str, Any]] = []
    for row in generations:
        stamp = _created_at_epoch(row)
        if stamp is None:
            # Utan tidsstämpel går paret inte att avgöra på tid. Finns det ändå en
            # codegen-rad med volym i llm_usage är genereringsraden dess tvilling
            # (efter instrumenteringen skrivs alltid båda) — hoppa den. Saknas
            # codegen helt är genereringsraden enda källan och måste med.
            if not codegen_rows:
                kept.append(row)
            continue
        if any(abs(stamp - other) <= window_s for other in codegen_times):
            continue
        kept.append(row)
    return kept


def _pick_rows(
    db_data: dict[str, list[dict[str, Any]]], *, version_id: str | None
) -> tuple[list[dict[str, Any]], str, list[dict[str, Any]], str, str | None]:
    """Välj rader per scope utan att dubbelräkna eller tappa den äldre eran."""
    llm_usage = db_data.get("llmusage") or []
    telemetry = db_data.get("telemetry") or []
    generations = db_data.get("generations") or []

    warning: str | None = None
    run_rows = rows_for_version(llm_usage, version_id)
    run_sources = ["llm_usage"] if run_rows else []

    # Kravet är codegen MED tokenvolym: en misslyckad codegen-rad (ok=false, inga
    # siffror) betyder att kostnaden fortfarande bara finns i telemetrin.
    has_codegen_tokens = any(
        str(row.get("phase") or "") == "codegen" and has_token_fields([row]) for row in run_rows
    )
    if not has_codegen_tokens:
        # Codegen saknas i llm_usage för versionen (ingen instrumentering ännu, eller
        # bara andra faser loggade). Telemetri-raden för versionen ÄR codegen, så den
        # kompletterar utan att dubblera.
        telemetry_rows = rows_for_version(telemetry, version_id)
        if telemetry_rows and not has_token_fields(telemetry_rows):
            if not run_rows:
                warning = (
                    "Telemetri-raderna för versionen bär ingen tokenvolym (kolumnen "
                    "saknas i reducerat läge via dump-logs.mjs, eller är NULL). Ingen "
                    "tokensumma per körning kan beräknas — chat-summan nedan är det "
                    "enda som finns."
                )
            telemetry_rows = []
        if telemetry_rows:
            run_rows = [*run_rows, *telemetry_rows]
            run_sources.append("generation_telemetry")

    run_source = " + ".join(run_sources) if run_sources else ("saknas" if warning else "llm_usage")

    chat_rows = list(llm_usage)
    chat_source = "llm_usage"
    if llm_usage:
        # Genereringsrader utan motsvarande codegen-rad i llm_usage: antingen från
        # tiden före instrumenteringen, eller från ett anrop där llm_usage-skrivningen
        # uteblev. Båda ska räknas — men bara en gång.
        extra = generation_rows_without_usage_row(generations, llm_usage)
        if extra:
            chat_rows = [*chat_rows, *extra]
            chat_source = "llm_usage + engine_generation_logs (utan matchande codegen-rad)"
    else:
        chat_rows = list(generations)
        chat_source = "engine_generation_logs"
    return run_rows, run_source, chat_rows, chat_source, warning


def build_token_rollup(
    *,
    db_data: dict[str, list[dict[str, Any]]],
    pricing: PricingTable,
    tier: str = "standard",
    version_id: str | None = None,
) -> dict[str, Any]:
    """Summera loggade tokens för versionen (run) och för hela chatten."""
    run_rows, run_source, chat_rows, chat_source, warning = _pick_rows(
        db_data, version_id=version_id
    )

    run_by_model, run_unpriced, run_usd, run_priced = _price_buckets(
        _accumulate(run_rows, default_phase="codegen"), pricing, tier
    )
    chat_by_model, chat_unpriced, chat_usd, chat_priced = _price_buckets(
        _accumulate(chat_rows, default_phase="codegen"), pricing, tier
    )

    notes: list[str] = []
    if warning:
        notes.append(warning)
    # Varna oavsett om telemetrin användes ensam eller som komplement till
    # llm_usage — risken sitter i telemetri-raderna, inte i vilken kombination
    # källorna hamnade i.
    telemetry_in_run = [
        row
        for row in rows_for_version(db_data.get("telemetry") or [], version_id)
        if row in run_rows and has_token_fields([row])
    ]
    if version_id and len(telemetry_in_run) > 1:
        notes.append(
            f"{len(telemetry_in_run)} telemetri-rader för versionen (retry/repair-pass) "
            "summeras — samma prompt kan därför räknas mer än en gång."
        )
    if not run_rows and not warning:
        notes.append(
            "Inga tokenrader kunde knytas till versionen. `engine_generation_logs` saknar "
            "`version_id`, så chat-summan nedan är det närmaste vi kommer."
        )

    # Rader som saknar version_id helt: brief, embeddings och klassificeraren körs
    # innan versionen finns och stämplas i efterhand. Stämplingen är best-effort, så
    # missar den en rad hamnar kostnaden utanför körningens summa. Att tysta det vore
    # att låta run-siffran se mer komplett ut än den är.
    unstamped = unstamped_usage_rows(db_data.get("llmusage") or [])
    if version_id and unstamped["rows"]:
        notes.append(
            f"{unstamped['rows']} llm_usage-rad(er) för chatten saknar version_id "
            f"({unstamped['totalTokens']} tokens). De ingår INTE i körningens summa — "
            "efterstämplingen hann inte, eller kördes utan databas. Chat-summan täcker dem."
        )

    return {
        "scope": "run",
        "versionId": version_id,
        "source": run_source,
        "tier": tier,
        "pricingVerifiedAt": pricing.verified_at,
        "usdToSek": pricing.usd_to_sek or None,
        "byModel": run_by_model,
        "byPhase": _phase_totals(run_rows, default_phase="codegen"),
        "totals": _totals(run_by_model, run_usd, run_priced, pricing),
        "unpricedModels": sorted(set(run_unpriced)),
        "unstamped": unstamped,
        "chat": {
            "scope": "chat",
            "source": chat_source,
            "rowLimitApplies": True,
            "byModel": chat_by_model,
            "totals": _totals(chat_by_model, chat_usd, chat_priced, pricing),
            "unpricedModels": sorted(set(chat_unpriced)),
            "note": (
                "Alla hämtade rader för chatten (begränsat av --limit), inte bara "
                "den här versionen."
            ),
        },
        "notes": notes,
    }


def unstamped_usage_rows(llm_usage: Iterable[dict[str, Any]]) -> dict[str, Any]:
    """`llm_usage`-rader utan `version_id`, och deras tokenvolym.

    De hör till chatten men kunde inte knytas till en körning. Redovisas separat i
    stället för att tystas, så en för låg run-summa går att förklara.
    """
    rows = [row for row in llm_usage if not row.get("version_id")]
    return {
        "rows": len(rows),
        "phases": sorted({str(row.get("phase") or "okänd") for row in rows}),
        "totalTokens": sum(
            _first_int(row, TOKEN_KEYS["prompt"]) + _first_int(row, TOKEN_KEYS["completion"])
            for row in rows
        ),
    }


def build_coverage(
    *,
    rollup: dict[str, Any],
    llm_usage_table_present: bool,
) -> dict[str, Any]:
    """Vilka faser vi faktiskt mäter för den här körningen.

    Läser **rollupens** faktiska rader, inte databasen igen. Annars kan
    `coverage` säga att codegen mättes medan `tokens.json` saknar tokens för
    körningen — två svar på samma fråga.
    """
    observed = {
        str(row.get("phase"))
        for row in (rollup.get("byPhase") or [])
        if row.get("phase") and _as_int(row.get("totalTokens"))
    }

    measured: list[dict[str, Any]] = []
    missing: list[dict[str, Any]] = []
    for entry in KNOWN_LLM_PHASES:
        item = {"phase": entry["phase"], "label": entry["label"], "owner": entry["owner"]}
        if entry["phase"] in observed:
            measured.append(item)
        else:
            item["reason"] = (
                "inga rader för den här körningen"
                if entry["logged_today"] or llm_usage_table_present
                else "usage loggas inte idag (fasen är inte instrumenterad)"
            )
            missing.append(item)

    return {
        "llmUsageTablePresent": llm_usage_table_present,
        "measuredPhases": measured,
        "unmeasuredPhases": missing,
        "note": (
            "Summan är en UNDRE gräns när faser saknas ovan. Cache-träffar "
            "prissätts med cachedInput när cached_input_tokens loggas. "
            "Se config/ai_models/pricing.json."
        ),
    }
