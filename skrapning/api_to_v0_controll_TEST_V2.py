"""
project_cleaner_cli.py

En robustare “allt-i-ett”-CLI för att:
- Lista & radera v0-projekt (api.v0.dev)
- Lista & radera Vercel-projekt (api.vercel.com)  ✅ med pagination (hämtar ALLA)
- Lista & radera lokala projekt i SQLite (om du har en lokal DB)
- Rensa template-cache i SQLite (om tabellen finns)
- Rensa Redis-cache (valfritt; kräver redis-py)

Krav:
  pip install requests python-dotenv
Valfritt (Redis):
  pip install redis

Miljövariabler (exempel i .env.local):
  V0_API_KEY=...
  VERCEL_API_TOKEN=...   (eller VERCEL_TOKEN)
  VERCEL_TEAM_ID=...     (valfritt)
  VERCEL_TEAM_SLUG=...   (valfritt)

  REDIS_URL=redis://...
  (alternativt komponenter)
  REDIS_HOST=...
  REDIS_PORT=6379
  REDIS_USERNAME=default
  REDIS_PASSWORD=...

  SQLITE_DB_PATH=C:\path\to\sajtmaskin.db   (valfritt)
  BLOB_READ_WRITE_TOKEN=...                 (visas bara som status i detta script)
"""

from __future__ import annotations

import os
import re
import sys
import time
import sqlite3
from pathlib import Path
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import requests

try:
    from dotenv import load_dotenv
except Exception:
    load_dotenv = None


# ================================
#  ENV-LOADING (lite smartare)
# ================================

def _try_load_env() -> Optional[Path]:
    """
    Försöker hitta och ladda .env.local på några vanliga ställen.
    Returnerar Path om den hittas, annars None.
    """
    if load_dotenv is None:
        return None

    here = Path(__file__).resolve()

    candidates = [
        here.parent / ".env.local",
        here.parent / ".env",
        here.parent.parent / ".env.local",
        here.parent.parent / ".env",
        here.parent.parent / "app" / ".env.local",
        here.parent.parent / "app" / ".env",
    ]

    for p in candidates:
        if p.exists():
            load_dotenv(p)
            return p

    return None


ENV_LOADED_FROM = _try_load_env()


# ================================
#  KONFIG (från env)
# ================================

V0_API_KEY = os.environ.get("V0_API_KEY", "").strip()

VERCEL_API_TOKEN = (
    os.environ.get("VERCEL_API_TOKEN")
    or os.environ.get("VERCEL_TOKEN")
    or ""
).strip()

VERCEL_TEAM_ID = os.environ.get("VERCEL_TEAM_ID", "").strip()
VERCEL_TEAM_SLUG = os.environ.get("VERCEL_TEAM_SLUG", "").strip()

# Lokal DB (valfritt)
SQLITE_DB_PATH = os.environ.get("SQLITE_DB_PATH", "").strip()
if SQLITE_DB_PATH:
    SQLITE_DB_PATH = str(Path(SQLITE_DB_PATH).expanduser().resolve())
else:
    # fallback: försök hitta ungefär som du hade innan
    SQLITE_DB_PATH = str((Path(__file__).parent.parent / "app" / "data" / "sajtmaskin.db").resolve())

# Redis (valfritt)
REDIS_URL = os.environ.get("REDIS_URL", "").strip()
if not REDIS_URL:
    redis_host = os.environ.get("REDIS_HOST", "").strip()
    redis_port = os.environ.get("REDIS_PORT", "6379").strip()
    redis_password = os.environ.get("REDIS_PASSWORD", "").strip()
    redis_username = os.environ.get("REDIS_USERNAME", "default").strip()
    if redis_host and redis_password:
        REDIS_URL = f"redis://{redis_username}:{redis_password}@{redis_host}:{redis_port}"

BLOB_TOKEN = os.environ.get("BLOB_READ_WRITE_TOKEN", "").strip()

V0_API_BASE = "https://api.v0.dev/v1"
VERCEL_API_BASE = "https://api.vercel.com"


# ================================
#  GENERELLA HJÄLPSFUNKTIONER
# ================================

def _fmt_bool(ok: bool, yes: str = "✅", no: str = "❌") -> str:
    return yes if ok else no


def _safe_input(prompt: str) -> str:
    try:
        return input(prompt)
    except KeyboardInterrupt:
        print("\nAvbrutet (Ctrl+C).")
        return ""


def _confirm_phrase(phrase: str) -> bool:
    typed = _safe_input(f"Skriv exakt: {phrase}\n> ").strip()
    return typed == phrase


def _confirm_yes() -> bool:
    return _safe_input("Skriv 'ja' för att bekräfta: ").strip().lower() == "ja"


def _slugify(name: str) -> str:
    s = (name or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "project"


def _rate_limit_sleep():
    time.sleep(0.15)


# ================================
#  v0 API
# ================================

def v0_headers(json_request: bool = True) -> Dict[str, str]:
    headers: Dict[str, str] = {"Authorization": f"Bearer {V0_API_KEY}"}
    if json_request:
        headers["Content-Type"] = "application/json"
    return headers


def v0_fetch_projects() -> Tuple[List[Dict[str, Any]], bool]:
    """
    Hämtar v0-projekt.
    Din tidigare endpoint (som du redan verkar använda) är stabil:
      GET https://api.v0.dev/v1/projects
    """
    if not V0_API_KEY:
        print("⚠️ V0_API_KEY saknas.")
        return [], False

    url = f"{V0_API_BASE}/projects"
    try:
        resp = requests.get(url, headers=v0_headers(True), timeout=30)
    except requests.RequestException as e:
        print(f"❌ Nätverksfel vid hämtning av v0-projekt: {e}")
        return [], False

    if resp.status_code != 200:
        print(f"❌ Misslyckades hämta v0-projekt: {resp.status_code}")
        print(resp.text)
        return [], False

    data = resp.json() or {}
    projects = data.get("data", [])  # samma som du hade
    if not isinstance(projects, list):
        projects = []

    return projects, True


def v0_print_projects(projects: List[Dict[str, Any]]) -> None:
    print("\n📁 Dina v0-projekt:\n")
    if not projects:
        print("  (Inga v0-projekt hittades)")
        return

    for i, p in enumerate(projects, start=1):
        print(f"{i}.")
        print(f"   id:       {p.get('id')}")
        print(f"   name:     {p.get('name')}")
        print(f"   privacy:  {p.get('privacy')}")
        print(f"   created:  {p.get('createdAt')}")
        print()


def v0_resolve_project_id(projects: List[Dict[str, Any]], ok: bool, value: str) -> Optional[str]:
    value = (value or "").strip()
    if not value:
        return None

    if value.isdigit() and ok and projects:
        idx = int(value)
        if 1 <= idx <= len(projects):
            return projects[idx - 1].get("id")
        return None

    if ok and projects:
        for p in projects:
            if p.get("id") == value:
                return value
        return None

    # Om vi inte har lista men användaren klistrar in ett id
    return value


def v0_delete_project(project_id: str) -> bool:
    url = f"{V0_API_BASE}/projects/{project_id}"
    try:
        resp = requests.delete(url, headers=v0_headers(True), timeout=30)
    except requests.RequestException as e:
        print(f"❌ Nätverksfel vid radering av v0-projekt {project_id}: {e}")
        return False

    if resp.status_code in (200, 204):
        if resp.status_code == 204:
            print(f"✅ v0-projekt {project_id} raderat.")
            return True

        # 200 med JSON
        try:
            data = resp.json() or {}
            deleted = str(data.get("deleted", "")).lower() == "true"
        except Exception:
            deleted = False

        if deleted:
            print(f"✅ v0-projekt {project_id} raderat.")
            return True

        print(f"⚠️ Fick svar men kunde inte bekräfta 'deleted': {resp.text}")
        return False

    print(f"⚠️ Misslyckades radera v0-projekt {project_id}: {resp.status_code}")
    print(resp.text)
    return False


def v0_get_project(project_id: str) -> Dict[str, Any]:
    url = f"{V0_API_BASE}/projects/{project_id}"
    resp = requests.get(url, headers=v0_headers(True), timeout=30)
    if resp.status_code != 200:
        raise RuntimeError(f"v0_get_project failed: {resp.status_code} {resp.text}")
    return resp.json()


def v0_choose_chat_and_version(project: Dict[str, Any]) -> Optional[Tuple[str, str]]:
    chats = project.get("chats") or []
    if not chats:
        print("❌ Projektet har inga chats.")
        return None

    def pick(predicate):
        for ch in chats:
            latest = ch.get("latestVersion")
            if latest and predicate(latest):
                return ch
        return None

    chosen = pick(lambda v: v.get("status") == "completed")
    if chosen is None:
        chosen = pick(lambda v: True)
    if chosen is None:
        return None

    chat_id = chosen["id"]
    version_id = chosen["latestVersion"]["id"]
    return chat_id, version_id


def v0_download_project_zip(project_id: str, out_dir: str = "exports") -> Optional[str]:
    try:
        project = v0_get_project(project_id)
    except Exception as e:
        print(f"❌ Kunde inte hämta projektinfo: {e}")
        return None

    name = project.get("name", "project")
    pair = v0_choose_chat_and_version(project)
    if pair is None:
        return None

    chat_id, version_id = pair
    url = f"{V0_API_BASE}/chats/{chat_id}/versions/{version_id}/download"
    params = {"format": "zip", "includeDefaultFiles": "true"}

    resp = requests.get(
        url,
        headers=v0_headers(json_request=False),  # zip = binärt
        params=params,
        timeout=60,
    )
    if resp.status_code != 200:
        print(f"❌ Misslyckades ladda ned zip: {resp.status_code} {resp.text}")
        return None

    os.makedirs(out_dir, exist_ok=True)
    filename = f"{_slugify(name)}-{project_id}.zip"
    full_path = str(Path(out_dir) / filename)

    with open(full_path, "wb") as f:
        f.write(resp.content)

    print(f"✅ ZIP nedladdad: {full_path}")
    return full_path


def v0_bulk_delete_by_name(projects: List[Dict[str, Any]], ok: bool, pattern: str) -> None:
    if not ok or not projects:
        print("❌ Kan inte bulk-radera v0 per namn (ingen fungerande lista).")
        return

    pat = pattern.lower().strip()
    if not pat:
        print("❌ Tomt mönster.")
        return

    matches = [p for p in projects if pat in (p.get("name") or "").lower()]
    if not matches:
        print(f"Inga v0-projekt matchade '{pattern}'.")
        return

    print("\nFöljande v0-projekt kommer raderas:")
    for p in matches:
        print(f"  - {p.get('id')} | {p.get('name')}")

    if not _confirm_yes():
        print("❌ Avbrutet.")
        return

    for p in matches:
        pid = p.get("id")
        if pid:
            v0_delete_project(pid)
            _rate_limit_sleep()


def v0_delete_all(projects: List[Dict[str, Any]], ok: bool) -> None:
    if not ok or not projects:
        print("❌ Kan inte radera alla v0-projekt (ingen fungerande lista).")
        return

    print("\n⚠️  ALLA v0-projekt kommer raderas:")
    for p in projects:
        print(f"  - {p.get('id')} | {p.get('name')}")

    print("\nDetta går INTE att ångra.")
    if not _confirm_phrase("JAG ÄR HELT SÄKER"):
        print("❌ Avbrutet.")
        return

    for p in projects:
        pid = p.get("id")
        if pid:
            v0_delete_project(pid)
            _rate_limit_sleep()


# ================================
#  Vercel API (✅ pagination)
# ================================

def vercel_headers() -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {VERCEL_API_TOKEN}",
        "Content-Type": "application/json",
    }


def _vercel_scope_params() -> Dict[str, str]:
    """
    Om du kör i team-scope kan du behöva skicka teamId eller slug vid list/delete.
    """
    params: Dict[str, str] = {}
    if VERCEL_TEAM_ID:
        params["teamId"] = VERCEL_TEAM_ID
    elif VERCEL_TEAM_SLUG:
        params["slug"] = VERCEL_TEAM_SLUG
    return params


def vercel_fetch_projects_all() -> Tuple[List[Dict[str, Any]], bool]:
    """
    Hämtar ALLA Vercel-projekt via:
      GET /v10/projects?limit=100&from=...
    och använder pagination.next som continuation token.
    """
    if not VERCEL_API_TOKEN:
        print("⚠️ VERCEL_API_TOKEN saknas.")
        return [], False

    url = f"{VERCEL_API_BASE}/v10/projects"
    all_projects: List[Dict[str, Any]] = []
    next_from: Optional[str] = None

    while True:
        params: Dict[str, Any] = {"limit": 100}
        params.update(_vercel_scope_params())
        if next_from:
            params["from"] = next_from

        try:
            resp = requests.get(url, headers=vercel_headers(), params=params, timeout=30)
        except requests.RequestException as e:
            print(f"❌ Nätverksfel vid hämtning av Vercel-projekt: {e}")
            return [], False

        if resp.status_code != 200:
            print(f"❌ Misslyckades hämta Vercel-projekt: {resp.status_code}")
            print(resp.text)
            return [], False

        data = resp.json() or {}
        batch = data.get("projects", [])
        if isinstance(batch, list):
            all_projects.extend(batch)

        pagination = data.get("pagination") or {}
        next_from = pagination.get("next")
        if not next_from:
            break

        _rate_limit_sleep()

    return all_projects, True


def vercel_print_projects(projects: List[Dict[str, Any]]) -> None:
    print("\n🔷 Dina Vercel-projekt:\n")
    if not projects:
        print("  (Inga Vercel-projekt hittades)")
        return

    # sortera nyast först (createdAt är ms)
    projects_sorted = sorted(projects, key=lambda p: p.get("createdAt", 0), reverse=True)

    for i, p in enumerate(projects_sorted, start=1):
        created_ms = p.get("createdAt", 0) or 0
        created_str = "?"
        if created_ms:
            created_str = datetime.fromtimestamp(created_ms / 1000).strftime("%Y-%m-%d %H:%M")

        print(f"{i}.")
        print(f"   id:        {p.get('id')}")
        print(f"   name:      {p.get('name')}")
        print(f"   created:   {created_str}")
        print(f"   framework: {p.get('framework') or '?'}")
        print()


def vercel_delete_project(project_id_or_name: str) -> bool:
    """
    Raderar ett Vercel-projekt:
      DELETE /v9/projects/{idOrName}
    och skickar teamId/slug om angivet.
    """
    if not VERCEL_API_TOKEN:
        print("❌ VERCEL_API_TOKEN saknas.")
        return False

    url = f"{VERCEL_API_BASE}/v9/projects/{project_id_or_name}"
    params = _vercel_scope_params()

    try:
        resp = requests.delete(url, headers=vercel_headers(), params=params, timeout=30)
    except requests.RequestException as e:
        print(f"❌ Nätverksfel vid radering av Vercel-projekt {project_id_or_name}: {e}")
        return False

    if resp.status_code in (200, 204):
        print(f"✅ Vercel-projekt {project_id_or_name} raderat.")
        return True

    print(f"⚠️ Misslyckades radera Vercel-projekt {project_id_or_name}: {resp.status_code}")
    print(resp.text)
    return False


def _vercel_sorted(projects: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(projects, key=lambda p: p.get("createdAt", 0), reverse=True)


def vercel_resolve_project_id(projects: List[Dict[str, Any]], value: str) -> Optional[str]:
    """
    Tillåter:
      - index (baserat på sorterad lista, nyast först)
      - id
      - name
    """
    value = (value or "").strip()
    if not value:
        return None

    projects_sorted = _vercel_sorted(projects)

    if value.isdigit():
        idx = int(value)
        if 1 <= idx <= len(projects_sorted):
            return projects_sorted[idx - 1].get("id")
        return None

    # match id
    for p in projects_sorted:
        if p.get("id") == value:
            return value

    # match name
    for p in projects_sorted:
        if p.get("name") == value:
            return value  # Vercel endpoint tar idOrName

    # annars antar vi att användaren klistrat in ett idOrName ändå
    return value


def vercel_bulk_delete_by_name(projects: List[Dict[str, Any]], pattern: str) -> None:
    if not projects:
        print("❌ Ingen Vercel-projektlista tillgänglig.")
        return

    pat = pattern.lower().strip()
    if not pat:
        print("❌ Tomt mönster.")
        return

    matches = [p for p in projects if pat in (p.get("name") or "").lower()]
    if not matches:
        print(f"Inga Vercel-projekt matchade '{pattern}'.")
        return

    print("\n🔷 Följande Vercel-projekt kommer raderas:")
    for p in _vercel_sorted(matches):
        print(f"  - {p.get('id')} | {p.get('name')}")

    if not _confirm_yes():
        print("❌ Avbrutet.")
        return

    for p in _vercel_sorted(matches):
        pid = p.get("id") or p.get("name")
        if pid:
            vercel_delete_project(pid)
            _rate_limit_sleep()


def vercel_delete_all(projects: List[Dict[str, Any]]) -> None:
    if not projects:
        print("❌ Ingen Vercel-projektlista tillgänglig.")
        return

    print("\n⚠️  ALLA Vercel-projekt kommer raderas:")
    for p in _vercel_sorted(projects):
        print(f"  - {p.get('id')} | {p.get('name')}")

    print("\nDetta går INTE att ångra.")
    if not _confirm_phrase("RADERA ALLA VERCEL"):
        print("❌ Avbrutet.")
        return

    for p in _vercel_sorted(projects):
        pid = p.get("id") or p.get("name")
        if pid:
            vercel_delete_project(pid)
            _rate_limit_sleep()


# ================================
#  SQLite (lokal DB)
# ================================

def sqlite_path() -> Path:
    return Path(SQLITE_DB_PATH).expanduser().resolve()


def sqlite_connect() -> Optional[sqlite3.Connection]:
    p = sqlite_path()
    if not p.exists():
        return None

    try:
        conn = sqlite3.connect(str(p))
        conn.row_factory = sqlite3.Row
        return conn
    except Exception:
        return None


def local_list_projects() -> List[Dict[str, Any]]:
    conn = sqlite_connect()
    if not conn:
        return []

    try:
        cur = conn.execute("SELECT id, name, category, created_at FROM projects ORDER BY created_at DESC")
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return rows
    except Exception:
        conn.close()
        return []


def local_print_projects(projects: List[Dict[str, Any]]) -> None:
    print("\n💾 Lokala projekt (SQLite):\n")
    if not projects:
        print("  (Inga lokala projekt hittades)")
        return

    for i, p in enumerate(projects, start=1):
        print(f"{i}.")
        print(f"   id:       {p.get('id')}")
        print(f"   name:     {p.get('name')}")
        print(f"   category: {p.get('category', '?')}")
        print(f"   created:  {p.get('created_at', '?')}")
        print()


def local_delete_project(project_id: str) -> bool:
    conn = sqlite_connect()
    if not conn:
        print("⚠️ SQLite DB hittades inte/kan inte öppnas.")
        return False

    try:
        cursor = conn.cursor()
        tables_to_clean = [
            ("project_files", "project_id"),
            ("project_data", "project_id"),
            ("vercel_deployments", "project_id"),
            ("images", "project_id"),
            ("media_library", "project_id"),
            ("company_profiles", "project_id"),
            ("projects", "id"),
        ]

        for table, col in tables_to_clean:
            try:
                cursor.execute(f"DELETE FROM {table} WHERE {col} = ?", (project_id,))
            except sqlite3.OperationalError:
                pass

        conn.commit()
        conn.close()
        print(f"✅ Lokalt projekt {project_id} raderat.")
        return True
    except Exception as e:
        conn.close()
        print(f"❌ Fel vid radering lokalt: {e}")
        return False


def local_delete_all() -> None:
    projects = local_list_projects()
    if not projects:
        print("❌ Inga lokala projekt att radera.")
        return

    print("\n⚠️  ALLA lokala projekt kommer raderas:")
    for p in projects:
        print(f"  - {p.get('id')} | {p.get('name')}")

    if not _confirm_phrase("RADERA LOKAL DATA"):
        print("❌ Avbrutet.")
        return

    for p in projects:
        pid = p.get("id")
        if pid:
            local_delete_project(pid)


def local_clear_template_cache() -> None:
    conn = sqlite_connect()
    if not conn:
        print("⚠️ SQLite DB hittades inte/kan inte öppnas.")
        return

    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM template_cache")
        deleted = cur.rowcount
        conn.commit()
        conn.close()
        print(f"✅ Rensade {deleted} poster från template_cache.")
    except sqlite3.OperationalError:
        conn.close()
        print("⚠️ Tabellen template_cache finns inte (hoppar över).")
    except Exception as e:
        conn.close()
        print(f"❌ Fel vid rensning av template_cache: {e}")


def local_print_stats() -> None:
    conn = sqlite_connect()
    if not conn:
        print("\n💾 Lokal databas-statistik:\n   (SQLite DB hittades inte)")
        return

    tables = [
        "projects",
        "project_data",
        "project_files",
        "vercel_deployments",
        "template_cache",
        "media_library",
    ]

    stats: Dict[str, int] = {}
    for t in tables:
        try:
            cur = conn.execute(f"SELECT COUNT(*) FROM {t}")
            stats[t] = int(cur.fetchone()[0])
        except sqlite3.OperationalError:
            stats[t] = 0

    conn.close()

    print("\n💾 Lokal databas-statistik:")
    print(f"   Projekt:           {stats.get('projects', 0)}")
    print(f"   Projekt-data:      {stats.get('project_data', 0)}")
    print(f"   Projekt-filer:     {stats.get('project_files', 0)}")
    print(f"   Vercel-deploys:    {stats.get('vercel_deployments', 0)}")
    print(f"   Template-cache:    {stats.get('template_cache', 0)}")
    print(f"   Media-library:     {stats.get('media_library', 0)}")


# ================================
#  Redis
# ================================

def redis_clear_cache() -> None:
    if not REDIS_URL:
        print("⚠️ REDIS_URL saknas. Hoppar över Redis.")
        return

    try:
        import redis  # type: ignore
    except ImportError:
        print("⚠️ redis-py saknas. Kör: pip install redis")
        return

    try:
        r = redis.from_url(REDIS_URL)
        patterns = ["project:*", "preview:*", "cache:*"]
        deleted = 0
        for pat in patterns:
            keys = r.keys(pat)
            if keys:
                deleted += r.delete(*keys)
        print(f"✅ Rensade {deleted} Redis-nycklar (mönster: {', '.join(patterns)}).")
        print(f"   (dbsize nu: {r.dbsize()})")
    except Exception as e:
        print(f"❌ Fel vid Redis-rensning: {e}")


# ================================
#  MEGA: RADERA ALLT
# ================================

def mega_cleanup(
    v0_projects: List[Dict[str, Any]],
    v0_ok: bool,
    vercel_projects: List[Dict[str, Any]],
    vercel_ok: bool,
    include_local: bool = True,
    include_redis: bool = True,
) -> None:
    local_projects = local_list_projects() if include_local else []

    print("\n" + "=" * 60)
    print("🔥 MEGA-CLEANUP (RADERA ALLT)")
    print("=" * 60)

    if v0_ok:
        print(f"\n📁 v0-projekt: {len(v0_projects)}")
    else:
        print("\n📁 v0-projekt: (kunde inte hämtas)")

    if vercel_ok:
        print(f"🔷 Vercel-projekt: {len(vercel_projects)}")
    else:
        print("🔷 Vercel-projekt: (kunde inte hämtas)")

    if include_local:
        print(f"💾 Lokala projekt: {len(local_projects)}")
        print(f"💾 SQLite DB: {sqlite_path()}")
    if include_redis:
        print(f"🔴 Redis: {'kommer rensas' if bool(REDIS_URL) else 'ingen REDIS_URL'}")

    print("\n⚠️  Detta är PERMANENT och går INTE att ångra.")
    if not _confirm_phrase("JAG VILL RENSA ALLT"):
        print("❌ Avbrutet.")
        return

    # v0
    if v0_ok and v0_projects:
        print("\n📁 Raderar v0-projekt...")
        for p in v0_projects:
            pid = p.get("id")
            if pid:
                v0_delete_project(pid)
                _rate_limit_sleep()

    # Vercel
    if vercel_ok and vercel_projects:
        print("\n🔷 Raderar Vercel-projekt...")
        for p in _vercel_sorted(vercel_projects):
            pid = p.get("id") or p.get("name")
            if pid:
                vercel_delete_project(pid)
                _rate_limit_sleep()

    # Lokal DB
    if include_local and local_projects:
        print("\n💾 Raderar lokala projekt...")
        for p in local_projects:
            pid = p.get("id")
            if pid:
                local_delete_project(pid)

        print("\n💾 Rensar template-cache...")
        local_clear_template_cache()

    # Redis
    if include_redis:
        print("\n🔴 Rensar Redis-cache...")
        redis_clear_cache()

    print("\n✅ MEGA-CLEANUP klar!")


# ================================
#  MAIN / MENY
# ================================

def print_status() -> None:
    print("🔑 v0 + Vercel + Lokal DB Projekt-CLI (förbättrad)")
    print("=================================================\n")

    if ENV_LOADED_FROM:
        print(f"✅ Laddade miljövariabler från: {ENV_LOADED_FROM}")
    else:
        print("⚠️ Hittade ingen .env.local (kör system-env).")

    print("\n📋 API-nyckel status:")
    print(f"   V0_API_KEY:       {_fmt_bool(bool(V0_API_KEY), '✅ Laddad', '❌ Saknas')}")
    print(f"   VERCEL_API_TOKEN: {_fmt_bool(bool(VERCEL_API_TOKEN), '✅ Laddad', '❌ Saknas')}")
    print(f"   VERCEL_TEAM_ID:   {'✅ Satt' if bool(VERCEL_TEAM_ID) else '⚠️ Ej satt'}")
    print(f"   VERCEL_TEAM_SLUG: {'✅ Satt' if bool(VERCEL_TEAM_SLUG) else '⚠️ Ej satt'}")
    print(f"   REDIS_URL:        {'✅ Konfigurerad' if bool(REDIS_URL) else '⚠️ Ej konfigurerad'}")
    print(f"   BLOB_TOKEN:       {'✅ Laddad' if bool(BLOB_TOKEN) else '⚠️ Ej konfigurerad'}")

    p = sqlite_path()
    print(f"   SQLite DB:        {'✅ Finns' if p.exists() else '❌ Finns ej'}")
    print()


def main() -> None:
    print_status()

    # initial fetch
    v0_projects, v0_ok = v0_fetch_projects()
    vercel_projects, vercel_ok = vercel_fetch_projects_all()
    local_projects = local_list_projects()

    v0_print_projects(v0_projects)
    vercel_print_projects(vercel_projects)
    local_print_projects(local_projects)
    local_print_stats()

    while True:
        print("\n" + "=" * 50)
        print("HUVUDMENY")
        print("=" * 50)

        print("\n📁 v0-projekt (v0.dev):")
        print("  [d]   Radera ett v0-projekt")
        print("  [b]   Bulk-radera v0 (namn matchar)")
        print("  [a]   Radera ALLA v0-projekt")
        print("  [z]   Ladda hem v0-projekt som ZIP")

        print("\n🔷 Vercel-projekt:")
        print("  [vd]  Radera ett Vercel-projekt")
        print("  [vb]  Bulk-radera Vercel (namn matchar)")
        print("  [vp]  Bulk-radera Vercel som börjar med 'v0-' (snabbkommando)")
        print("  [va]  Radera ALLA Vercel-projekt")

        print("\n💾 Lokal databas (SQLite):")
        print("  [ld]  Radera ett lokalt projekt")
        print("  [la]  Radera ALLA lokala projekt")
        print("  [ls]  Visa lokal statistik")
        print("  [lc]  Rensa template-cache")

        print("\n🔴 Redis:")
        print("  [rc]  Rensa Redis-cache")

        print("\n🔥 MEGA:")
        print("  [x]   RADERA ALLT (v0 + Vercel + SQLite + Redis)")

        print("\n⚙️ Övrigt:")
        print("  [r]   Ladda om alla listor")
        print("  [q]   Avsluta")

        choice = _safe_input("\n> ").strip().lower()
        if not choice:
            continue

        if choice == "q":
            print("Hejdå 👋")
            return

        if choice == "r":
            print("\n⏳ Laddar om listor...")
            v0_projects, v0_ok = v0_fetch_projects()
            vercel_projects, vercel_ok = vercel_fetch_projects_all()
            local_projects = local_list_projects()

            v0_print_projects(v0_projects)
            vercel_print_projects(vercel_projects)
            local_print_projects(local_projects)
            local_print_stats()
            continue

        # ---- v0 ----
        if choice == "d":
            target = _safe_input("Index eller v0 projectId att radera: ").strip()
            pid = v0_resolve_project_id(v0_projects, v0_ok, target)
            if not pid:
                print("❌ Ogiltigt index/id.")
                continue

            if _safe_input(f"Radera v0-projekt {pid}? (ja/nej): ").strip().lower() != "ja":
                print("Avbrutet.")
                continue

            v0_delete_project(pid)
            continue

        if choice == "b":
            pattern = _safe_input("Text som ska finnas i v0-projektnamnet: ").strip()
            v0_bulk_delete_by_name(v0_projects, v0_ok, pattern)
            continue

        if choice == "a":
            v0_delete_all(v0_projects, v0_ok)
            continue

        if choice == "z":
            target = _safe_input("Index eller v0 projectId att ladda hem som ZIP: ").strip()
            pid = v0_resolve_project_id(v0_projects, v0_ok, target)
            if not pid:
                print("❌ Ogiltigt index/id.")
                continue

            out_dir = _safe_input("Mapp för ZIP (Enter = ./exports): ").strip() or "exports"
            v0_download_project_zip(pid, out_dir=out_dir)
            continue

        # ---- Vercel ----
        if choice == "vd":
            if not vercel_ok:
                print("❌ Kunde inte hämta Vercel-listan.")
                continue

            vercel_print_projects(vercel_projects)
            target = _safe_input("Index, projectId eller projektnamn att radera: ").strip()
            pid = vercel_resolve_project_id(vercel_projects, target)
            if not pid:
                print("❌ Ogiltigt val.")
                continue

            if _safe_input(f"Radera Vercel-projekt {pid}? (ja/nej): ").strip().lower() != "ja":
                print("Avbrutet.")
                continue

            vercel_delete_project(pid)
            continue

        if choice == "vb":
            if not vercel_ok:
                print("❌ Kunde inte hämta Vercel-listan.")
                continue
            pattern = _safe_input("Text som ska finnas i Vercel-projektnamnet: ").strip()
            vercel_bulk_delete_by_name(vercel_projects, pattern)
            continue

        if choice == "vp":
            if not vercel_ok:
                print("❌ Kunde inte hämta Vercel-listan.")
                continue
            vercel_bulk_delete_by_name(vercel_projects, "v0-")
            continue

        if choice == "va":
            if not vercel_ok:
                print("❌ Kunde inte hämta Vercel-listan.")
                continue
            vercel_delete_all(vercel_projects)
            continue

        # ---- Lokal DB ----
        if choice == "ld":
            local_projects = local_list_projects()
            if not local_projects:
                print("❌ Inga lokala projekt hittades.")
                continue

            local_print_projects(local_projects)
            target = _safe_input("Index eller projectId att radera: ").strip()

            proj_id: Optional[str] = None
            if target.isdigit():
                idx = int(target)
                if 1 <= idx <= len(local_projects):
                    proj_id = local_projects[idx - 1].get("id")
            else:
                proj_id = target

            if not proj_id:
                print("❌ Ogiltigt val.")
                continue

            if _safe_input(f"Radera lokalt projekt {proj_id}? (ja/nej): ").strip().lower() != "ja":
                print("Avbrutet.")
                continue

            local_delete_project(proj_id)
            continue

        if choice == "la":
            local_delete_all()
            continue

        if choice == "ls":
            local_print_stats()
            continue

        if choice == "lc":
            if _safe_input("Rensa template-cache? (ja/nej): ").strip().lower() == "ja":
                local_clear_template_cache()
            continue

        # ---- Redis ----
        if choice == "rc":
            if _safe_input("Rensa Redis-cache? (ja/nej): ").strip().lower() == "ja":
                redis_clear_cache()
            continue

        # ---- MEGA ----
        if choice == "x":
            mega_cleanup(v0_projects, v0_ok, vercel_projects, vercel_ok, include_local=True, include_redis=True)
            continue

        print("❌ Okänt val.")


if __name__ == "__main__":
    main()
