from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import requests

try:
    from dotenv import dotenv_values  # type: ignore
except Exception:
    dotenv_values = None


# ============================================================
#  Utils
# ============================================================

def eprint(*a: Any) -> None:
    print(*a, file=sys.stderr)


def mask_value(v: str, keep: int = 2) -> str:
    if v is None:
        return "<none>"
    s = str(v)
    if len(s) <= keep * 2:
        return "*" * len(s)
    return f"{s[:keep]}***{s[-keep:]}"


def parse_csv(s: str) -> List[str]:
    return [x.strip() for x in (s or "").split(",") if x.strip()]


def dt_ms(ms: Any) -> str:
    try:
        ms_i = int(ms)
        return datetime.fromtimestamp(ms_i / 1000).strftime("%Y-%m-%d %H:%M")
    except Exception:
        return "?"


def rate_limit_sleep() -> None:
    time.sleep(0.15)


# ============================================================
#  Repo root + env-file discovery
# ============================================================

def find_repo_root(start: Optional[Path] = None) -> Path:
    start = (start or Path.cwd()).resolve()
    for p in [start, *start.parents]:
        if p.name.lower() == "sajtmaskin":
            return p
        if (p / ".git").exists():
            return p
    return start


def find_env_files(root: Path) -> List[Path]:
    # Håll det enkelt men robust:
    # - root/.env*
    # - root/app/.env*
    patterns = ["*.env", ".env*", "*.env.*"]  # fångar även om någon döpt konstigt
    candidates: List[Path] = []

    # typiska namn först (så man får stabil ordning)
    typical = [
        root / ".env",
        root / ".env.local",
        root / ".env.development",
        root / ".env.production",
        root / ".env.dev",
        root / ".env.prod",
        root / "app" / ".env",
        root / "app" / ".env.local",
    ]
    for p in typical:
        if p.exists():
            candidates.append(p)

    # sen allt annat .env*
    for folder in [root, root / "app"]:
        if not folder.exists():
            continue
        for p in sorted(folder.glob(".env*")):
            if p.exists() and p not in candidates and p.is_file():
                candidates.append(p)

    # de-dupe
    seen = set()
    out = []
    for p in candidates:
        rp = p.resolve()
        if rp not in seen:
            seen.add(rp)
            out.append(rp)
    return out


def load_env_files_into_os(files: List[Path]) -> None:
    """
    Laddar env-filer (key=value) in i os.environ.
    Senare filer vinner.
    """
    for f in files:
        env_map = read_env_file(f)
        for k, v in env_map.items():
            if v is None:
                continue
            os.environ[str(k)] = str(v)


def read_env_file(path: Path) -> Dict[str, str]:
    if not path.exists():
        return {}

    if dotenv_values is not None:
        data = dotenv_values(str(path)) or {}
        return {str(k): str(v) for k, v in data.items() if v is not None}

    # fallback-parser (enkelt: KEY=VALUE, ignorerar kommentarer)
    out: Dict[str, str] = {}
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def upsert_env_key_in_file(path: Path, key: str, value: str) -> None:
    """
    Minimal "edit": uppdaterar första raden som börjar med KEY=, annars append.
    Bevarar övriga rader.
    """
    key = key.strip()
    if not key:
        raise ValueError("Empty key")

    lines = []
    found = False
    if path.exists():
        lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()

    key_re = re.compile(rf"^\s*{re.escape(key)}\s*=")
    new_lines: List[str] = []

    for line in lines:
        if not found and key_re.match(line) and not line.lstrip().startswith("#"):
            new_lines.append(f"{key}={value}")
            found = True
        else:
            new_lines.append(line)

    if not found:
        if new_lines and new_lines[-1].strip() != "":
            new_lines.append("")
        new_lines.append(f"{key}={value}")

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")


# ============================================================
#  Config + Profiles
# ============================================================

@dataclass
class VercelProfile:
    token: str
    team_id: str = ""
    team_slug: str = ""


@dataclass
class V0Profile:
    token: str


@dataclass
class SupabaseProfile:
    access_token: str
    base_url: str = "https://api.supabase.com"  # default enligt Supabase Platform API-exempel


@dataclass
class Profile:
    name: str
    vercel: Optional[VercelProfile] = None
    v0: Optional[V0Profile] = None
    supabase: Optional[SupabaseProfile] = None


def env_get(name: str) -> str:
    return (os.environ.get(name) or "").strip()


def resolve_from_env_or_literal(value_or_env: str) -> str:
    """
    Om strängen ser ut som en env-var (A-Z0-9_ och finns i env), använd env-värdet.
    Annars tolka den som literal.
    """
    s = (value_or_env or "").strip()
    if not s:
        return ""

    if re.fullmatch(r"[A-Z0-9_]+", s):
        v = env_get(s)
        if v:
            return v

    return s


def load_config(root: Path, config_path: Optional[str]) -> Tuple[List[Profile], List[str], Path]:
    default_candidates = [
        "app/data/sajtmaskin.db",
        "app/data/dev.db",
        "data/sajtmaskin.db",
        "sajtmaskin.db",
    ]

    cfg_path = Path(config_path).expanduser().resolve() if config_path else (root / ".sajtmaskin-cleaner.json")

    if not cfg_path.exists():
        # fallback: 1 default-profil från klassiska env-keys
        profiles = []
        vercel_token = env_get("VERCEL_API_TOKEN") or env_get("VERCEL_TOKEN")
        v0_token = env_get("V0_API_KEY")
        supa_token = env_get("SUPABASE_ACCESS_TOKEN")

        p = Profile(
            name="default",
            vercel=VercelProfile(token=vercel_token, team_id=env_get("VERCEL_TEAM_ID"), team_slug=env_get("VERCEL_TEAM_SLUG")) if vercel_token else None,
            v0=V0Profile(token=v0_token) if v0_token else None,
            supabase=SupabaseProfile(access_token=supa_token) if supa_token else None,
        )
        profiles.append(p)
        return profiles, default_candidates, cfg_path

    raw = json.loads(cfg_path.read_text(encoding="utf-8"))
    sqlite_candidates = raw.get("sqlite_candidates") or default_candidates

    profiles: List[Profile] = []
    for name, pdata in (raw.get("profiles") or {}).items():
        vercel = None
        if isinstance(pdata.get("vercel"), dict):
            vp = pdata["vercel"]
            token = resolve_from_env_or_literal(vp.get("token_env") or vp.get("token") or "")
            team_id = resolve_from_env_or_literal(vp.get("team_id_env") or vp.get("team_id") or "")
            team_slug = resolve_from_env_or_literal(vp.get("team_slug_env") or vp.get("team_slug") or "")
            if token:
                vercel = VercelProfile(token=token, team_id=team_id, team_slug=team_slug)

        v0p = None
        if isinstance(pdata.get("v0"), dict):
            vv = pdata["v0"]
            token = resolve_from_env_or_literal(vv.get("token_env") or vv.get("token") or "")
            if token:
                v0p = V0Profile(token=token)

        supa = None
        if isinstance(pdata.get("supabase"), dict):
            sp = pdata["supabase"]
            token = resolve_from_env_or_literal(sp.get("access_token_env") or sp.get("access_token") or "")
            base_url = (sp.get("base_url") or "https://api.supabase.com").strip()
            if token:
                supa = SupabaseProfile(access_token=token, base_url=base_url)

        profiles.append(Profile(name=name, vercel=vercel, v0=v0p, supabase=supa))

    return profiles, list(sqlite_candidates), cfg_path


def pick_profile(profiles: List[Profile], name: str) -> Profile:
    for p in profiles:
        if p.name == name:
            return p
    raise SystemExit(f"❌ Okänd profil: {name}. Finns: {', '.join([p.name for p in profiles])}")


# ============================================================
#  HTTP helpers
# ============================================================

class HttpError(RuntimeError):
    def __init__(self, msg: str, status: int, body: str):
        super().__init__(msg)
        self.status = status
        self.body = body


def request_json(
    session: requests.Session,
    method: str,
    url: str,
    headers: Dict[str, str],
    params: Optional[Dict[str, Any]] = None,
    json_body: Any = None,
    timeout: int = 30,
) -> Any:
    try:
        resp = session.request(method, url, headers=headers, params=params, json=json_body, timeout=timeout)
    except requests.RequestException as e:
        raise RuntimeError(f"Nätverksfel: {e}") from e

    if resp.status_code >= 400:
        raise HttpError(f"HTTP {resp.status_code} för {method} {url}", resp.status_code, resp.text)

    if resp.status_code == 204:
        return None

    if resp.text.strip() == "":
        return None

    try:
        return resp.json()
    except Exception:
        return resp.text


# ============================================================
#  Vercel
# ============================================================

class VercelClient:
    def __init__(self, token: str, team_id: str = "", team_slug: str = "", base: str = "https://api.vercel.com"):
        self.base = base.rstrip("/")
        self.team_id = team_id
        self.team_slug = team_slug
        self.s = requests.Session()
        self.headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    def scope_params(self) -> Dict[str, str]:
        p: Dict[str, str] = {}
        if self.team_id:
            p["teamId"] = self.team_id
        elif self.team_slug:
            p["slug"] = self.team_slug
        return p

    def user_info(self) -> Dict[str, Any]:
        data = request_json(self.s, "GET", f"{self.base}/v2/user", self.headers)
        if isinstance(data, dict):
            return data
        return {}

    def teams_list(self) -> List[Dict[str, Any]]:
        data = request_json(self.s, "GET", f"{self.base}/v2/teams", self.headers)
        if isinstance(data, dict) and isinstance(data.get("teams"), list):
            return data["teams"]
        if isinstance(data, list):
            return data
        return []

    def projects_all(self, limit: int = 100) -> List[Dict[str, Any]]:
        """
        Robust pagination: Vercel beskriver paginering via `pagination.next` och att man skickar
        continuation token i nästa request (exempel använder `until`). :contentReference[oaicite:4]{index=4}
        """
        out: List[Dict[str, Any]] = []
        until: Optional[str] = None

        while True:
            params: Dict[str, Any] = {"limit": limit}
            params.update(self.scope_params())
            if until:
                params["until"] = until

            data = request_json(self.s, "GET", f"{self.base}/v9/projects", self.headers, params=params)
            if isinstance(data, dict) and "projects" in data:
                batch = data.get("projects") or []
                out.extend(batch)
                until = (data.get("pagination") or {}).get("next")
            elif isinstance(data, list):
                # fallback om API skulle svara med array
                out.extend(data)
                break
            else:
                break

            if not until:
                break
            rate_limit_sleep()

        return out

    def delete_project(self, id_or_name: str) -> None:
        params = self.scope_params()
        request_json(self.s, "DELETE", f"{self.base}/v9/projects/{id_or_name}", self.headers, params=params)

    def env_list(self, id_or_name: str, decrypt: bool = False, git_branch: str = "") -> List[Dict[str, Any]]:
        params: Dict[str, Any] = {}
        params.update(self.scope_params())
        if decrypt:
            params["decrypt"] = "true"  # deprecierad men finns i API. :contentReference[oaicite:5]{index=5}
        if git_branch:
            params["gitBranch"] = git_branch

        data = request_json(self.s, "GET", f"{self.base}/v10/projects/{id_or_name}/env", self.headers, params=params)
        if isinstance(data, list):
            return data
        return []

    def env_set(
        self,
        id_or_name: str,
        key: str,
        value: str,
        targets: List[str],
        env_type: str = "sensitive",
        upsert: bool = True,
    ) -> Dict[str, Any]:
        """
        Skapar env-var (eller upsert).
        """
        params: Dict[str, Any] = {}
        params.update(self.scope_params())
        if upsert:
            params["upsert"] = "true"

        body = [{
            "key": key,
            "value": value,
            "target": targets,
            "type": env_type,
        }]

        return request_json(self.s, "POST", f"{self.base}/v10/projects/{id_or_name}/env", self.headers, params=params, json_body=body)

    def env_delete(self, id_or_name: str, env_id: str) -> None:
        params = self.scope_params()
        request_json(self.s, "DELETE", f"{self.base}/v9/projects/{id_or_name}/env/{env_id}", self.headers, params=params)


def vercel_is_github(project: Dict[str, Any]) -> bool:
    link = project.get("link") or {}
    return isinstance(link, dict) and (link.get("type") == "github")  # :contentReference[oaicite:6]{index=6}


def vercel_repo_str(project: Dict[str, Any]) -> str:
    link = project.get("link") or {}
    if not isinstance(link, dict):
        return ""
    org = link.get("org") or ""
    repo = link.get("repo") or ""
    if org and repo:
        return f"{org}/{repo}"
    return repo or ""


# ============================================================
#  v0
# ============================================================

class V0Client:
    def __init__(self, token: str, base: str = "https://api.v0.dev/v1"):
        self.base = base.rstrip("/")
        self.s = requests.Session()
        self.headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    def projects_all(self) -> List[Dict[str, Any]]:
        # v0: GET /v1/projects :contentReference[oaicite:7]{index=7}
        data = request_json(self.s, "GET", f"{self.base}/projects", self.headers)
        if isinstance(data, dict) and isinstance(data.get("data"), list):
            return data["data"]
        if isinstance(data, dict) and isinstance(data.get("projects"), list):
            return data["projects"]
        return []

    def delete_project(self, project_id: str) -> None:
        request_json(self.s, "DELETE", f"{self.base}/projects/{project_id}", self.headers)

    def env_list(self, project_id: str, decrypted: bool = False) -> List[Dict[str, Any]]:
        # samma path som create-env-vars fast GET (v0-dokumentationen följer tydligt /env-vars).
        params = {}
        if decrypted:
            params["decrypted"] = "true"
        data = request_json(self.s, "GET", f"{self.base}/projects/{project_id}/env-vars", self.headers, params=params)
        if isinstance(data, dict) and isinstance(data.get("data"), list):
            return data["data"]
        if isinstance(data, list):
            return data
        return []

    def env_create(self, project_id: str, envs: List[Dict[str, str]], upsert: bool = False, decrypted: bool = False) -> Any:
        # POST /v1/projects/{projectId}/env-vars :contentReference[oaicite:8]{index=8}
        params = {}
        if decrypted:
            params["decrypted"] = "true"
        body = {
            "environmentVariables": envs,
            "upsert": bool(upsert),
        }
        return request_json(self.s, "POST", f"{self.base}/projects/{project_id}/env-vars", self.headers, params=params, json_body=body)


# ============================================================
#  Supabase (minimal: lista projekt + api-keys)
# ============================================================

class SupabaseClient:
    def __init__(self, access_token: str, base_url: str = "https://api.supabase.com"):
        self.base = base_url.rstrip("/")
        self.s = requests.Session()
        self.headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}

    def projects_all(self) -> List[Dict[str, Any]]:
        # Supabase Platform API använder /v1/projects (exempel i deras guide). :contentReference[oaicite:9]{index=9}
        data = request_json(self.s, "GET", f"{self.base}/v1/projects", self.headers)
        if isinstance(data, list):
            return data
        if isinstance(data, dict) and isinstance(data.get("projects"), list):
            return data["projects"]
        return []

    def api_keys(self, project_ref: str, reveal: bool = False) -> List[Dict[str, Any]]:
        # GET /v1/projects/{ref}/api-keys?reveal=true
        params = {"reveal": "true"} if reveal else {}
        data = request_json(self.s, "GET", f"{self.base}/v1/projects/{project_ref}/api-keys", self.headers, params=params)
        if isinstance(data, list):
            return data
        if isinstance(data, dict) and isinstance(data.get("data"), list):
            return data["data"]
        return []


def try_supabase_cli_secrets_list(project_ref: str) -> Tuple[bool, str]:
    """
    Valfritt: om du har supabase CLI installerad och inloggad.
    """
    try:
        cp = subprocess.run(
            ["supabase", "secrets", "list", "--project-ref", project_ref],
            capture_output=True,
            text=True,
            check=False,
        )
        out = (cp.stdout or "") + ("\n" + cp.stderr if cp.stderr else "")
        return (cp.returncode == 0), out.strip()
    except FileNotFoundError:
        return False, "supabase CLI hittades inte i PATH."
    except Exception as e:
        return False, f"supabase CLI error: {e}"


# ============================================================
#  SQLite (lokal)
# ============================================================

def resolve_sqlite_path(root: Path, candidates: List[str], override: str = "") -> Optional[Path]:
    if override.strip():
        p = Path(override).expanduser()
        if not p.is_absolute():
            p = (root / p).resolve()
        return p if p.exists() else p  # returnera ändå så man ser var den pekar

    envp = env_get("SQLITE_DB_PATH")
    if envp:
        p = Path(envp).expanduser()
        if not p.is_absolute():
            p = (root / p).resolve()
        return p if p.exists() else p

    for rel in candidates:
        p = (root / rel).resolve()
        if p.exists():
            return p
    return None


def sqlite_connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


def sqlite_table_counts(conn: sqlite3.Connection, tables: List[str]) -> Dict[str, int]:
    out: Dict[str, int] = {}
    for t in tables:
        try:
            cur = conn.execute(f"SELECT COUNT(*) FROM {t}")
            out[t] = int(cur.fetchone()[0])
        except sqlite3.OperationalError:
            out[t] = 0
    return out


# ============================================================
#  Redis (valfritt)
# ============================================================

def redis_clear(patterns: List[str]) -> None:
    redis_url = env_get("REDIS_URL")
    if not redis_url:
        print("⚠️ REDIS_URL saknas. Hoppar Redis.")
        return

    try:
        import redis  # type: ignore
    except Exception:
        print("⚠️ redis saknas. Kör: pip install redis")
        return

    r = redis.from_url(redis_url)
    deleted = 0
    for pat in patterns:
        keys = r.keys(pat)
        if keys:
            deleted += r.delete(*keys)
    print(f"✅ Rensade {deleted} nycklar. (dbsize nu: {r.dbsize()})")


# ============================================================
#  Commands
# ============================================================

def cmd_scan(profile: Profile, args: argparse.Namespace) -> None:
    print(f"== Scan: profile={profile.name} ==")
    root = find_repo_root()
    print(f"Repo-root: {root}")

    # Vercel
    if profile.vercel:
        vc = VercelClient(profile.vercel.token, profile.vercel.team_id, profile.vercel.team_slug)
        try:
            projects = vc.projects_all()
            gh = sum(1 for p in projects if vercel_is_github(p))
            no_gh = len(projects) - gh
            print(f"\nVercel projects: {len(projects)} | GitHub-linked: {gh} | Not linked: {no_gh}")

            # visa topp 15 nyast
            projects_sorted = sorted(projects, key=lambda p: p.get("createdAt", 0), reverse=True)
            for p in projects_sorted[:15]:
                repo = vercel_repo_str(p)
                tag = "GH" if vercel_is_github(p) else "--"
                print(f"  [{tag}] {p.get('name')} | id={p.get('id')} | created={dt_ms(p.get('createdAt'))} | repo={repo}")
        except HttpError as e:
            print(f"\nVercel: HTTP {e.status} (kan vara scope/behörighet): {e.body[:200]}")
        except RuntimeError as e:
            print(f"\nVercel: {e}")

    else:
        print("\nVercel: (ingen konfig i profilen)")

    # v0
    if profile.v0:
        v0c = V0Client(profile.v0.token)
        try:
            v0_projects = v0c.projects_all()
            print(f"\nv0 projects: {len(v0_projects)}")
            for p in v0_projects[:15]:
                # v0 project innehåller bl.a. privacy och ev. vercelProjectId :contentReference[oaicite:11]{index=11}
                print(f"  {p.get('name')} | id={p.get('id')} | privacy={p.get('privacy')} | vercelProjectId={p.get('vercelProjectId')}")
        except HttpError as e:
            print(f"\nv0: HTTP {e.status} (kan vara scope/behörighet): {e.body[:200]}")
        except RuntimeError as e:
            print(f"\nv0: {e}")
    else:
        print("\nv0: (ingen konfig i profilen)")

    # Supabase
    if profile.supabase:
        sc = SupabaseClient(profile.supabase.access_token, profile.supabase.base_url)
        try:
            sp = sc.projects_all()
            print(f"\nSupabase projects: {len(sp)}")
            for p in sp[:10]:
                # okänd schema i detalj – printa defensivt
                name = p.get("name") or p.get("project_name") or p.get("ref") or p.get("id")
                ref = p.get("ref") or p.get("id") or p.get("project_ref")
                print(f"  {name} | ref={ref}")
        except HttpError as e:
            print(f"\nSupabase: HTTP {e.status} (kan vara scope/behörighet): {e.body[:200]}")
    else:
        print("\nSupabase: (ingen konfig i profilen)")

    # lokala env-filer
    env_files = find_env_files(root)
    if env_files:
        print("\nLocal .env files:")
        for f in env_files:
            print(f"  - {f}")
    else:
        print("\nLocal .env files: (hittade inga)")

    # sqlite
    if args.sqlite:
        # den här delen är mest för att snabbt se att DB hittas
        dbp = resolve_sqlite_path(root, args.sqlite_candidates, override=args.db_path or "")
        print(f"\nSQLite: {dbp if dbp else '(not found)'}")
        if dbp and dbp.exists():
            conn = sqlite_connect(dbp)
            stats = sqlite_table_counts(conn, ["projects", "project_data", "project_files", "vercel_deployments", "template_cache", "media_library"])
            conn.close()
            for k, v in stats.items():
                print(f"  {k}: {v}")


def cmd_vercel_projects_list(profile: Profile, args: argparse.Namespace) -> None:
    if not profile.vercel:
        raise SystemExit("❌ Profilen saknar Vercel-konfig.")

    vc = VercelClient(profile.vercel.token, profile.vercel.team_id, profile.vercel.team_slug)
    projects = vc.projects_all()

    # filters
    if args.name_contains:
        s = args.name_contains.lower()
        projects = [p for p in projects if s in str(p.get("name") or "").lower()]

    if args.github != "any":
        want = (args.github == "only")
        projects = [p for p in projects if vercel_is_github(p) == want]

    projects = sorted(projects, key=lambda p: p.get("createdAt", 0), reverse=True)

    for p in projects:
        repo = vercel_repo_str(p)
        tag = "GH" if vercel_is_github(p) else "--"
        print(f"[{tag}] {p.get('name')} | id={p.get('id')} | created={dt_ms(p.get('createdAt'))} | repo={repo}")

    print(f"\nTotal: {len(projects)}")


def cmd_vercel_projects_delete(profile: Profile, args: argparse.Namespace) -> None:
    if not profile.vercel:
        raise SystemExit("❌ Profilen saknar Vercel-konfig.")

    vc = VercelClient(profile.vercel.token, profile.vercel.team_id, profile.vercel.team_slug)
    projects = vc.projects_all()

    # filters
    if args.name_contains:
        s = args.name_contains.lower()
        projects = [p for p in projects if s in str(p.get("name") or "").lower()]

    if args.github != "any":
        want = (args.github == "only")
        projects = [p for p in projects if vercel_is_github(p) == want]

    projects = sorted(projects, key=lambda p: p.get("createdAt", 0), reverse=True)

    if not projects:
        print("Inga projekt matchade filter.")
        return

    print("Följande projekt matchar:")
    for p in projects:
        repo = vercel_repo_str(p)
        tag = "GH" if vercel_is_github(p) else "--"
        print(f"  [{tag}] {p.get('name')} | id={p.get('id')} | repo={repo}")

    if not args.execute:
        print("\n(DRY-RUN) Lägg till --execute --yes för att faktiskt radera.")
        return

    if not args.yes:
        raise SystemExit("❌ För destruktivt kommando krävs --yes.")

    for p in projects:
        pid = p.get("id") or p.get("name")
        if not pid:
            continue
        print(f"🗑️  Deleting {p.get('name')} ({pid}) ...")
        vc.delete_project(str(pid))
        rate_limit_sleep()

    print("✅ Klart.")


def cmd_vercel_env_list(profile: Profile, args: argparse.Namespace) -> None:
    if not profile.vercel:
        raise SystemExit("❌ Profilen saknar Vercel-konfig.")
    vc = VercelClient(profile.vercel.token, profile.vercel.team_id, profile.vercel.team_slug)

    envs = vc.env_list(args.project, decrypt=args.decrypt, git_branch=args.git_branch or "")

    if not envs:
        print("(Inga env vars hittades – eller saknar access.)")
        return

    for ev in envs:
        key = ev.get("key")
        typ = ev.get("type")
        targets = ev.get("target")
        val = ev.get("value")

        # OBS: Vercel kan utelämna `value` för encrypted/sensitive även om decrypt=true :contentReference[oaicite:12]{index=12}
        if args.show_values:
            shown = "<hidden>" if val is None else str(val)
        else:
            shown = "<hidden>" if val is None else mask_value(str(val))

        print(f"{key} | type={typ} | target={targets} | value={shown}")


def cmd_vercel_env_set(profile: Profile, args: argparse.Namespace) -> None:
    if not profile.vercel:
        raise SystemExit("❌ Profilen saknar Vercel-konfig.")
    if not args.execute:
        print("(DRY-RUN) Lägg till --execute --yes för att faktiskt skriva env-var.")
        print(f"Would set: project={args.project} key={args.key} targets={args.targets} type={args.type}")
        return
    if not args.yes:
        raise SystemExit("❌ För destruktivt kommando krävs --yes.")

    vc = VercelClient(profile.vercel.token, profile.vercel.team_id, profile.vercel.team_slug)
    targets = parse_csv(args.targets)
    res = vc.env_set(args.project, args.key, args.value, targets, env_type=args.type, upsert=not args.no_upsert)
    print(json.dumps(res, indent=2, ensure_ascii=False))


def cmd_vercel_env_delete(profile: Profile, args: argparse.Namespace) -> None:
    if not profile.vercel:
        raise SystemExit("❌ Profilen saknar Vercel-konfig.")
    if not args.execute:
        print("(DRY-RUN) Lägg till --execute --yes för att faktiskt radera env-var.")
        print(f"Would delete: project={args.project} env_id={args.env_id}")
        return
    if not args.yes:
        raise SystemExit("❌ För destruktivt kommando krävs --yes.")

    vc = VercelClient(profile.vercel.token, profile.vercel.team_id, profile.vercel.team_slug)
    vc.env_delete(args.project, args.env_id)
    print("✅ Raderad.")


def cmd_v0_projects_list(profile: Profile, args: argparse.Namespace) -> None:
    if not profile.v0:
        raise SystemExit("❌ Profilen saknar v0-konfig.")
    v0c = V0Client(profile.v0.token)
    projects = v0c.projects_all()
    for p in projects:
        print(f"{p.get('name')} | id={p.get('id')} | privacy={p.get('privacy')} | vercelProjectId={p.get('vercelProjectId')}")
    print(f"\nTotal: {len(projects)}")


def cmd_v0_projects_delete(profile: Profile, args: argparse.Namespace) -> None:
    if not profile.v0:
        raise SystemExit("❌ Profilen saknar v0-konfig.")

    v0c = V0Client(profile.v0.token)
    projects = v0c.projects_all()

    if args.name_contains:
        s = args.name_contains.lower()
        projects = [p for p in projects if s in str(p.get("name") or "").lower()]

    if not projects:
        print("Inga projekt matchade filter.")
        return

    print("Följande v0-projekt matchar:")
    for p in projects:
        print(f"  {p.get('name')} | id={p.get('id')} | privacy={p.get('privacy')}")

    if not args.execute:
        print("\n(DRY-RUN) Lägg till --execute --yes för att faktiskt radera.")
        return
    if not args.yes:
        raise SystemExit("❌ För destruktivt kommando krävs --yes.")

    for p in projects:
        pid = p.get("id")
        if pid:
            print(f"🗑️  Deleting v0 {p.get('name')} ({pid}) ...")
            v0c.delete_project(str(pid))
            rate_limit_sleep()

    print("✅ Klart.")


def cmd_v0_env_list(profile: Profile, args: argparse.Namespace) -> None:
    if not profile.v0:
        raise SystemExit("❌ Profilen saknar v0-konfig.")
    v0c = V0Client(profile.v0.token)
    envs = v0c.env_list(args.project_id, decrypted=args.decrypted)
    for ev in envs:
        key = ev.get("key")
        val = ev.get("value")
        dec = ev.get("decrypted")
        if args.show_values:
            shown = "<hidden>" if val is None else str(val)
        else:
            shown = "<hidden>" if val is None else mask_value(str(val))
        print(f"{key} | decrypted={dec} | value={shown}")


def cmd_v0_env_set(profile: Profile, args: argparse.Namespace) -> None:
    if not profile.v0:
        raise SystemExit("❌ Profilen saknar v0-konfig.")

    if not args.execute:
        print("(DRY-RUN) Lägg till --execute --yes för att faktiskt skriva env-var.")
        print(f"Would set: project_id={args.project_id} key={args.key}")
        return
    if not args.yes:
        raise SystemExit("❌ För destruktivt kommando krävs --yes.")

    v0c = V0Client(profile.v0.token)
    res = v0c.env_create(
        args.project_id,
        envs=[{"key": args.key, "value": args.value}],
        upsert=not args.no_upsert,
        decrypted=args.decrypted,
    )
    print(json.dumps(res, indent=2, ensure_ascii=False))


def cmd_local_env_list(args: argparse.Namespace) -> None:
    root = find_repo_root()
    env_files = find_env_files(root)
    if not env_files:
        print("Inga .env* hittades.")
        return

    for f in env_files:
        print(f"\n== {f} ==")
        data = read_env_file(f)
        keys = sorted(data.keys())
        for k in keys:
            v = data.get(k, "")
            shown = v if args.show_values else mask_value(v)
            print(f"{k}={shown}")


def cmd_local_env_set(args: argparse.Namespace) -> None:
    root = find_repo_root()
    p = Path(args.file).expanduser()
    if not p.is_absolute():
        p = (root / p).resolve()

    if not args.execute:
        print("(DRY-RUN) Lägg till --execute --yes för att faktiskt skriva till fil.")
        print(f"Would set: {p} {args.key}=...")
        return
    if not args.yes:
        raise SystemExit("❌ För destruktivt kommando krävs --yes.")

    upsert_env_key_in_file(p, args.key, args.value)
    print(f"✅ Uppdaterade {p}")


def cmd_redis_clear(args: argparse.Namespace) -> None:
    patterns = parse_csv(args.patterns) or ["project:*", "preview:*", "cache:*"]
    if not args.execute:
        print("(DRY-RUN) Lägg till --execute --yes för att faktiskt rensa Redis.")
        print(f"Would delete patterns: {patterns}")
        return
    if not args.yes:
        raise SystemExit("❌ För destruktivt kommando krävs --yes.")
    redis_clear(patterns)


def cmd_supabase_list(profile: Profile, args: argparse.Namespace) -> None:
    if not profile.supabase:
        raise SystemExit("❌ Profilen saknar Supabase-konfig.")
    sc = SupabaseClient(profile.supabase.access_token, profile.supabase.base_url)
    projects = sc.projects_all()
    for p in projects:
        name = p.get("name") or p.get("project_name") or p.get("ref") or p.get("id")
        ref = p.get("ref") or p.get("id") or p.get("project_ref")
        print(f"{name} | ref={ref}")
    print(f"\nTotal: {len(projects)}")


def cmd_supabase_api_keys(profile: Profile, args: argparse.Namespace) -> None:
    if not profile.supabase:
        raise SystemExit("❌ Profilen saknar Supabase-konfig.")
    sc = SupabaseClient(profile.supabase.access_token, profile.supabase.base_url)
    keys = sc.api_keys(args.project_ref, reveal=args.reveal)
    for k in keys:
        name = k.get("name") or k.get("key_name") or k.get("type")
        val = k.get("api_key") or k.get("key") or k.get("value")
        shown = str(val) if args.reveal else (mask_value(str(val)) if val else "<hidden>")
        print(f"{name}: {shown}")


def cmd_supabase_secrets_cli(args: argparse.Namespace) -> None:
    ok, out = try_supabase_cli_secrets_list(args.project_ref)
    print(out)
    if not ok:
        raise SystemExit("❌ supabase CLI secrets list misslyckades.")


# ============================================================
#  CLI
# ============================================================

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="sajtmaskin_cleaner_cli.py", description="Sajtmaskin multi-profile cleaner/map tool")

    p.add_argument("--config", default="", help="Path to .sajtmaskin-cleaner.json (default: repo-root)")
    p.add_argument("--profile", default="default", help="Profile name (default: default)")
    p.add_argument("--execute", action="store_true", help="Perform destructive actions (otherwise dry-run)")
    p.add_argument("--yes", action="store_true", help="Non-interactive confirmation for destructive actions")

    sub = p.add_subparsers(dest="cmd", required=True)

    # scan
    s = sub.add_parser("scan", help="Map projects across providers")
    s.add_argument("--sqlite", action="store_true", help="Also show sqlite stats if DB found")
    s.add_argument("--db-path", default="", help="Override sqlite path")
    s.set_defaults(_fn="scan")

    # vercel
    v = sub.add_parser("vercel", help="Vercel operations")
    vsub = v.add_subparsers(dest="vercel_cmd", required=True)

    vp = vsub.add_parser("projects", help="Vercel projects")
    vpsub = vp.add_subparsers(dest="vercel_projects_cmd", required=True)

    vpl = vpsub.add_parser("list", help="List projects")
    vpl.add_argument("--name-contains", default="")
    vpl.add_argument("--github", choices=["any", "only", "none"], default="any")
    vpl.set_defaults(_fn="vercel_projects_list")

    vpd = vpsub.add_parser("delete", help="Delete projects (filtered)")
    vpd.add_argument("--name-contains", default="")
    vpd.add_argument("--github", choices=["any", "only", "none"], default="any")
    vpd.set_defaults(_fn="vercel_projects_delete")

    ve = vsub.add_parser("env", help="Vercel env vars")
    vesub = ve.add_subparsers(dest="vercel_env_cmd", required=True)

    vel = vesub.add_parser("list", help="List env vars for a project")
    vel.add_argument("--project", required=True, help="Project id or name")
    vel.add_argument("--decrypt", action="store_true", help="Request decrypted values (deprecated in API)")
    vel.add_argument("--git-branch", default="", help="Filter preview vars for a branch")
    vel.add_argument("--show-values", action="store_true", help="Print values (be careful)")
    vel.set_defaults(_fn="vercel_env_list")

    ves = vesub.add_parser("set", help="Set env var (upsert)")
    ves.add_argument("--project", required=True)
    ves.add_argument("--key", required=True)
    ves.add_argument("--value", required=True)
    ves.add_argument("--targets", default="production,preview", help="Comma separated targets")
    ves.add_argument("--type", default="sensitive", help="plain|encrypted|sensitive|system|secret")
    ves.add_argument("--no-upsert", action="store_true")
    ves.set_defaults(_fn="vercel_env_set")

    ved = vesub.add_parser("delete", help="Delete env var by env_id")
    ved.add_argument("--project", required=True)
    ved.add_argument("--env-id", required=True)
    ved.set_defaults(_fn="vercel_env_delete")

    # v0
    z = sub.add_parser("v0", help="v0 operations")
    zsub = z.add_subparsers(dest="v0_cmd", required=True)

    zp = zsub.add_parser("projects", help="v0 projects")
    zpsub = zp.add_subparsers(dest="v0_projects_cmd", required=True)

    zpl = zpsub.add_parser("list", help="List v0 projects")
    zpl.set_defaults(_fn="v0_projects_list")

    zpd = zpsub.add_parser("delete", help="Delete v0 projects (filtered)")
    zpd.add_argument("--name-contains", default="")
    zpd.set_defaults(_fn="v0_projects_delete")

    ze = zsub.add_parser("env", help="v0 env vars")
    zesub = ze.add_subparsers(dest="v0_env_cmd", required=True)

    zel = zesub.add_parser("list", help="List env vars")
    zel.add_argument("--project-id", required=True)
    zel.add_argument("--decrypted", action="store_true")
    zel.add_argument("--show-values", action="store_true")
    zel.set_defaults(_fn="v0_env_list")

    zes = zesub.add_parser("set", help="Set env var (upsert)")
    zes.add_argument("--project-id", required=True)
    zes.add_argument("--key", required=True)
    zes.add_argument("--value", required=True)
    zes.add_argument("--decrypted", action="store_true")
    zes.add_argument("--no-upsert", action="store_true")
    zes.set_defaults(_fn="v0_env_set")

    # local env
    le = sub.add_parser("local-env", help="Local .env* inventory/edit")
    lesub = le.add_subparsers(dest="local_env_cmd", required=True)

    lel = lesub.add_parser("list", help="List keys from local env files")
    lel.add_argument("--show-values", action="store_true")
    lel.set_defaults(_fn="local_env_list")

    les = lesub.add_parser("set", help="Set KEY=VALUE in a specific env file")
    les.add_argument("--file", required=True, help="e.g. .env.local (relative to repo-root ok)")
    les.add_argument("--key", required=True)
    les.add_argument("--value", required=True)
    les.set_defaults(_fn="local_env_set")

    # redis
    r = sub.add_parser("redis", help="Redis cache ops")
    r.add_argument("--patterns", default="project:*,preview:*,cache:*", help="Comma separated patterns")
    r.set_defaults(_fn="redis_clear")

    # supabase
    sb = sub.add_parser("supabase", help="Supabase platform ops")
    sbsub = sb.add_subparsers(dest="supabase_cmd", required=True)

    sbl = sbsub.add_parser("list", help="List Supabase projects (platform API)")
    sbl.set_defaults(_fn="supabase_list")

    sbk = sbsub.add_parser("api-keys", help="Get Supabase api keys (platform API)")
    sbk.add_argument("--project-ref", required=True)
    sbk.add_argument("--reveal", action="store_true", help="Reveal key values (be careful)")
    sbk.set_defaults(_fn="supabase_api_keys")

    sbs = sbsub.add_parser("secrets-cli", help="List secrets via supabase CLI (if installed)")
    sbs.add_argument("--project-ref", required=True)
    sbs.set_defaults(_fn="supabase_secrets_cli")

    return p


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    root = find_repo_root()
    env_files = find_env_files(root)
    load_env_files_into_os(env_files)

    profiles, sqlite_candidates, cfg_path = load_config(root, args.config or None)
    prof = pick_profile(profiles, args.profile)

    # inject sqlite candidates for scan
    setattr(args, "sqlite_candidates", sqlite_candidates)

    fn = getattr(args, "_fn", "")
    if fn == "scan":
        # attach execute/yes into args already present
        cmd_scan(prof, args)
        return

    if fn == "vercel_projects_list":
        cmd_vercel_projects_list(prof, args); return
    if fn == "vercel_projects_delete":
        cmd_vercel_projects_delete(prof, args); return
    if fn == "vercel_env_list":
        cmd_vercel_env_list(prof, args); return
    if fn == "vercel_env_set":
        cmd_vercel_env_set(prof, args); return
    if fn == "vercel_env_delete":
        cmd_vercel_env_delete(prof, args); return

    if fn == "v0_projects_list":
        cmd_v0_projects_list(prof, args); return
    if fn == "v0_projects_delete":
        cmd_v0_projects_delete(prof, args); return
    if fn == "v0_env_list":
        cmd_v0_env_list(prof, args); return
    if fn == "v0_env_set":
        cmd_v0_env_set(prof, args); return

    if fn == "local_env_list":
        cmd_local_env_list(args); return
    if fn == "local_env_set":
        # koppla in global flags:
        args.execute = args.execute or getattr(parser.parse_args(), "execute", False)
        args.yes = args.yes or getattr(parser.parse_args(), "yes", False)
        cmd_local_env_set(args); return

    if fn == "redis_clear":
        cmd_redis_clear(args); return

    if fn == "supabase_list":
        cmd_supabase_list(prof, args); return
    if fn == "supabase_api_keys":
        cmd_supabase_api_keys(prof, args); return
    if fn == "supabase_secrets_cli":
        cmd_supabase_secrets_cli(args); return

    raise SystemExit("❌ Okänt kommando.")


if __name__ == "__main__":
    main()
