# -*- coding: utf-8 -*-
"""Read-only Postgres-läsning för genlogg-insamlingen.

Designval: **kolumnerna introspekteras** via `information_schema` i stället för
att hårdkodas. En ny kolumn i `src/lib/db/schema.ts` följer därför med automatiskt
och kan inte tysta drifta bort som en hårdkodad lista gör (jfr `dump-logs.mjs`,
som medvetet har fasta kolumnlistor för sin UI-yta).

Bara `SELECT`. Ingen funktion här skriver, och tabellnamnen kommer från
allowlistan `LOG_TABLES` — aldrig från indata.
"""

from __future__ import annotations

import re
import ssl
from dataclasses import dataclass
from typing import Any, Iterable

from .envfile import PostgresTarget

try:  # pg8000 är en ren Python-drivrutin (samma pin som requirements.dbtest.txt).
    import pg8000.dbapi as pg  # type: ignore[import-untyped]
except ImportError:  # pragma: no cover - täcks av degraderingsvägen
    pg = None

_IDENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

#: Tunga kolumner som aldrig ska med per default — `files_json` är hela sajtens
#: källkod och gör körningsmappen tiotals MB stor utan att förklara något.
HEAVY_COLUMNS = frozenset({"files_json", "repaired_files_json"})


@dataclass(frozen=True)
class LogTable:
    """En loggtabell och hur den kopplas till en chat."""

    kind: str
    table: str
    chat_column: str | None
    label: str
    #: `llm_usage` finns bara efter att steg 2 i planen levererats.
    optional: bool = False


#: Speglar `--kinds` i `scripts/db/dump-logs.mjs` (samma tabeller, samma
#: chat-koppling) plus per-anrops-usage när den tabellen finns.
LOG_TABLES: tuple[LogTable, ...] = (
    LogTable("chats", "engine_chats", "id", "Chat/projekt-metadata"),
    LogTable("versions", "engine_versions", "chat_id", "Versioner (lifecycle/release/verify)"),
    LogTable("prompts", "prompt_logs", "chat_id", "Prompt-events"),
    LogTable("generations", "engine_generation_logs", "chat_id", "Generering (model/tokens/tid)"),
    LogTable("telemetry", "generation_telemetry", "chat_id", "Telemetri per version"),
    LogTable("errors", "engine_version_error_logs", "chat_id", "Pipeline-fel + [BUGGFYND]"),
    LogTable("oc", "oc_debug_findings", "chat_id", "OpenClaw bug-hunt-fynd", True),
    LogTable("ragevents", "error_log_events", "chat_id", "RAG fault/fix-telemetri", True),
    LogTable("deploys", "deployments", "chat_id", "Vercel-deploy för sajten"),
    LogTable("llmusage", "llm_usage", "chat_id", "Tokenförbrukning per LLM-anrop", True),
)


class DbUnavailable(RuntimeError):
    """DB kunde inte nås eller drivrutinen saknas."""


def driver_available() -> bool:
    return pg is not None


def connect(target: PostgresTarget, *, verify_tls: bool = False, timeout_s: int = 20) -> Any:
    if pg is None:
        raise DbUnavailable(
            "Python-drivrutinen pg8000 saknas. Installera med "
            "`python -m pip install -r requirements.genlogs.txt`."
        )
    ssl_context: ssl.SSLContext | None = None
    if target.ssl_requested:
        ssl_context = ssl.create_default_context()
        if not verify_tls:
            # Supabase-poolern uppfattas som självsignerad i det här repot
            # (samma skäl som DB_SSL_REJECT_UNAUTHORIZED=false i
            # docs/runbooks/cursor-cloud-agent.md).
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE
    try:
        return pg.connect(
            user=target.user,
            password=target.password or None,
            host=target.host,
            port=target.port,
            database=target.database,
            ssl_context=ssl_context,
            timeout=timeout_s,
            application_name="sajtmaskin-genlogs",
        )
    except Exception as exc:  # noqa: BLE001 - drivrutinsfel varierar
        raise DbUnavailable(f"{type(exc).__name__}: {exc}") from exc


def query(conn: Any, sql: str, params: Iterable[Any] = ()) -> list[dict[str, Any]]:
    cursor = conn.cursor()
    try:
        cursor.execute(sql, tuple(params))
        if cursor.description is None:
            return []
        columns = [str(col[0]) for col in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]
    finally:
        cursor.close()


def existing_tables(conn: Any, tables: Iterable[str]) -> set[str]:
    names = [name for name in tables if _IDENT_RE.match(name)]
    if not names:
        return set()
    placeholders = ", ".join(["%s"] * len(names))
    rows = query(
        conn,
        "SELECT table_name FROM information_schema.tables "
        f"WHERE table_schema = 'public' AND table_name IN ({placeholders})",
        names,
    )
    return {str(row["table_name"]) for row in rows}


def table_columns(conn: Any, table: str) -> list[str]:
    rows = query(
        conn,
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_schema = 'public' AND table_name = %s ORDER BY ordinal_position",
        (table,),
    )
    return [str(row["column_name"]) for row in rows]


def select_columns(all_columns: list[str], *, include_heavy: bool = False) -> list[str]:
    if include_heavy:
        return list(all_columns)
    return [column for column in all_columns if column not in HEAVY_COLUMNS]


def fetch_log_rows(
    conn: Any,
    spec: LogTable,
    *,
    chat_id: str | None,
    limit: int,
    include_heavy: bool = False,
) -> tuple[list[dict[str, Any]], list[str]]:
    """Hämta senaste rader för en loggtabell. Returnerar `(rader, utelämnade kolumner)`."""
    columns = table_columns(conn, spec.table)
    if not columns:
        raise DbUnavailable(f"Tabellen {spec.table} saknar kolumner (finns den?)")
    selected = select_columns(columns, include_heavy=include_heavy)
    omitted = [column for column in columns if column not in selected]
    column_sql = ", ".join(f'"{column}"' for column in selected)
    order_sql = ' ORDER BY "created_at" DESC' if "created_at" in columns else ""

    if chat_id and spec.chat_column and spec.chat_column in columns:
        sql = (
            f"SELECT {column_sql} FROM public.\"{spec.table}\" "
            f'WHERE "{spec.chat_column}" = %s{order_sql} LIMIT %s'
        )
        rows = query(conn, sql, (chat_id, limit))
    else:
        sql = f'SELECT {column_sql} FROM public."{spec.table}"{order_sql} LIMIT %s'
        rows = query(conn, sql, (limit,))
    return rows, omitted


def latest_version(conn: Any, *, chat_id: str | None = None) -> dict[str, Any] | None:
    """Senast genererade sajten — samma sorteringsnyckel som `latest-site.mjs`."""
    where = 'WHERE v."chat_id" = %s ' if chat_id else ""
    params: tuple[Any, ...] = (chat_id,) if chat_id else ()
    rows = query(
        conn,
        'SELECT v."id" AS version_id, v."chat_id", v."version_number", v."release_state", '
        'v."verification_state", v."verification_summary", v."lifecycle_stage", v."edit_kind", '
        'v."preview_url", v."created_at", c."title", c."project_id", c."model", c."scaffold_id" '
        'FROM public."engine_versions" v '
        'LEFT JOIN public."engine_chats" c ON c."id" = v."chat_id" '
        f'{where}ORDER BY v."created_at" DESC LIMIT 1',
        params,
    )
    return rows[0] if rows else None


def chat_owner(conn: Any, chat_id: str) -> dict[str, Any]:
    """Vem äger sajten? `app_projects.user_id` är den durabla ägaren.

    `prompt_logs` kompletterar med gäst-`session_id` när ingen inloggad användare
    finns (landing-flödet skapar chatten innan registrering).
    """
    owner: dict[str, Any] = {"userId": None, "sessionIds": [], "projectId": None, "guest": None}
    project_rows = query(
        conn,
        'SELECT p."id" AS project_id, p."user_id" '
        'FROM public."engine_chats" c '
        'LEFT JOIN public."app_projects" p ON p."id" = c."project_id" '
        'WHERE c."id" = %s',
        (chat_id,),
    )
    if project_rows:
        owner["projectId"] = project_rows[0].get("project_id")
        owner["userId"] = project_rows[0].get("user_id")

    prompt_columns = set(table_columns(conn, "prompt_logs"))
    if {"user_id", "session_id"} & prompt_columns:
        rows = query(
            conn,
            'SELECT DISTINCT "user_id", "session_id" FROM public."prompt_logs" WHERE "chat_id" = %s',
            (chat_id,),
        )
        for row in rows:
            if not owner["userId"] and row.get("user_id"):
                owner["userId"] = row["user_id"]
            session_id = row.get("session_id")
            if session_id and session_id not in owner["sessionIds"]:
                owner["sessionIds"].append(session_id)
    owner["guest"] = owner["userId"] is None
    return owner


def user_token_rollup(
    conn: Any, user_id: str, *, days: int = 30, include_llm_usage: bool = False
) -> dict[str, Any]:
    """Tokenförbrukning för användarens alla sajter.

    Två källor, redovisade var för sig i stället för summerade — de överlappar för
    codegen efter att instrumenteringen (`llm_usage`) togs i drift, och en falsk
    totalsumma är värre än två ärliga:

    * `llm_usage` — per anrop och fas, med `user_id` direkt på raden.
    * `engine_generation_logs` — codegen per chat, når `users` via
      `engine_chats.project_id` → `app_projects.user_id`. Enda källan för tiden
      före instrumenteringen.
    """
    generation_rows = query(
        conn,
        'SELECT g."model", COUNT(*)::int AS calls, '
        'COALESCE(SUM(g."prompt_tokens"), 0)::bigint AS prompt_tokens, '
        'COALESCE(SUM(g."completion_tokens"), 0)::bigint AS completion_tokens '
        'FROM public."engine_generation_logs" g '
        'JOIN public."engine_chats" c ON c."id" = g."chat_id" '
        'JOIN public."app_projects" p ON p."id" = c."project_id" '
        'WHERE p."user_id" = %s AND g."created_at" > now() - (%s || \' days\')::interval '
        'GROUP BY g."model" ORDER BY prompt_tokens DESC',
        (user_id, str(days)),
    )
    out: dict[str, Any] = {
        "windowDays": days,
        # Behålls som `byModel` för bakåtkompatibilitet med tidigare körningsmappar.
        "byModel": generation_rows,
        "generationLogs": {"source": "engine_generation_logs", "byModel": generation_rows},
    }
    if include_llm_usage:
        out["llmUsage"] = {
            "source": "llm_usage",
            "byPhase": query(
                conn,
                'SELECT "phase", "model", COUNT(*)::int AS calls, '
                'COALESCE(SUM("input_tokens"), 0)::bigint AS input_tokens, '
                'COALESCE(SUM("cached_input_tokens"), 0)::bigint AS cached_input_tokens, '
                'COALESCE(SUM("output_tokens"), 0)::bigint AS output_tokens '
                'FROM public."llm_usage" '
                'WHERE "user_id" = %s AND "created_at" > now() - (%s || \' days\')::interval '
                'GROUP BY "phase", "model" ORDER BY input_tokens DESC',
                (user_id, str(days)),
            ),
            "note": (
                "Överlappar generationLogs för codegen efter att instrumenteringen "
                "togs i drift — summera inte de två."
            ),
        }
    return out


def db_identity(conn: Any) -> dict[str, Any]:
    rows = query(
        conn,
        "SELECT current_database() AS database, inet_server_addr()::text AS server_addr, "
        "version() AS version",
    )
    return rows[0] if rows else {}
