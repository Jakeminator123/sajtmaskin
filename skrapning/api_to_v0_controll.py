import requests
import os
import re
import sqlite3
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from dotenv import load_dotenv

# ================================
#  LADDA .env.local
# ================================

# Hitta .env.local i app-mappen
ENV_PATH = Path(__file__).parent.parent / "app" / ".env.local"
if ENV_PATH.exists():
    load_dotenv(ENV_PATH)
    print(f"✅ Laddade miljövariabler från {ENV_PATH}")
else:
    print(f"⚠️ Hittade inte {ENV_PATH}, använder system-env")

# ================================
#  KONFIG (från .env.local)
# ================================

# V0 API-nyckel
V0_API_KEY = os.environ.get("V0_API_KEY", "")

# Vercel API-nyckel
VERCEL_API_TOKEN = os.environ.get("VERCEL_API_TOKEN") or os.environ.get(
    "VERCEL_TOKEN", ""
)

# Lokal databas-sökväg
SQLITE_DB_PATH = Path(__file__).parent.parent / "app" / "data" / "sajtmaskin.db"

# Redis-konfiguration (bygg URL från komponenter om REDIS_URL inte finns)
REDIS_URL = os.environ.get("REDIS_URL", "")
if not REDIS_URL:
    redis_host = os.environ.get("REDIS_HOST", "")
    redis_port = os.environ.get("REDIS_PORT", "6379")
    redis_password = os.environ.get("REDIS_PASSWORD", "")
    redis_username = os.environ.get("REDIS_USERNAME", "default")
    if redis_host and redis_password:
        REDIS_URL = (
            f"redis://{redis_username}:{redis_password}@{redis_host}:{redis_port}"
        )

# Blob storage token (för framtida användning)
BLOB_TOKEN = os.environ.get("BLOB_READ_WRITE_TOKEN", "")

BASE_URL = "https://api.v0.dev/v1"
VERCEL_API_BASE = "https://api.vercel.com"


# ================================
#  HJÄLPSFUNKTIONER
# ================================


def get_headers(json_request: bool = True) -> Dict[str, str]:
    """
    Standardheaders för alla anrop mot v0 Platform API.
    Vi kör Content-Type: application/json för alla "vanliga" requests,
    men INTE när vi hämtar binär data (zip).
    """
    headers: Dict[str, str] = {
        "Authorization": f"Bearer {V0_API_KEY}",
    }
    if json_request:
        headers["Content-Type"] = "application/json"
    return headers


def fetch_projects() -> Tuple[List[Dict[str, Any]], bool]:
    """
    Försöker hämta alla projekt i din workspace.
    GET /v1/projects

    Returnerar (projects, ok)
      - projects: list[dict] med projekt (ev. tom lista)
      - ok: True om API:t svarade 200, annars False

    Om API:t t.ex. 500: vi loggar felet och returnerar ([], False)
    """
    url = f"{BASE_URL}/projects"
    try:
        resp = requests.get(url, headers=get_headers(json_request=True), timeout=30)
    except requests.RequestException as e:
        print("❌ Nätverksfel när vi försökte hämta projekt från v0:")
        print(e)
        return [], False

    if resp.status_code != 200:
        print("❌ Misslyckades hämta projekt från v0.")
        print(f"Statuskod: {resp.status_code}")
        print("Rått svar från API:t:")
        print(resp.text)
        return [], False

    data = resp.json()
    return data.get("data", []), True


def print_projects(projects: List[Dict[str, Any]]) -> None:
    print("Dina v0-projekt:\n")
    if not projects:
        print("  (Inga projekt hittades, eller så gick det inte att hämta listan.)")
        return

    for i, proj in enumerate(projects, start=1):
        print(f"{i}.")
        print(f"   id:       {proj.get('id')}")
        print(f"   name:     {proj.get('name')}")
        print(f"   privacy:  {proj.get('privacy')}")
        print(f"   created:  {proj.get('createdAt')}")
        print()


def resolve_project_id(
    projects: List[Dict[str, Any]],
    projects_ok: bool,
    value: str,
) -> Optional[str]:
    """
    Försök tolka value som:
      - index (1,2,3...) om vi har en projektlista
      - id som finns i listan
      - annars: om vi INTE har projektlista (projects_ok=False),
        tolka det bara som ett "rått" projectId.
    """
    value = value.strip()

    # Om vi har en lista och value ser ut som siffra => index
    if value.isdigit() and projects_ok and projects:
        idx = int(value)
        if 1 <= idx <= len(projects):
            return projects[idx - 1].get("id")
        else:
            return None

    # Om vi har en lista: kolla om value är ett id i listan
    if projects_ok and projects:
        for proj in projects:
            if proj.get("id") == value:
                return value
        return None

    # Om vi INTE har en fungerande projektlista (t.ex. pga 500),
    # men användaren anger något => ta det som ett rått projectId
    if not projects_ok and value:
        return value

    return None


def delete_project(project_id: str) -> bool:
    """
    Raderar ett projekt permanent.
    DELETE /v1/projects/{projectId}
    """
    url = f"{BASE_URL}/projects/{project_id}"
    try:
        resp = requests.delete(url, headers=get_headers(json_request=True), timeout=30)
    except requests.RequestException as e:
        print(f"❌ Nätverksfel vid radering av {project_id}: {e}")
        return False

    if resp.status_code == 200:
        try:
            data = resp.json()
            deleted = str(data.get("deleted", "")).lower() == "true"
        except Exception:
            deleted = False

        if deleted:
            print(f"✅ Projekt {project_id} raderat.")
            return True
        else:
            print(f"⚠️ Fick svar men 'deleted' var inte true: {resp.text}")
            return False
    else:
        print(f"⚠️ Misslyckades radera {project_id}: {resp.status_code} {resp.text}")
        return False


def get_project_by_id(project_id: str) -> Dict[str, Any]:
    """
    Hämtar full projektinfo inkl. dess chats och latestVersion.
    GET /v1/projects/{projectId}
    """
    url = f"{BASE_URL}/projects/{project_id}"
    resp = requests.get(url, headers=get_headers(json_request=True), timeout=30)

    if resp.status_code != 200:
        print(f"❌ Misslyckades hämta projekt {project_id}")
        print(f"Statuskod: {resp.status_code}")
        print("Rått svar:")
        print(resp.text)
        raise RuntimeError(f"API error {resp.status_code}")

    return resp.json()


def choose_chat_and_version(project: Dict[str, Any]) -> Optional[Tuple[str, str]]:
    """
    Väljer ett (chatId, versionId) för projektet.
    Prioriterar chats där latestVersion.status == 'completed'.
    """
    chats = project.get("chats") or []
    if not chats:
        print("❌ Projektet har inga chats (ingen genererad kod ännu?).")
        return None

    def pick_chat(predicate):
        for ch in chats:
            latest = ch.get("latestVersion")
            if latest and predicate(latest):
                return ch
        return None

    # 1) färdig version
    chosen = pick_chat(lambda v: v.get("status") == "completed")
    # 2) annars första med någon version
    if chosen is None:
        chosen = pick_chat(lambda v: True)

    if chosen is None:
        print("❌ Hittade ingen version på detta projekt.")
        return None

    chat_id = chosen["id"]
    version_id = chosen["latestVersion"]["id"]

    return chat_id, version_id


def slugify(name: str) -> str:
    s = (name or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip("-")
    return s or "project"


def download_project_zip(project_id: str, out_dir: str = "exports") -> Optional[str]:
    """
    Laddar ned senaste versionen av projektet som ZIP.

    Flow:
      1) GET /v1/projects/{projectId}
      2) välj chat + latestVersion
      3) GET /v1/chats/{chatId}/versions/{versionId}/download?format=zip&includeDefaultFiles=true
    """
    project = get_project_by_id(project_id)
    name = project.get("name", "project")

    pair = choose_chat_and_version(project)
    if pair is None:
        return None

    chat_id, version_id = pair

    url = f"{BASE_URL}/chats/{chat_id}/versions/{version_id}/download"
    params = {
        "format": "zip",
        "includeDefaultFiles": "true",
    }

    # Viktigt: här skickar vi INTE Content-Type: application/json
    # eftersom vi hämtar binär data (zip)
    resp = requests.get(
        url,
        headers=get_headers(json_request=False),
        params=params,
        timeout=60,
    )

    if resp.status_code != 200:
        print(f"❌ Misslyckades ladda ned version: {resp.status_code} {resp.text}")
        return None

    os.makedirs(out_dir, exist_ok=True)
    filename = f"{slugify(name)}-{project_id}.zip"
    full_path = os.path.join(out_dir, filename)

    with open(full_path, "wb") as f:
        f.write(resp.content)

    print(f"✅ ZIP nedladdad: {full_path}")
    return full_path


def bulk_delete_by_name(
    projects: List[Dict[str, Any]],
    projects_ok: bool,
    pattern: str,
) -> None:
    """
    Raderar alla projekt där namnet innehåller pattern (case-insensitive).
    Kräver att vi faktiskt HAR en projektlista (projects_ok=True).
    """
    if not projects_ok or not projects:
        print(
            "❌ Kan inte bulk-radera per namn just nu (ingen fungerande projektlista)."
        )
        return

    pattern_lower = pattern.lower()

    to_delete = [p for p in projects if pattern_lower in (p.get("name") or "").lower()]

    if not to_delete:
        print(f"Inga projekt matchade '{pattern}'.")
        return

    print("\nFöljande projekt kommer raderas:")
    for p in to_delete:
        print(f"- {p.get('id')} | {p.get('name')}")

    confirm = input("\nSkriv 'ja' för att bekräfta radering: ").strip().lower()
    if confirm != "ja":
        print("❌ Avbrutet.")
        return

    for p in to_delete:
        delete_project(p.get("id"))


def delete_all_projects(projects: List[Dict[str, Any]], projects_ok: bool) -> None:
    """
    Raderar ALLA projekt i listan.
    Kräver hård bekräftelse och att vi faktiskt HAR en projektlista.
    """
    if not projects_ok or not projects:
        print(
            "❌ Kan inte radera alla – projektlistan är tom eller kunde inte hämtas (t.ex. 500)."
        )
        return

    print("\nFÖLJANDE PROJEKT KOMMER ATT RADERAS (ALLA):")
    for p in projects:
        print(f"- {p.get('id')} | {p.get('name')}")

    print("\n⚠️  DETTA KOMMER RADERA ALLA DESSA PROJEKT PERMANENT PÅ v0.")
    print("   Detta går INTE att ångra.")
    confirm = input("Skriv exakt: JAG ÄR HELT SÄKER\n> ").strip()

    if confirm != "JAG ÄR HELT SÄKER":
        print("❌ Avbrutet, inget raderat.")
        return

    for p in projects:
        pid = p.get("id")
        if pid:
            delete_project(pid)


# ================================
#  VERCEL API FUNKTIONER
# ================================


def get_vercel_headers() -> Dict[str, str]:
    """Headers för Vercel API."""
    return {
        "Authorization": f"Bearer {VERCEL_API_TOKEN}",
        "Content-Type": "application/json",
    }


def fetch_vercel_projects() -> Tuple[List[Dict[str, Any]], bool]:
    """
    Hämtar alla Vercel-projekt.
    GET /v9/projects
    """
    if not VERCEL_API_TOKEN:
        print("⚠️ VERCEL_API_TOKEN är inte satt.")
        return [], False

    url = f"{VERCEL_API_BASE}/v9/projects"
    try:
        resp = requests.get(url, headers=get_vercel_headers(), timeout=30)
    except requests.RequestException as e:
        print(f"❌ Nätverksfel vid hämtning av Vercel-projekt: {e}")
        return [], False

    if resp.status_code != 200:
        print(f"❌ Misslyckades hämta Vercel-projekt: {resp.status_code}")
        print(resp.text)
        return [], False

    data = resp.json()
    return data.get("projects", []), True


def print_vercel_projects(projects: List[Dict[str, Any]]) -> None:
    """Skriver ut Vercel-projektlistan."""
    print("\n🔷 Dina Vercel-projekt:\n")
    if not projects:
        print("  (Inga Vercel-projekt hittades)")
        return

    from datetime import datetime

    for i, proj in enumerate(projects, start=1):
        created = proj.get("createdAt", 0)
        if created:
            created_str = datetime.fromtimestamp(created / 1000).strftime(
                "%Y-%m-%d %H:%M"
            )
        else:
            created_str = "?"

        print(f"{i}.")
        print(f"   id:        {proj.get('id')}")
        print(f"   name:      {proj.get('name')}")
        print(f"   created:   {created_str}")
        print(f"   framework: {proj.get('framework', '?')}")
        print()


def delete_vercel_project(project_id: str) -> bool:
    """
    Raderar ett Vercel-projekt permanent.
    DELETE /v9/projects/{projectId}
    """
    if not VERCEL_API_TOKEN:
        print("❌ VERCEL_API_TOKEN är inte satt.")
        return False

    url = f"{VERCEL_API_BASE}/v9/projects/{project_id}"
    try:
        resp = requests.delete(url, headers=get_vercel_headers(), timeout=30)
    except requests.RequestException as e:
        print(f"❌ Nätverksfel vid radering av Vercel-projekt {project_id}: {e}")
        return False

    if resp.status_code in [200, 204]:
        print(f"✅ Vercel-projekt {project_id} raderat.")
        return True
    else:
        print(f"⚠️ Misslyckades radera Vercel-projekt {project_id}: {resp.status_code}")
        print(resp.text)
        return False


def bulk_delete_vercel_by_name(
    projects: List[Dict[str, Any]],
    pattern: str,
) -> None:
    """Raderar alla Vercel-projekt där namnet innehåller pattern."""
    if not projects:
        print("❌ Ingen Vercel-projektlista tillgänglig.")
        return

    pattern_lower = pattern.lower()
    to_delete = [p for p in projects if pattern_lower in (p.get("name") or "").lower()]

    if not to_delete:
        print(f"Inga Vercel-projekt matchade '{pattern}'.")
        return

    print("\n🔷 Följande Vercel-projekt kommer raderas:")
    for p in to_delete:
        print(f"  - {p.get('id')} | {p.get('name')}")

    confirm = input("\nSkriv 'ja' för att bekräfta radering: ").strip().lower()
    if confirm != "ja":
        print("❌ Avbrutet.")
        return

    for p in to_delete:
        delete_vercel_project(p.get("id"))


def delete_all_vercel_projects(projects: List[Dict[str, Any]]) -> None:
    """Raderar ALLA Vercel-projekt."""
    if not projects:
        print("❌ Ingen Vercel-projektlista tillgänglig.")
        return

    print("\n🔷 FÖLJANDE VERCEL-PROJEKT KOMMER ATT RADERAS (ALLA):")
    for p in projects:
        print(f"  - {p.get('id')} | {p.get('name')}")

    print("\n⚠️  DETTA KOMMER RADERA ALLA DESSA VERCEL-PROJEKT PERMANENT.")
    confirm = input("Skriv exakt: RADERA ALLA VERCEL\n> ").strip()

    if confirm != "RADERA ALLA VERCEL":
        print("❌ Avbrutet.")
        return

    for p in projects:
        pid = p.get("id")
        if pid:
            delete_vercel_project(pid)


# ================================
#  LOKAL DATABAS (SQLite) FUNKTIONER
# ================================


def get_sqlite_connection() -> Optional[sqlite3.Connection]:
    """Öppnar SQLite-databasen om den finns."""
    if not SQLITE_DB_PATH.exists():
        print(f"⚠️ SQLite-databas hittades inte: {SQLITE_DB_PATH}")
        return None
    try:
        conn = sqlite3.connect(str(SQLITE_DB_PATH))
        conn.row_factory = sqlite3.Row
        return conn
    except Exception as e:
        print(f"❌ Kunde inte öppna SQLite-databas: {e}")
        return None


def list_local_projects() -> List[Dict[str, Any]]:
    """Listar alla projekt i lokala SQLite-databasen."""
    conn = get_sqlite_connection()
    if not conn:
        return []

    try:
        cursor = conn.execute(
            "SELECT id, name, category, created_at FROM projects ORDER BY created_at DESC"
        )
        projects = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return projects
    except Exception as e:
        print(f"❌ Fel vid läsning av lokala projekt: {e}")
        conn.close()
        return []


def print_local_projects(projects: List[Dict[str, Any]]) -> None:
    """Skriver ut lokala projektlistan."""
    print("\n💾 Lokala projekt (SQLite):\n")
    if not projects:
        print("  (Inga lokala projekt hittades)")
        return

    for i, proj in enumerate(projects, start=1):
        print(f"{i}.")
        print(f"   id:       {proj.get('id')}")
        print(f"   name:     {proj.get('name')}")
        print(f"   category: {proj.get('category', '?')}")
        print(f"   created:  {proj.get('created_at', '?')}")
        print()


def delete_local_project(project_id: str) -> bool:
    """
    Raderar ett projekt från lokala SQLite-databasen.
    Raderar också relaterade data i:
    - project_data
    - project_files
    - vercel_deployments
    - images
    - media_library
    - company_profiles
    """
    conn = get_sqlite_connection()
    if not conn:
        return False

    try:
        cursor = conn.cursor()

        # Radera i rätt ordning (pga foreign keys)
        tables_to_clean = [
            ("project_files", "project_id"),
            ("project_data", "project_id"),
            ("vercel_deployments", "project_id"),
            ("images", "project_id"),
            ("media_library", "project_id"),
            ("company_profiles", "project_id"),
            ("projects", "id"),
        ]

        for table, column in tables_to_clean:
            try:
                cursor.execute(f"DELETE FROM {table} WHERE {column} = ?", (project_id,))
            except sqlite3.OperationalError:
                # Tabellen kanske inte finns
                pass

        conn.commit()
        conn.close()
        print(f"✅ Lokalt projekt {project_id} raderat från SQLite.")
        return True
    except Exception as e:
        print(f"❌ Fel vid radering av lokalt projekt {project_id}: {e}")
        conn.close()
        return False


def delete_all_local_projects() -> None:
    """Raderar ALLA lokala projekt från SQLite."""
    projects = list_local_projects()
    if not projects:
        print("❌ Inga lokala projekt att radera.")
        return

    print("\n💾 FÖLJANDE LOKALA PROJEKT KOMMER ATT RADERAS:")
    for p in projects:
        print(f"  - {p.get('id')} | {p.get('name')}")

    print("\n⚠️  DETTA RADERAR ALL LOKAL DATA PERMANENT.")
    confirm = input("Skriv exakt: RADERA LOKAL DATA\n> ").strip()

    if confirm != "RADERA LOKAL DATA":
        print("❌ Avbrutet.")
        return

    for p in projects:
        pid = p.get("id")
        if pid:
            delete_local_project(pid)


def get_local_stats() -> Dict[str, int]:
    """Hämtar statistik från lokala databasen."""
    conn = get_sqlite_connection()
    if not conn:
        return {}

    stats = {}
    tables = [
        "projects",
        "project_data",
        "project_files",
        "vercel_deployments",
        "template_cache",
        "media_library",
    ]

    for table in tables:
        try:
            cursor = conn.execute(f"SELECT COUNT(*) FROM {table}")
            stats[table] = cursor.fetchone()[0]
        except sqlite3.OperationalError:
            stats[table] = 0

    conn.close()
    return stats


def print_local_stats() -> None:
    """Skriver ut statistik för lokala databasen."""
    stats = get_local_stats()
    if not stats:
        print("❌ Kunde inte läsa lokal databas.")
        return

    print("\n💾 Lokal databas-statistik:")
    print(f"   Projekt:           {stats.get('projects', 0)}")
    print(f"   Projekt-data:      {stats.get('project_data', 0)}")
    print(f"   Projekt-filer:     {stats.get('project_files', 0)}")
    print(f"   Vercel-deploys:    {stats.get('vercel_deployments', 0)}")
    print(f"   Template-cache:    {stats.get('template_cache', 0)}")
    print(f"   Media-library:     {stats.get('media_library', 0)}")


def clear_template_cache() -> None:
    """Rensar template-cachen i SQLite."""
    conn = get_sqlite_connection()
    if not conn:
        return

    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM template_cache")
        deleted = cursor.rowcount
        conn.commit()
        conn.close()
        print(f"✅ Rensade {deleted} poster från template_cache.")
    except Exception as e:
        print(f"❌ Fel vid rensning av template_cache: {e}")
        conn.close()


# ================================
#  REDIS CACHE FUNKTIONER
# ================================


def clear_redis_cache() -> None:
    """Rensar Redis-cachen (kräver redis-py: pip install redis)."""
    if not REDIS_URL:
        print("⚠️ REDIS_URL är inte satt. Hoppar över Redis-rensning.")
        return

    try:
        import redis
    except ImportError:
        print("⚠️ redis-py är inte installerat. Kör: pip install redis")
        return

    try:
        r = redis.from_url(REDIS_URL)

        # Räkna nycklar före rensning
        keys_before = r.dbsize()

        # Hitta och radera projekt-relaterade nycklar
        patterns = [
            "project:*",
            "preview:*",
            "cache:*",
        ]

        deleted_count = 0
        for pattern in patterns:
            keys = r.keys(pattern)
            if keys:
                deleted_count += r.delete(*keys)

        print(f"✅ Rensade {deleted_count} nycklar från Redis.")
        print(f"   (Totalt i Redis: {r.dbsize()} nycklar kvar)")

    except Exception as e:
        print(f"❌ Fel vid rensning av Redis: {e}")


def cleanup_all(
    v0_projects: List[Dict[str, Any]],
    v0_ok: bool,
    vercel_projects: List[Dict[str, Any]],
    vercel_ok: bool,
    include_local: bool = True,
    include_redis: bool = True,
) -> None:
    """MEGA-CLEANUP: Raderar ALLT - v0, Vercel, lokal DB och Redis."""
    print("\n" + "=" * 60)
    print("⚠️  MEGA-CLEANUP - RADERA ALLT ⚠️")
    print("=" * 60)

    # Visa vad som kommer raderas
    local_projects = list_local_projects() if include_local else []

    if v0_ok and v0_projects:
        print(f"\n📁 v0-projekt att radera: {len(v0_projects)}")
        for p in v0_projects[:5]:
            print(f"  - {p.get('name', p.get('id'))}")
        if len(v0_projects) > 5:
            print(f"  ... och {len(v0_projects) - 5} till")

    if vercel_ok and vercel_projects:
        print(f"\n🔷 Vercel-projekt att radera: {len(vercel_projects)}")
        for p in vercel_projects[:5]:
            print(f"  - {p.get('name', p.get('id'))}")
        if len(vercel_projects) > 5:
            print(f"  ... och {len(vercel_projects) - 5} till")

    if include_local and local_projects:
        print(f"\n💾 Lokala projekt att radera: {len(local_projects)}")
        for p in local_projects[:5]:
            print(f"  - {p.get('name', p.get('id'))}")
        if len(local_projects) > 5:
            print(f"  ... och {len(local_projects) - 5} till")

    if include_redis and REDIS_URL:
        print("\n🔴 Redis-cache kommer rensas")

    total = (
        (len(v0_projects) if v0_ok else 0)
        + (len(vercel_projects) if vercel_ok else 0)
        + (len(local_projects) if include_local else 0)
    )

    if total == 0 and not (include_redis and REDIS_URL):
        print("\n❌ Inget att radera.")
        return

    print(f"\n⚠️  TOTALT {total} PROJEKT + CACHE KOMMER RADERAS PERMANENT.")
    print("   Detta inkluderar: v0, Vercel, SQLite och Redis!")
    confirm = input("Skriv exakt: JAG VILL RENSA ALLT\n> ").strip()

    if confirm != "JAG VILL RENSA ALLT":
        print("❌ Avbrutet.")
        return

    # 1. Radera v0-projekt
    if v0_ok and v0_projects:
        print("\n📁 Raderar v0-projekt...")
        for p in v0_projects:
            pid = p.get("id")
            if pid:
                delete_project(pid)

    # 2. Radera Vercel-projekt
    if vercel_ok and vercel_projects:
        print("\n🔷 Raderar Vercel-projekt...")
        for p in vercel_projects:
            pid = p.get("id")
            if pid:
                delete_vercel_project(pid)

    # 3. Radera lokala projekt
    if include_local and local_projects:
        print("\n💾 Raderar lokala projekt...")
        for p in local_projects:
            pid = p.get("id")
            if pid:
                delete_local_project(pid)

    # 4. Rensa template-cache
    if include_local:
        print("\n💾 Rensar template-cache...")
        clear_template_cache()

    # 5. Rensa Redis
    if include_redis:
        print("\n🔴 Rensar Redis-cache...")
        clear_redis_cache()

    print("\n✅ MEGA-CLEANUP klar!")


# ================================
#  MAIN
# ================================


def main() -> None:
    print("🔑 v0 + Vercel + Lokal DB Projekt-CLI")
    print("=====================================\n")

    # Visa status på API-nycklar
    print("📋 API-nyckel status:")
    print(f"   V0_API_KEY:       {'✅ Laddad' if V0_API_KEY else '❌ Saknas'}")
    print(f"   VERCEL_API_TOKEN: {'✅ Laddad' if VERCEL_API_TOKEN else '❌ Saknas'}")
    print(
        f"   REDIS_URL:        {'✅ Konfigurerad' if REDIS_URL else '⚠️ Ej konfigurerad'}"
    )
    print(f"   BLOB_TOKEN:       {'✅ Laddad' if BLOB_TOKEN else '⚠️ Ej konfigurerad'}")
    print(
        f"   SQLite DB:        {'✅ Finns' if SQLITE_DB_PATH.exists() else '❌ Finns ej'}"
    )
    print()

    # Hämta alla listor
    projects, projects_ok = fetch_projects()
    print_projects(projects)

    vercel_projects, vercel_ok = fetch_vercel_projects()
    print_vercel_projects(vercel_projects)

    local_projects = list_local_projects()
    print_local_projects(local_projects)
    print_local_stats()

    if not projects_ok:
        print("\n⚠️ Kunde inte hämta v0-projektlista.")

    while True:
        print("\n" + "=" * 50)
        print("HUVUDMENY")
        print("=" * 50)
        print("\n📁 v0-projekt (på v0.dev):")
        print("  [d]  Radera ett v0-projekt")
        print("  [b]  Bulk-radera v0 (namn matchar)")
        print("  [a]  Radera ALLA v0-projekt")
        print("  [z]  Ladda hem v0-projekt som ZIP")
        print("\n🔷 Vercel-projekt (deployments):")
        print("  [vd] Radera ett Vercel-projekt")
        print("  [vb] Bulk-radera Vercel (namn matchar)")
        print("  [va] Radera ALLA Vercel-projekt")
        print("\n💾 Lokal databas (SQLite):")
        print("  [ld] Radera ett lokalt projekt")
        print("  [la] Radera ALLA lokala projekt")
        print("  [ls] Visa lokal statistik")
        print("  [lc] Rensa template-cache")
        print("\n🔴 Redis:")
        print("  [rc] Rensa Redis-cache")
        print("\n🔥 MEGA:")
        print("  [x]  RADERA ALLT (v0 + Vercel + SQLite + Redis)")
        print("\n⚙️  Övrigt:")
        print("  [r]  Ladda om alla listor")
        print("  [q]  Avsluta")

        choice = input("\n> ").strip().lower()

        if choice == "q":
            print("Hejdå 👋")
            break

        elif choice == "r":
            projects, projects_ok = fetch_projects()
            print_projects(projects)
            vercel_projects, vercel_ok = fetch_vercel_projects()
            print_vercel_projects(vercel_projects)

        # ===== v0-kommandon =====
        elif choice == "d":
            target = input("Index eller projectId att radera: ").strip()
            proj_id = resolve_project_id(projects, projects_ok, target)
            if not proj_id:
                print("❌ Ogiltigt index/id.")
                continue

            confirm = input(f"Radera v0-projekt {proj_id}? (ja/nej): ").strip().lower()
            if confirm != "ja":
                print("Avbrutet.")
                continue

            delete_project(proj_id)

        elif choice == "b":
            pattern = input("Text som ska finnas i v0-projektnamnet: ").strip()
            if not pattern:
                print("❌ Tomt mönster.")
                continue
            bulk_delete_by_name(projects, projects_ok, pattern)

        elif choice == "a":
            delete_all_projects(projects, projects_ok)

        elif choice == "z":
            target = input("Index eller projectId att ladda hem som ZIP: ").strip()
            proj_id = resolve_project_id(projects, projects_ok, target)
            if not proj_id:
                print("❌ Ogiltigt index/id.")
                continue

            out_dir = input("Mapp för ZIP (Enter = ./exports): ").strip() or "exports"
            download_project_zip(proj_id, out_dir=out_dir)

        # ===== Vercel-kommandon =====
        elif choice == "vd":
            if not vercel_ok:
                print("❌ Ingen Vercel-projektlista tillgänglig.")
                continue

            print_vercel_projects(vercel_projects)
            target = input("Index eller projectId att radera: ").strip()

            if target.isdigit():
                idx = int(target)
                if 1 <= idx <= len(vercel_projects):
                    proj_id = vercel_projects[idx - 1].get("id")
                else:
                    print("❌ Ogiltigt index.")
                    continue
            else:
                proj_id = target

            confirm = (
                input(f"Radera Vercel-projekt {proj_id}? (ja/nej): ").strip().lower()
            )
            if confirm != "ja":
                print("Avbrutet.")
                continue

            delete_vercel_project(proj_id)

        elif choice == "vb":
            pattern = input("Text som ska finnas i Vercel-projektnamnet: ").strip()
            if not pattern:
                print("❌ Tomt mönster.")
                continue
            bulk_delete_vercel_by_name(vercel_projects, pattern)

        elif choice == "va":
            delete_all_vercel_projects(vercel_projects)

        # ===== Lokala databas-kommandon =====
        elif choice == "ld":
            local_projects = list_local_projects()
            if not local_projects:
                print("❌ Inga lokala projekt hittades.")
                continue

            print_local_projects(local_projects)
            target = input("Index eller projectId att radera: ").strip()

            if target.isdigit():
                idx = int(target)
                if 1 <= idx <= len(local_projects):
                    proj_id = local_projects[idx - 1].get("id")
                else:
                    print("❌ Ogiltigt index.")
                    continue
            else:
                proj_id = target

            confirm = (
                input(f"Radera lokalt projekt {proj_id}? (ja/nej): ").strip().lower()
            )
            if confirm != "ja":
                print("Avbrutet.")
                continue

            delete_local_project(proj_id)

        elif choice == "la":
            delete_all_local_projects()
            local_projects = list_local_projects()

        elif choice == "ls":
            print_local_stats()

        elif choice == "lc":
            confirm = input("Rensa template-cache? (ja/nej): ").strip().lower()
            if confirm == "ja":
                clear_template_cache()

        # ===== Redis-kommandon =====
        elif choice == "rc":
            confirm = input("Rensa Redis-cache? (ja/nej): ").strip().lower()
            if confirm == "ja":
                clear_redis_cache()

        # ===== MEGA CLEANUP =====
        elif choice == "x":
            cleanup_all(projects, projects_ok, vercel_projects, vercel_ok)
            # Ladda om alla listor
            projects, projects_ok = fetch_projects()
            vercel_projects, vercel_ok = fetch_vercel_projects()
            local_projects = list_local_projects()

        else:
            print("❌ Okänt val.\n")


if __name__ == "__main__":
    main()
