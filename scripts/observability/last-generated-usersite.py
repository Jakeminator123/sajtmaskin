#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""last-generated-usersite.py — dra hem ALLA loggar för den senast genererade
användarsajten och sammanfatta hur körningen gick.

Det här är `/logg` som skript i stället för en manuell agentsession: samma källor,
samma bedömning, men sparat på disk så två körningar går att jämföra.

Källor (varje saknad källa hoppas över och redovisas, aldrig hårt fel):

| Källa | Vad | Kräver |
| --- | --- | --- |
| Postgres (Supabase) | prompt, generering, version, telemetri, fel, OpenClaw-fynd, RAG-events, deploy, `llm_usage` | `POSTGRES_URL` |
| Vercel | build-logg för sajtens deploy, runtime-events för appen, DB-pool-hälsa | `VERCEL_TOKEN` |
| Fly preview-host | sessionslista + preview-runtime-logg | `SAJTMASKIN_PREVIEW_HOST_BASE_URL` + `..._API_KEY` |
| OpenAI | org-förbrukning i tidsfönstret (minutbuckets) + kostnad | `OPENAI_ADMIN_KEY` |
| D-ID | credits-saldo + videogenereringar | `DID_API_KEY` |

Utdata: `data/gen-logs/<datum>_<chat>/` med `index.json`, `tokens.json`,
`summary.md`, `report.html` och råa loggar per källa. Högst `MAX_GEN_LOGS`
(default 10) mappar sparas — äldsta raderas.

Read-only: bara `SELECT` och `GET`. Skriver aldrig till DB, Vercel, Fly eller
någon leverantör. Secrets maskeras innan något hamnar på disk.

Körning:

    python scripts/observability/last-generated-usersite.py            # dev-env
    python scripts/observability/last-generated-usersite.py --prod     # prod-snapshot
    python scripts/observability/last-generated-usersite.py --chat <chatId> --open

Beroenden: `python -m pip install -r requirements.genlogs.txt` (pg8000). Utan den
faller skriptet tillbaka på `scripts/db/dump-logs.mjs` i reducerat läge.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import webbrowser
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from genlogs import SCHEMA_VERSION  # noqa: E402
from genlogs import assess, db, dumplogs, envfile, report, store, usage  # noqa: E402
from genlogs.pricing import PricingTable  # noqa: E402
from genlogs.redact import Redactor  # noqa: E402
from genlogs.sources import STATUS_UNAVAILABLE, did, fly, openai_usage, vercel  # noqa: E402

DEFAULT_ROW_LIMIT = 200
DEFAULT_WINDOW_MIN = 20


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="last-generated-usersite.py",
        description="Samla alla loggar för den senast genererade användarsajten (read-only).",
    )
    parser.add_argument("--chat", metavar="chatId", help="Specifik chat i stället för den senaste.")
    parser.add_argument("--env", metavar="PATH", help=f"Env-fil att läsa (default: {envfile.DEV_ENV_FILE}; prod kräver --prod).")
    parser.add_argument("--prod", action="store_true", help=f"Tvinga {envfile.PROD_ENV_FILE}.")
    parser.add_argument("--dev", action="store_true", help=f"Tvinga {envfile.DEV_ENV_FILE}.")
    parser.add_argument("--limit", type=int, default=DEFAULT_ROW_LIMIT, help=f"Rader per loggtyp (default {DEFAULT_ROW_LIMIT}).")
    parser.add_argument("--window-min", type=int, default=DEFAULT_WINDOW_MIN, help=f"Tidsfönster ± minuter kring körningen (default {DEFAULT_WINDOW_MIN}).")
    parser.add_argument("--max-logs", type=int, help=f"Antal körningsmappar att spara (default {store.MAX_GEN_LOGS_ENV} eller {store.DEFAULT_MAX_GEN_LOGS}).")
    parser.add_argument("--out", metavar="DIR", default=store.DEFAULT_OUT_DIR, help=f"Utdatamapp (default {store.DEFAULT_OUT_DIR}).")
    parser.add_argument("--user-days", type=int, default=30, help="Fönster för per-användare-rollup i dagar (default 30).")
    parser.add_argument("--tier", default="standard", help="Pris-tier i pricing.json (default standard).")
    parser.add_argument("--include-files-json", action="store_true", help="Ta med tunga kolumner (hela sajtens källkod).")
    parser.add_argument("--verify-tls", action="store_true", help="Kräv giltigt TLS-cert mot Postgres (Supabase-poolern ser självsignerad ut).")
    parser.add_argument("--fly-cli", action="store_true", help="Kör även `fly logs -a <app> --no-tail`.")
    parser.add_argument("--vercel-base", default=vercel.DEFAULT_API_BASE, help="Bas-URL för Vercel-API:et (för test mot stubb).")
    parser.add_argument("--openai-base", default=openai_usage.DEFAULT_API_BASE, help="Bas-URL för OpenAI Admin API (för test mot stubb).")
    parser.add_argument("--did-base", default=did.DEFAULT_API_BASE, help="Bas-URL för D-ID API:et (för test mot stubb).")
    parser.add_argument("--no-vercel", action="store_true", help="Hoppa över Vercel.")
    parser.add_argument("--no-fly", action="store_true", help="Hoppa över Fly preview-host.")
    parser.add_argument("--no-openai", action="store_true", help="Hoppa över OpenAI Admin usage/costs.")
    parser.add_argument("--no-did", action="store_true", help="Hoppa över D-ID.")
    parser.add_argument("--db-only", action="store_true", help="Bara databasen — hoppa över alla externa källor.")
    parser.add_argument("--open", action="store_true", dest="open_report", help="Öppna report.html när den är klar.")
    parser.add_argument("--json", action="store_true", dest="as_json", help="Skriv manifestet som JSON till stdout.")
    parser.add_argument("--quiet", action="store_true", help="Skriv inget till stdout utöver fel.")
    return parser


def resolve_env_path(args: argparse.Namespace) -> str:
    if args.env:
        return args.env
    if args.prod:
        return envfile.PROD_ENV_FILE
    if args.dev:
        return envfile.DEV_ENV_FILE
    return envfile.default_env_file(REPO_ROOT)


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.prod and args.dev:
        print("Välj antingen --prod eller --dev, inte båda.", file=sys.stderr)
        return 2

    env_path = resolve_env_path(args)
    env = envfile.load_env(REPO_ROOT, env_path)
    redactor = Redactor(env.secret_values())
    log = _make_logger(args.quiet)
    warnings: list[str] = []

    if not env.file_exists:
        warnings.append(
            f"Env-filen {env_path} saknas — läser bara processens env. "
            f"Kör `npm run env:pull:prod-snapshot` och lägg till `--prod` för produktionsdata."
        )
        log(f"! {warnings[-1]}")
    elif env_path == envfile.DEV_ENV_FILE and envfile.prod_snapshot_exists(REPO_ROOT):
        log(f"→ Läser dev ({env_path}). Lägg till --prod för {envfile.PROD_ENV_FILE}.")

    prod_like = env_path == envfile.PROD_ENV_FILE or (
        envfile.prod_snapshot_exists(REPO_ROOT) and _same_target(env)
    )

    # --- 1. Databas ---------------------------------------------------------
    collected = _collect_db(args, env, env_path, log)
    if collected is None:
        return 1
    version, db_data, db_meta, owner, user_rollup = collected

    chat_id = _text(version.get("chat_id"))
    version_id = _text(version.get("version_id") or version.get("id"))
    created_at = _as_datetime(version.get("created_at")) or dt.datetime.now(dt.timezone.utc)
    window_start = created_at - dt.timedelta(minutes=args.window_min)
    window_end = created_at + dt.timedelta(minutes=args.window_min)

    log(f"→ Sajt: {version.get('title') or '(utan titel)'} · chat={chat_id} · version={version_id}")
    log(f"→ Rader: " + " · ".join(f"{kind}={len(rows)}" for kind, rows in db_data.items() if rows))

    # --- 2. Externa källor --------------------------------------------------
    sources: dict[str, Any] = {
        "postgres": {
            "status": db_meta["status"],
            "mode": db_meta["mode"],
            "target": db_meta.get("target"),
            "warnings": db_meta.get("warnings") or [],
        }
    }
    skip_all = args.db_only

    if skip_all or args.no_vercel:
        sources["vercel"] = _skipped("--no-vercel" if args.no_vercel else "--db-only")
    else:
        linked = vercel.read_linked_project(REPO_ROOT)
        log("→ Hämtar Vercel-loggar…")
        sources["vercel"] = vercel.collect(
            token=env.get("VERCEL_TOKEN") or env.get("VERCEL_TOKEN_FULL"),
            team_id=env.get("VERCEL_TEAM_ID") or linked.get("teamId"),
            app_project_id=env.get("VERCEL_PROJECT_ID") or linked.get("projectId"),
            deploy_rows=db_data.get("deploys") or [],
            since_ms=int(window_start.timestamp() * 1000),
            until_ms=int(window_end.timestamp() * 1000),
            run_at_ms=int(created_at.timestamp() * 1000),
            version_id=version_id,
            limit=min(args.limit, 200),
            api_base=args.vercel_base,
        )

    if skip_all or args.no_fly:
        sources["fly"] = _skipped("--no-fly" if args.no_fly else "--db-only")
    else:
        log("→ Hämtar preview-host-loggar (Fly)…")
        sources["fly"] = fly.collect(
            base_url=env.get("SAJTMASKIN_PREVIEW_HOST_BASE_URL"),
            api_key=env.get("SAJTMASKIN_PREVIEW_HOST_API_KEY"),
            chat_id=chat_id,
            version_id=version_id,
            include_fly_cli=args.fly_cli,
        )

    if skip_all or args.no_openai:
        sources["openai"] = _skipped("--no-openai" if args.no_openai else "--db-only")
    else:
        log("→ Hämtar OpenAI org-förbrukning…")
        sources["openai"] = openai_usage.collect(
            admin_key=_first_env(env, openai_usage.ADMIN_KEY_ENV),
            start_epoch=int(window_start.timestamp()),
            end_epoch=int(window_end.timestamp()),
            api_base=args.openai_base,
        )

    if skip_all or args.no_did:
        sources["did"] = _skipped("--no-did" if args.no_did else "--db-only")
    else:
        log("→ Hämtar D-ID credits…")
        sources["did"] = did.collect(
            api_key=_first_env(env, did.API_KEY_ENV),
            window_start=window_start,
            window_end=window_end,
            api_base=args.did_base,
        )

    # --- 3. Tokenrollup + bedömning ----------------------------------------
    pricing = PricingTable.load(REPO_ROOT)
    if pricing.error:
        warnings.append(pricing.error)
    tokens = usage.build_token_rollup(
        db_data=db_data, pricing=pricing, tier=args.tier, version_id=version_id
    )
    coverage = usage.build_coverage(
        rollup=tokens,
        llm_usage_table_present=db_meta.get("llmUsageTablePresent", False),
    )
    assessment = assess.assess_run(
        version=version, db_data=db_data, fly=sources.get("fly"), version_id=version_id
    )

    # --- 4. Skriv körningsmappen -------------------------------------------
    collected_at = dt.datetime.now(dt.timezone.utc)
    out_root = _resolve_out_root(args.out)
    run_dir_name = store.unique_run_dir_name(
        out_root, store.build_run_dir_name(collected_at, chat_id)
    )
    run_store = store.RunStore(out_root / run_dir_name, redactor=redactor)

    for kind, rows in db_data.items():
        run_store.write_json(f"db/{kind}.json", rows)
    for name, key in (("vercel", "vercel"), ("fly", "fly"), ("openai", "openai"), ("did", "did")):
        run_store.write_json(f"{name}/{key}.json", sources.get(key))
    if user_rollup is not None:
        run_store.write_json("db/user-rollup.json", user_rollup)

    build_tail = ((sources.get("vercel") or {}).get("site") or {}).get("buildLogTail") or []
    fly_source = sources.get("fly") or {}
    fly_tail = fly_source.get("logTail") or []
    # Hör loggen till en annan version? Då är den inte den här körningens bevis:
    # filen skrivs (med rubrik) men den lyfts inte in i rapporten.
    fly_tail_mismatch = fly_source.get("sessionVersionMismatch") or None
    if build_tail:
        run_store.write_text("vercel/build-log-tail.txt", "\n".join(build_tail))
    if fly_tail:
        header = (
            [
                f"# OBS: sessionen tillhör version {fly_tail_mismatch.get('sessionVersionId')}, "
                f"inte {fly_tail_mismatch.get('expectedVersionId')} — loggen gäller en annan körning.",
                "",
            ]
            if fly_tail_mismatch
            else []
        )
        run_store.write_text("fly/preview-log-tail.txt", "\n".join([*header, *fly_tail]))

    max_logs, max_logs_warning = store.resolve_max_gen_logs(
        env.get(store.MAX_GEN_LOGS_ENV), args.max_logs
    )
    if max_logs_warning:
        warnings.append(max_logs_warning)
    removed = store.rotate_run_dirs(out_root, max_logs, keep=run_store.run_dir)

    manifest: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "tool": "scripts/observability/last-generated-usersite.py",
        "collectedAt": collected_at.isoformat(),
        "runDir": run_dir_name,
        "outRoot": str(out_root.relative_to(REPO_ROOT)) if _is_relative(out_root) else str(out_root),
        "env": {
            "path": env_path,
            "exists": env.file_exists,
            "target": db_meta.get("target"),
            "prodLike": bool(prod_like),
        },
        "identity": {
            "chatId": chat_id,
            "versionId": version_id,
            "title": _text(version.get("title")),
            "projectId": _text(version.get("project_id")),
            "model": _text(version.get("model")),
            "scaffoldId": _text(version.get("scaffold_id")),
            "previewUrl": _text(version.get("preview_url")),
            "createdAt": created_at.isoformat(),
            "versionNumber": version.get("version_number"),
            "releaseState": _text(version.get("release_state")),
            "verificationState": _text(version.get("verification_state")),
            "lifecycleStage": _text(version.get("lifecycle_stage")),
            "editKind": _text(version.get("edit_kind")),
        },
        "owner": owner,
        "window": {
            "startIso": window_start.isoformat(),
            "endIso": window_end.isoformat(),
            "minutes": args.window_min,
        },
        "assessment": assessment,
        "db": db_meta,
        "tokens": tokens,
        "coverage": coverage,
        "userRollup": user_rollup,
        "sources": sources,
        "tails": {
            "fly": [] if fly_tail_mismatch else fly_tail[-40:],
            "vercelBuild": build_tail[-40:],
        },
        "rotation": {"maxGenLogs": max_logs, "removed": removed},
        "warnings": warnings,
    }

    run_store.write_json("tokens.json", {
        "schemaVersion": SCHEMA_VERSION,
        "collectedAt": manifest["collectedAt"],
        "identity": manifest["identity"],
        "owner": owner,
        "measured": tokens,
        "coverage": coverage,
        "userRollup": user_rollup,
        "external": {
            "openai": _openai_digest(sources.get("openai")),
            "did": _did_digest(sources.get("did")),
        },
    })
    run_store.write_text("summary.md", report.render_summary_md(manifest))
    report_path = run_store.write_text("report.html", report.render_report_html(manifest))
    manifest["files"] = run_store.files
    run_store.write_json("index.json", manifest)

    # --- 5. Utskrift --------------------------------------------------------
    if args.as_json:
        print(json.dumps(redactor.value(manifest), ensure_ascii=False, indent=2, cls=store.JsonSafeEncoder))
    elif not args.quiet:
        print()
        print(report.render_summary_md(manifest))
        print(f"Skrev {len(run_store.files)} filer ({run_store.total_bytes // 1024} kB) → {run_store.run_dir}")
        if removed:
            print(f"Roterade bort: {', '.join(removed)}")

    if args.open_report:
        webbrowser.open(report_path.as_uri())

    return 0


# --------------------------------------------------------------------------- #
# DB-insamling (drivrutin först, dump-logs.mjs som reserv)
# --------------------------------------------------------------------------- #


def _collect_db(
    args: argparse.Namespace, env: envfile.EnvBundle, env_path: str, log: Any
) -> tuple[dict[str, Any], dict[str, list[dict[str, Any]]], dict[str, Any], dict[str, Any], dict[str, Any] | None] | None:
    target, target_error = envfile.resolve_postgres_target(env)
    driver_error: str | None = None

    if target is not None and db.driver_available():
        try:
            return _collect_db_direct(args, target, log)
        except db.DbUnavailable as exc:
            driver_error = str(exc)
            log(f"! Direkt DB-läsning misslyckades: {driver_error}")
    elif target is None:
        driver_error = target_error
    else:
        driver_error = "pg8000 saknas (python -m pip install -r requirements.genlogs.txt)."
        log(f"! {driver_error} Faller tillbaka på dump-logs.mjs.")

    if not dumplogs.available(REPO_ROOT):
        print(
            "Kunde inte läsa databasen. "
            + (driver_error or "Okänt fel")
            + f"\nReservvägen ({dumplogs.DUMP_SCRIPT_REL}) är inte tillgänglig heller.",
            file=sys.stderr,
        )
        return None

    try:
        return _collect_db_fallback(args, env_path, driver_error, log)
    except dumplogs.DumpLogsUnavailable as exc:
        print(f"Kunde inte läsa databasen: {exc}", file=sys.stderr)
        return None


def _collect_db_direct(
    args: argparse.Namespace, target: envfile.PostgresTarget, log: Any
) -> tuple[dict[str, Any], dict[str, list[dict[str, Any]]], dict[str, Any], dict[str, Any], dict[str, Any] | None]:
    conn = db.connect(target, verify_tls=args.verify_tls)
    try:
        version = db.latest_version(conn, chat_id=args.chat)
        if version is None:
            raise db.DbUnavailable(
                f"Ingen version hittades{f' för chat {args.chat}' if args.chat else ''} i {target.label}."
            )
        chat_id = _text(version.get("chat_id"))
        present = db.existing_tables(conn, [spec.table for spec in db.LOG_TABLES])

        data: dict[str, list[dict[str, Any]]] = {}
        omitted: dict[str, list[str]] = {}
        missing: list[str] = []
        for spec in db.LOG_TABLES:
            if spec.table not in present:
                if not spec.optional:
                    missing.append(spec.table)
                continue
            rows, dropped = db.fetch_log_rows(
                conn,
                spec,
                chat_id=chat_id,
                limit=args.limit,
                include_heavy=args.include_files_json,
            )
            data[spec.kind] = rows
            if dropped:
                omitted[spec.kind] = dropped

        owner = db.chat_owner(conn, chat_id) if chat_id else {"userId": None, "guest": None}
        user_rollup = None
        if owner.get("userId"):
            user_rollup = db.user_token_rollup(
                conn,
                str(owner["userId"]),
                days=args.user_days,
                include_llm_usage="llm_usage" in present,
            )

        meta = {
            "status": "ok",
            "mode": "direct (pg8000)",
            "target": target.label,
            "sourceEnvKey": target.source_key,
            "identity": db.db_identity(conn),
            "counts": {kind: len(rows) for kind, rows in data.items()},
            "tables": {spec.kind: spec.table for spec in db.LOG_TABLES if spec.kind in data},
            "omittedColumns": omitted,
            "missingTables": missing,
            "llmUsageTablePresent": "llm_usage" in present,
            "warnings": (
                [f"Tabeller saknas: {', '.join(missing)}"] if missing else []
            ),
        }
        return version, data, meta, owner, user_rollup
    finally:
        try:
            conn.close()
        except Exception:  # noqa: BLE001 - stängning får inte maskera resultatet
            pass


def _collect_db_fallback(
    args: argparse.Namespace, env_path: str, driver_error: str | None, log: Any
) -> tuple[dict[str, Any], dict[str, list[dict[str, Any]]], dict[str, Any], dict[str, Any], dict[str, Any] | None]:
    log("→ Läser DB via scripts/db/dump-logs.mjs (reducerat läge)…")
    chat_id = args.chat
    if not chat_id:
        probe = dumplogs.run_dump_logs(REPO_ROOT, env_path=env_path, kinds=("versions",), limit=1)
        latest = dumplogs.latest_version_from_payload(probe)
        if latest is None:
            raise dumplogs.DumpLogsUnavailable("Ingen version hittades i databasen.")
        chat_id = _text(latest.get("chat_id"))

    payload = dumplogs.run_dump_logs(
        REPO_ROOT, env_path=env_path, limit=args.limit, chat_id=chat_id
    )
    data = {kind: rows for kind, rows in (payload.get("data") or {}).items() if isinstance(rows, list)}
    version = dumplogs.latest_version_from_payload(payload)
    if version is None:
        raise dumplogs.DumpLogsUnavailable(f"Inga versionsrader för chat {chat_id}.")
    version = dumplogs.enrich_from_chats(version, payload)

    meta = {
        "status": "partial",
        "mode": "fallback (dump-logs.mjs)",
        "target": payload.get("target"),
        "counts": {kind: len(rows) for kind, rows in data.items()},
        "tables": {spec.kind: spec.table for spec in db.LOG_TABLES if spec.kind in data},
        "omittedColumns": {},
        "missingTables": [],
        # dump-logs rapporterar en saknad tabell som `skipped`, så frånvaron av
        # llmusage där betyder att tabellen finns.
        "llmUsageTablePresent": "llmusage" not in (payload.get("skipped") or {}),
        "skipped": payload.get("skipped") or {},
        "warnings": [
            "Reducerat läge: fasta kolumnlistor och ingen ägar-attribution "
            "(app_projects/per-användare). Installera pg8000 för full insamling."
        ]
        + ([driver_error] if driver_error else []),
    }
    owner = {
        "userId": None,
        "sessionIds": [],
        "projectId": _text(version.get("project_id")),
        # Reducerat läge kan inte läsa app_projects → gäst går inte att avgöra.
        "guest": None,
        "unknown": True,
    }
    return version, data, meta, owner, None


# --------------------------------------------------------------------------- #
# Hjälpare
# --------------------------------------------------------------------------- #


def _make_logger(quiet: bool) -> Any:
    def log(message: str) -> None:
        if not quiet:
            print(message, file=sys.stderr)

    return log


def _skipped(reason: str) -> dict[str, Any]:
    return {"status": STATUS_UNAVAILABLE, "reason": f"Hoppades över ({reason})."}


def _first_env(env: envfile.EnvBundle, keys: tuple[str, ...]) -> str | None:
    for key in keys:
        value = env.get(key)
        if value:
            return value
    return None


def _text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


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


def _resolve_out_root(raw: str) -> Path:
    path = Path(raw)
    return path if path.is_absolute() else REPO_ROOT / path


def _is_relative(path: Path) -> bool:
    try:
        path.relative_to(REPO_ROOT)
    except ValueError:
        return False
    return True


def _same_target(env: envfile.EnvBundle) -> bool:
    """Pekar processens URL mot samma DB som prod-snapshotet?"""
    snapshot = envfile.load_env(REPO_ROOT, envfile.PROD_ENV_FILE)
    current, _ = envfile.resolve_postgres_target(env)
    prod, _ = envfile.resolve_postgres_target(snapshot)
    if current is None or prod is None:
        return False
    return (current.host, current.port, current.database) == (prod.host, prod.port, prod.database)


def _openai_digest(source: dict[str, Any] | None) -> dict[str, Any] | None:
    if not source or source.get("status") == STATUS_UNAVAILABLE:
        return {"status": (source or {}).get("status"), "reason": (source or {}).get("reason")}
    surfaces = source.get("surfaces") or {}
    digest: dict[str, Any] = {"status": source.get("status"), "window": source.get("window"), "surfaces": {}}
    for name, entry in surfaces.items():
        totals = (entry or {}).get("totals") or {}
        if totals.get("totals"):
            digest["surfaces"][name] = totals["totals"]
    costs = (source.get("costs") or {}).get("totals")
    if costs:
        digest["costs"] = costs
    digest["attributionNote"] = source.get("attributionNote")
    return digest


def _did_digest(source: dict[str, Any] | None) -> dict[str, Any] | None:
    if not source or source.get("status") == STATUS_UNAVAILABLE:
        return {"status": (source or {}).get("status"), "reason": (source or {}).get("reason")}
    return {
        "status": source.get("status"),
        "credits": source.get("creditsSummary"),
        "talksInWindow": len(source.get("talksInWindow") or []),
        "unitNote": source.get("unitNote"),
    }


if __name__ == "__main__":
    raise SystemExit(main())
