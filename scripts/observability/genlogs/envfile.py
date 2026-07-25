# -*- coding: utf-8 -*-
"""Env-upplösning för genlogg-insamlingen.

Speglar `scripts/db/env-merge.mjs`: värden ur den **valda env-filen vinner** över
redan satta `os.environ`-värden, så `--env=.env.vercel.production.pulled` faktiskt
pekar mot prod även när ett dev-`POSTGRES_URL` redan ligger i skalet.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlsplit

PROD_ENV_FILE = ".env.vercel.production.pulled"
DEV_ENV_FILE = ".env.local"

#: Samma prioritetsordning som `scripts/db/dump-logs.mjs` m.fl.
POSTGRES_URL_KEYS = (
    "POSTGRES_URL",
    "POSTGRES_URL_NON_POOLING",
    "STORAGE_POSTGRES_URL",
    "STORAGE_POSTGRES_URL_NON_POOLING",
    "DATABASE_URL",
)

_LINE_RE = re.compile(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$")


def parse_env_text(text: str) -> dict[str, str]:
    """Tolka `.env`-innehåll (samma dialekt som `vercel env pull` skriver)."""
    values: dict[str, str] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        match = _LINE_RE.match(raw_line)
        if not match:
            continue
        key, raw_value = match.group(1), match.group(2).strip()
        if raw_value.startswith('"') and raw_value.endswith('"') and len(raw_value) >= 2:
            value = raw_value[1:-1].replace("\\n", "\n").replace('\\"', '"')
        elif raw_value.startswith("'") and raw_value.endswith("'") and len(raw_value) >= 2:
            value = raw_value[1:-1]
        else:
            # Kommentar efter ocitat värde: `KEY=value # kommentar`
            value = raw_value.split(" #", 1)[0].strip()
        values[key] = value
    return values


def parse_env_file(path: Path) -> dict[str, str]:
    try:
        return parse_env_text(path.read_text(encoding="utf-8-sig"))
    except OSError:
        return {}


def default_env_file(repo_root: Path) -> str:
    """Alltid dev.

    Prod väljs bara med `--prod`/`--env`. Att tysta byta till prod-snapshotet
    bara för att filen råkar ligga kvar på disk skulle läsa produktionsdata utan
    att någon bett om det.
    """
    return DEV_ENV_FILE


def prod_snapshot_exists(repo_root: Path) -> bool:
    return (repo_root / PROD_ENV_FILE).is_file()


@dataclass
class EnvBundle:
    """Sammanslagen env: filens värden vinner över processens."""

    env_path: str
    file_values: dict[str, str] = field(default_factory=dict)
    file_exists: bool = False

    def get(self, key: str, fallback: str | None = None) -> str | None:
        value = self.file_values.get(key)
        if value is None or value == "":
            value = os.environ.get(key)
        if value is None or value == "":
            return fallback
        return value

    def secret_values(self) -> list[str]:
        """Alla värden som ska maskeras i skrivna filer."""
        out: list[str] = []
        for source in (self.file_values, os.environ):
            for key, value in source.items():
                if not value or len(value) < 8:
                    continue
                if _looks_secretish(key):
                    out.append(value)
        return out


def load_env(repo_root: Path, env_path: str) -> EnvBundle:
    path = (repo_root / env_path) if not Path(env_path).is_absolute() else Path(env_path)
    exists = path.is_file()
    return EnvBundle(
        env_path=env_path,
        file_values=parse_env_file(path) if exists else {},
        file_exists=exists,
    )


_SECRETISH_KEY_RE = re.compile(
    r"(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|SESSION|SALT|SEED|DSN|URL|URI|CONNECTION)",
    re.IGNORECASE,
)
_PUBLIC_KEY_PREFIXES = ("NEXT_PUBLIC_SAJTMASKIN_TIER2_", "NEXT_PUBLIC_APP_", "NEXT_PUBLIC_SITE_")


def _looks_secretish(key: str) -> bool:
    if key.startswith(_PUBLIC_KEY_PREFIXES):
        return False
    return bool(_SECRETISH_KEY_RE.search(key))


@dataclass
class PostgresTarget:
    """Anslutningsparametrar plus en sanerad beskrivning för rapporten."""

    host: str
    port: int
    database: str
    user: str
    password: str
    ssl_requested: bool
    source_key: str

    @property
    def label(self) -> str:
        return f"{self.host}:{self.port}/{self.database}"


def resolve_postgres_target(env: EnvBundle) -> tuple[PostgresTarget | None, str | None]:
    """Plocka första FUNGERANDE Postgres-URL och dela upp den.

    Går vidare i prioritetsordningen när en URL inte går att tolka i stället för
    att ge upp. En trasig `POSTGRES_URL` — t.ex. en oexpanderad `${...}`-platshållare,
    vilket `src/lib/db/env.ts` explicit varnar för — ska inte hindra en fullt
    användbar `DATABASE_URL` längre ner i kedjan.

    Returnerar `(target, error)` — aldrig båda satta. Felet listar alla nycklar som
    fanns men inte gick att tolka, så orsaken syns i rapporten.
    """
    parse_errors: list[str] = []
    for key in POSTGRES_URL_KEYS:
        raw = env.get(key)
        if not raw:
            continue
        try:
            return _split_postgres_url(raw, key), None
        except ValueError as exc:
            parse_errors.append(f"{key}: {exc}")
    if parse_errors:
        return None, "Ingen tolkbar Postgres-URL. " + " · ".join(parse_errors)
    return None, (
        "Ingen Postgres-URL hittad. Sätt någon av: " + ", ".join(POSTGRES_URL_KEYS)
    )


def _split_postgres_url(raw: str, source_key: str) -> PostgresTarget:
    parts = urlsplit(raw.strip())
    if parts.scheme not in {"postgres", "postgresql"}:
        raise ValueError(f"oväntat schema {parts.scheme!r}")
    if not parts.hostname:
        raise ValueError("saknar host")
    query = dict(parse_qsl(parts.query))
    sslmode = (query.get("sslmode") or "").lower()
    database = unquote(parts.path.lstrip("/")) or "postgres"
    return PostgresTarget(
        host=parts.hostname,
        port=parts.port or 5432,
        database=database,
        user=unquote(parts.username or "postgres"),
        password=unquote(parts.password or ""),
        # `disable`/`allow` = ingen TLS. Allt annat (inkl. utelämnat) => TLS,
        # vilket matchar hur Supabase-poolern nås i det här repot.
        ssl_requested=sslmode not in {"disable", "allow"},
        source_key=source_key,
    )
