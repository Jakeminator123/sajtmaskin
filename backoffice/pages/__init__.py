from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from . import (
    ai_models,
    autofix,
    building_blocks,
    codegen_core,
    control_plane,
    cursor_agents,
    database_health,
    dossiers,
    env_policy,
    env_readiness,
    error_log_rag,
    eval_page,
    fixer_registry,
    generation_cost,
    generation_history,
    llm_config,
    llm_flode_telemetry,
    llm_flow_status,
    log_export,
    observability,
    orchestration,
    overview,
    pipeline_health,
    preview,
    projects_admin,
    prompt_core,
    redis_health,
    restore,
    scaffold_lifecycle,
    scaffold_performance,
    scaffold_wizard,
    scaffolds,
    selection_rationale,
    shadcn_audit,
    templates_blob,
    user_degraded_env,
)

# Sidlägen (mode) — styr badgen i sidomenyn och på Översikt:
#   "read"   = läsvy, ändrar ingenting
#   "edit"   = redigerbar yta (sparar filer; alla sparningar säkerhetskopieras)
#   "run"    = kör kommandon/skript (kan skriva genererade artefakter)
#   "danger" = innehåller destruktiva åtgärder (radering) — läs varningarna
# Runtime använder PageSpec.mode + MODE_BADGES (inte en separat PAGE_MODES-konstant).


@dataclass(frozen=True)
class PageSpec:
    name: str
    group: str
    render: Callable
    mode: str = "read"
    blurb: str = ""


PAGE_SPECS: tuple[PageSpec, ...] = (
    # ── Start ────────────────────────────────────────────────────────────
    PageSpec(
        "Översikt",
        "Start",
        overview.render,
        mode="read",
        blurb="Startsida: karta över alla vyer, vad som är redigerbart och var filerna bor.",
    ),
    PageSpec(
        "Återställning",
        "Start",
        restore.render,
        mode="edit",
        blurb="Ångra-lager: varje sparning säkerhetskopieras — bläddra, jämför och rulla tillbaka.",
    ),
    PageSpec(
        "Control Plane (cockpit)",
        "Start",
        control_plane.render,
        mode="read",
        blurb="Registerkarta: vilken fil äger vilket beslut, och var den redigeras.",
    ),
    # ── Byggstenar ───────────────────────────────────────────────────────
    # Ordningen är arbetsordningen: förstå → titta → skapa/ta bort → guide →
    # byggblock → mallar. Namnen innehåller verbet, så menyn svarar på "var
    # tittar jag / var ändrar jag / var skapar jag". Gamla namn lever kvar som
    # `?nav=`-alias längst ned i filen (permanent, testat).
    PageSpec(
        "Byggstenar: översikt",
        "Byggstenar",
        building_blocks.render,
        mode="read",
        blurb="Börja här: scaffold, variant, byggblock och mall — vad de är, hur de hänger ihop och vad en sparning påverkar.",
    ),
    PageSpec(
        "Scaffolds: titta & justera",
        "Byggstenar",
        scaffolds.render,
        mode="edit",
        blurb="Titta på scaffolds och finjustera matchord, instruktioner och kvalitetskrav.",
    ),
    PageSpec(
        "Scaffolds & varianter: skapa, redigera, klona, ta bort",
        "Byggstenar",
        scaffold_lifecycle.render,
        mode="danger",
        blurb="Skapa och klona scaffolds/varianter. Radering och fabriksåterställning ligger i en egen farlig zon.",
    ),
    PageSpec(
        "Guide: ny scaffold eller variant (AI)",
        "Byggstenar",
        scaffold_wizard.render,
        mode="edit",
        blurb="Rekommenderad väg: steg-för-steg med AI-utkast, grön checklista innan något skrivs.",
    ),
    PageSpec(
        "Byggblock (dossiers)",
        "Byggstenar",
        dossiers.render,
        mode="danger",
        blurb="Byggblocken (funktioner) som kan byggas in i en sajt: bläddra, redigera, kurera och radera.",
    ),
    PageSpec(
        "Mallar (v0): inspiration & uppladdning",
        "Byggstenar",
        templates_blob.render,
        mode="run",
        blurb="v0-mallar i Vercel Blob — inspiration för nya varianter, inte en byggsten i sig.",
    ),
    # ── LLM & prompts ────────────────────────────────────────────────────
    PageSpec(
        "ai_models",
        "LLM & prompts",
        ai_models.render,
        mode="edit",
        blurb="Enda redigeringsytan för LLM-manifestet: modeller, budgetar, repair, timeouts.",
    ),
    PageSpec(
        "LLM-faser & runtime-sanning",
        "LLM & prompts",
        llm_config.render,
        mode="read",
        blurb="Läsvy: vilka modeller som faktiskt körs per fas och byggprofil.",
    ),
    PageSpec(
        "Codegen core",
        "LLM & prompts",
        codegen_core.render,
        mode="edit",
        blurb="Core Rules-fragmentens ordning + domain rules + heuristic tokens.",
    ),
    PageSpec(
        "prompt-core",
        "LLM & prompts",
        prompt_core.render,
        mode="edit",
        blurb="Redigera Core Rules-texterna (statisk systemprompt) fil för fil.",
    ),
    PageSpec(
        "Normalize / RepairGate & Kvalitet",
        "LLM & prompts",
        autofix.render,
        mode="read",
        blurb="Läsvy över fix-pipelinen, statistik och hardening-historik. Redigeras i ai_models.",
    ),
    PageSpec(
        "Fixer Registry",
        "LLM & prompts",
        fixer_registry.render,
        mode="run",
        blurb="Katalog över alla fixers (Normalize/RepairGate) med status och triggers.",
    ),
    PageSpec(
        "Eval",
        "LLM & prompts",
        eval_page.render,
        mode="run",
        blurb="Kör scaffold-selection-eval och codegen-eval-gates, spara rapporter.",
    ),
    PageSpec(
        "Orchestration Map",
        "LLM & prompts",
        orchestration.render,
        mode="read",
        blurb="Statisk referenskarta över typer och flöden i orkestreringen.",
    ),
    # ── Miljö & policy ───────────────────────────────────────────────────
    PageSpec(
        "env-policy",
        "Miljö & policy",
        env_policy.render,
        mode="edit",
        blurb="Policy för kända env-nycklar. Schema-validering blockerar trasiga sparningar.",
    ),
    PageSpec(
        "Env Readiness (read-only)",
        "Miljö & policy",
        env_readiness.render,
        mode="read",
        blurb="Läsvy: env-lager, klassificering och readiness per nyckel (maskerade värden).",
    ),
    PageSpec(
        "user_degraded_env",
        "Miljö & policy",
        user_degraded_env.render,
        mode="edit",
        blurb="Policytext för degraded/placeholder-miljö i användarprojekt.",
    ),
    PageSpec(
        "shadcn-audit",
        "Miljö & policy",
        shadcn_audit.render,
        mode="edit",
        blurb="Sync-status för shadcn-komponenter + audit-policy.",
    ),
    PageSpec(
        "Cursor-agenter",
        "Miljö & policy",
        cursor_agents.render,
        mode="edit",
        blurb="Redigera terminologi-regeln och kodkartan som agenterna läser.",
    ),
    # ── Drift & hälsa ────────────────────────────────────────────────────
    PageSpec(
        "Databashälsa",
        "Drift & hälsa",
        database_health.render,
        mode="run",
        blurb="Diagnos av Postgres-tabeller/index; kan applicera saknade index.",
    ),
    PageSpec(
        "Redis-hälsa",
        "Drift & hälsa",
        redis_health.render,
        mode="run",
        blurb="Diagnos av Upstash Redis (ping, buckets, probe).",
    ),
    PageSpec(
        "Pipeline Health",
        "Drift & hälsa",
        pipeline_health.render,
        mode="run",
        blurb="Kör underhållsskript (embeddings, shadcn-sync m.m.) och se stale-status.",
    ),
    PageSpec(
        "Projekt-admin (radera)",
        "Drift & hälsa",
        projects_admin.render,
        mode="danger",
        blurb="Massradera testkontons projekt i databasen. Dry-run är default.",
    ),
    PageSpec(
        "Error-log RAG",
        "Drift & hälsa",
        error_log_rag.render,
        mode="run",
        blurb="Status för fel-loggens RAG-index; kan tvinga omindexering.",
    ),
    # ── Telemetri & loggar ───────────────────────────────────────────────
    PageSpec(
        "Observability",
        "Telemetri & loggar",
        observability.render,
        mode="read",
        blurb="Live-metrics från appens /api/metrics (latens, fixers, verifier).",
    ),
    PageSpec(
        "LLM-flöde telemetri",
        "Telemetri & loggar",
        llm_flode_telemetry.render,
        mode="read",
        blurb="Aggregerad tidslinje ur generationsloggen (waves 1–7).",
    ),
    PageSpec(
        "LLM-flöde status",
        "Telemetri & loggar",
        llm_flow_status.render,
        mode="run",
        blurb="Deterministisk statuskarta över LLM-flödet; kan byggas om.",
    ),
    PageSpec(
        "Generation History",
        "Telemetri & loggar",
        generation_history.render,
        mode="read",
        blurb="Historik per chatt ur databasen: scaffold, modell, retries, utfall.",
    ),
    PageSpec(
        "Generation Cost",
        "Telemetri & loggar",
        generation_cost.render,
        mode="read",
        blurb="Tokenkostnad i USD/SEK från loggad användning.",
    ),
    PageSpec(
        # Flyttad från Byggstenar 2026-07-24: det här är telemetri (kräver DB),
        # inte en byggsten man redigerar.
        "Scaffold-poäng",
        "Telemetri & loggar",
        scaffold_performance.render,
        mode="read",
        blurb="Poäng per scaffold från genererings-telemetri (kräver databas).",
    ),
    PageSpec(
        "Logg-export",
        "Telemetri & loggar",
        log_export.render,
        mode="run",
        blurb="Exportera loggtabeller som JSON/CSV (dev eller prod).",
    ),
    PageSpec(
        "Selection Rationale (read-only)",
        "Telemetri & loggar",
        selection_rationale.render,
        mode="read",
        blurb="Varför valdes denna scaffold/variant/modell? Spårbarhet per körning.",
    ),
    PageSpec(
        "Preview och versioner",
        "Telemetri & loggar",
        preview.render,
        mode="read",
        blurb="F2/F3-livscykel, prompt-dumps och senaste generationsloggar.",
    ),
)

PAGE_MAP = {spec.name: spec for spec in PAGE_SPECS}
PAGE_NAMES = tuple(spec.name for spec in PAGE_SPECS)
PAGE_GROUPS = (
    "Start",
    "Byggstenar",
    "LLM & prompts",
    "Miljö & policy",
    "Drift & hälsa",
    "Telemetri & loggar",
)
PAGE_QUERY_ALIASES = {
    "llm": "LLM-faser & runtime-sanning",
    "control-plane": "Control Plane (cockpit)",
    "cockpit": "Control Plane (cockpit)",
    "env-readiness": "Env Readiness (read-only)",
    "env-flow": "Env Readiness (read-only)",
    "selection-rationale": "Selection Rationale (read-only)",
    "rationale": "Selection Rationale (read-only)",
    "matching": "Selection Rationale (read-only)",
    "generations": "Generation History",
    "generation-history": "Generation History",
    "history": "Generation History",
    "cost": "Generation Cost",
    "generation-cost": "Generation Cost",
    "kostnad": "Generation Cost",
    "logs": "Logg-export",
    "log-export": "Logg-export",
    "logg-export": "Logg-export",
    "llm-flow": "LLM-flöde status",
    "canvas": "LLM-flöde status",
    "core": "prompt-core",
    # ── Byggstenar: korta slugs + PERMANENTA alias för de gamla sidnamnen ──
    # Sidorna döptes om 2026-07-24 (verb-namn på svenska). De gamla namnen och
    # slugsen får aldrig sluta fungera — sparade deep links, docs och
    # `config/control-plane/policy-registry.json` refererar dem.
    # `backoffice/test_building_blocks_nav.py` vaktar att varje rad resolverar.
    "byggstenar": "Byggstenar: översikt",
    "building-blocks": "Byggstenar: översikt",
    "scaffolds": "Scaffolds: titta & justera",
    "Scaffolds": "Scaffolds: titta & justera",
    "scaffold-lifecycle": "Scaffolds & varianter: skapa, redigera, klona, ta bort",
    "lifecycle": "Scaffolds & varianter: skapa, redigera, klona, ta bort",
    "varianter": "Scaffolds & varianter: skapa, redigera, klona, ta bort",
    "variants": "Scaffolds & varianter: skapa, redigera, klona, ta bort",
    "Scaffold Lifecycle": "Scaffolds & varianter: skapa, redigera, klona, ta bort",
    "Scaffolds & varianter: skapa, klona, ta bort": "Scaffolds & varianter: skapa, redigera, klona, ta bort",
    "wizard": "Guide: ny scaffold eller variant (AI)",
    "scaffold-wizard": "Guide: ny scaffold eller variant (AI)",
    "guide": "Guide: ny scaffold eller variant (AI)",
    "Scaffold Wizard": "Guide: ny scaffold eller variant (AI)",
    "dossiers": "Byggblock (dossiers)",
    "byggblock": "Byggblock (dossiers)",
    "Dossiers (legoklossar)": "Byggblock (dossiers)",
    "mallar": "Mallar (v0): inspiration & uppladdning",
    "templates": "Mallar (v0): inspiration & uppladdning",
    "blob": "Mallar (v0): inspiration & uppladdning",
    "Mallar → Blob-upload": "Mallar (v0): inspiration & uppladdning",
    "scaffold-performance": "Scaffold-poäng",
    "scaffold-poang": "Scaffold-poäng",
    "Scaffold Performance": "Scaffold-poäng",
    "db": "Databashälsa",
    "database": "Databashälsa",
    "redis": "Redis-hälsa",
    "restore": "Återställning",
    "aterstallning": "Återställning",
    "backup": "Återställning",
    "autofix": "Normalize / RepairGate & Kvalitet",
    "repair": "Normalize / RepairGate & Kvalitet",
}
