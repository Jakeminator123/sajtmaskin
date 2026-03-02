#!/usr/bin/env python3
"""
GoDaddy: interaktiv domän-koll (availability + pris) + TLD-supportkontroll.

Läser credentials från .env/.env.local genom att söka uppåt från scriptets mapp:
  - <script_dir>/.env
  - <script_dir>/.env.local
  - <parent>/.env
  - <parent>/.env.local
  - ... hela vägen upp till root

Precedens:
  1) Riktiga OS-env vars (t.ex. satta i PowerShell) vinner alltid
  2) .env-filer (närmare scriptet vinner över längre bort)
  3) .env.local laddas efter .env och kan override:a

För Production (prod):
  GODADY_PROD_API_KEY, GODADY_PROD_SECRET
  (stödjer även GODADDY_PROD_API_KEY, GODADDY_PROD_SECRET)

För OTE (ote):
  GODADY_OTE_API_KEY, GODADY_OTE_SECRET
  (stödjer även GODADDY_OTE_API_KEY, GODADDY_OTE_SECRET)

Krav:
  pip install requests

Kör:
  python godady.py
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse
import os
import sys
import requests


HELP = """Kommandon:
  <domän eller URL>   Kolla availability + pris (t.ex. example.com eller https://example.com/path)
  a.com, b.se         Flera i samma rad (kommaseparerat)
  env                 Växla miljö (ote <-> prod) och reloadar TLD-listan
  prod                Sätt miljö till prod (production)
  ote                 Sätt miljö till ote (test)
  tlds                Visar om .se och .com stöds i aktuell miljö (om /domains/tlds är tillgängligt)
  reload              Ladda om TLD-listan manuellt
  where               Visar vilken miljö som är aktiv + om creds finns
  help                Visa hjälp
  q / quit / exit     Avsluta
"""


# -------------------------
# .env loader (upwards)
# -------------------------

_DOTENV_LOADED = False
_DOTENV_FILES_LOADED: list[str] = []
_OS_ENV_KEYS_SNAPSHOT: set[str] = set()


def _parse_env_file(path: Path) -> dict[str, str]:
    """
    Enkel .env-parser:
      KEY=value
      export KEY=value
      # comments
    Stödjer enkla citattecken runt value.
    """
    out: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        if s.lower().startswith("export "):
            s = s[7:].strip()
        if "=" not in s:
            continue
        k, v = s.split("=", 1)
        k = k.strip()
        v = v.strip()

        if not k:
            continue

        # Trim quotes (vanligaste fallen)
        if len(v) >= 2 and ((v[0] == v[-1] == '"') or (v[0] == v[-1] == "'")):
            v = v[1:-1]

        out[k] = v
    return out


def load_dotenv_upwards(start_dir: Path | None = None) -> list[str]:
    """
    Letar efter .env och .env.local i start_dir och alla parents.
    Närmare scriptet ska vinna => vi laddar från root -> start_dir så senare override:ar.
    OS-env ska vinna => vi override:ar aldrig keys som fanns i os.environ från början.
    """
    global _DOTENV_LOADED, _DOTENV_FILES_LOADED, _OS_ENV_KEYS_SNAPSHOT

    if _DOTENV_LOADED:
        return _DOTENV_FILES_LOADED

    _DOTENV_LOADED = True
    _OS_ENV_KEYS_SNAPSHOT = set(os.environ.keys())

    if start_dir is None:
        start_dir = Path(__file__).resolve().parent
    else:
        start_dir = start_dir.resolve()

    # Bygg kedja root -> start_dir
    dirs: list[Path] = [start_dir] + list(start_dir.parents)
    dirs = list(reversed(dirs))  # root ... start_dir

    loaded_files: list[str] = []

    for d in dirs:
        for fname in (".env", ".env.local"):
            p = d / fname
            if not p.exists() or not p.is_file():
                continue

            env_map = _parse_env_file(p)

            # Sätt/override endast om key inte var en "riktig" OS-env key från början
            for k, v in env_map.items():
                if k in _OS_ENV_KEYS_SNAPSHOT:
                    continue
                os.environ[k] = v  # allow override between files

            loaded_files.append(str(p))

    _DOTENV_FILES_LOADED = loaded_files
    return loaded_files


# -------------------------
# GoDaddy script
# -------------------------

@dataclass
class Config:
    env: str  # "ote" or "prod"
    supported_tlds: set[str] = field(default_factory=set)

    @property
    def base_url(self) -> str:
        if self.env == "ote":
            return "https://api.ote-godaddy.com/v1"
        if self.env == "prod":
            return "https://api.godaddy.com/v1"
        raise ValueError("env must be 'ote' or 'prod'")


def _get_env(name: str) -> str | None:
    v = os.getenv(name)
    if v is None:
        return None
    v = v.strip()
    return v if v else None


def get_credentials_for_env(env: str) -> tuple[str, str]:
    """
    Returnerar (key, secret) för aktuell miljö.
    """
    load_dotenv_upwards()

    if env == "prod":
        key = (
            _get_env("GODADY_PROD_API_KEY")
            or _get_env("GODADDY_PROD_API_KEY")
            or _get_env("GODADY_PROD_KEY")
            or _get_env("GODADDY_PROD_KEY")
        )
        secret = (
            _get_env("GODADY_PROD_SECRET")
            or _get_env("GODADDY_PROD_SECRET")
        )
    elif env == "ote":
        key = (
            _get_env("GODADY_OTE_API_KEY")
            or _get_env("GODADDY_OTE_API_KEY")
            or _get_env("GODADY_OTE_KEY")
            or _get_env("GODADDY_OTE_KEY")
        )
        secret = (
            _get_env("GODADY_OTE_SECRET")
            or _get_env("GODADDY_OTE_SECRET")
        )
    else:
        raise ValueError("env must be 'ote' or 'prod'")

    # Fallback: generiska vars
    if not key:
        key = _get_env("GODADDY_KEY") or _get_env("GODADY_API_KEY") or _get_env("GODADDY_API_KEY")
    if not secret:
        secret = _get_env("GODADDY_SECRET") or _get_env("GODADY_API_SECRET") or _get_env("GODADDY_API_SECRET")

    if not key or not secret:
        raise RuntimeError(
            f"Saknar API-credentials för env='{env}'.\n"
            f"För prod: GODADY_PROD_API_KEY + GODADY_PROD_SECRET\n"
            f"För ote:  GODADY_OTE_API_KEY + GODADY_OTE_SECRET\n"
            f"Eller generiskt: GODADDY_KEY + GODADDY_SECRET"
        )

    return key, secret


def creds_present_for_env(env: str) -> bool:
    try:
        get_credentials_for_env(env)
        return True
    except Exception:
        return False


def choose_default_env() -> str:
    """
    Välj startmiljö:
      1) GODADDY_ENV / GODADY_ENV om satt (ote/prod)
      2) prod om prod-creds finns
      3) annars ote
    """
    load_dotenv_upwards()

    forced = (_get_env("GODADDY_ENV") or _get_env("GODADY_ENV") or "").lower()
    if forced in ("ote", "prod"):
        return forced

    return "prod" if creds_present_for_env("prod") else "ote"


def auth_headers(key: str, secret: str) -> dict:
    return {"Authorization": f"sso-key {key}:{secret}", "Accept": "application/json"}


def request_json(method: str, url: str, headers: dict, params: dict | None = None) -> object:
    r = requests.request(method, url, headers=headers, params=params, timeout=25)

    if r.status_code == 403:
        raise RuntimeError(
            "HTTP 403 ACCESS_DENIED: Ditt GoDaddy-konto har inte behörighet till denna API-del i Production.\n"
            "Detta är ett kontokrav/policy, inte ett kodfel."
        )

    if r.status_code >= 400:
        raise RuntimeError(f"HTTP {r.status_code}: {r.text.strip()}")

    return r.json()


def _host_from_input(user_input: str) -> str:
    s = user_input.strip()
    if not s:
        raise ValueError("Tom input")

    if "://" not in s and ("/" in s or "?" in s or "#" in s):
        s = "http://" + s

    parsed = urlparse(s)
    host = parsed.netloc if parsed.netloc else parsed.path
    host = host.strip().lower()

    if "/" in host:
        host = host.split("/", 1)[0]
    if ":" in host:
        host = host.split(":", 1)[0]

    host = host.rstrip(".")
    if host.startswith("www."):
        host = host[4:]

    try:
        host = host.encode("idna").decode("ascii")
    except Exception:
        pass

    if "." not in host or " " in host:
        raise ValueError(f"Inte en domän/URL: {user_input!r}")

    return host


def extract_registrable_domain(user_input: str) -> str:
    """
    För fokus .se/.com: om subdomän finns -> ta sista två labels.
    """
    host = _host_from_input(user_input)
    parts = [p for p in host.split(".") if p]
    if len(parts) < 2:
        raise ValueError(f"Inte en giltig domän: {user_input!r}")
    if len(parts) > 2:
        return ".".join(parts[-2:])
    return ".".join(parts)


def tld_of_domain(domain: str) -> str:
    return domain.lower().split(".")[-1]


def load_supported_tlds(cfg: Config, key: str, secret: str) -> None:
    """
    GET /v1/domains/tlds
    (Om 403 i prod: hoppa över, fortsätt utan TLD-lista)
    """
    url = f"{cfg.base_url}/domains/tlds"
    try:
        data = request_json("GET", url, headers=auth_headers(key, secret))
    except RuntimeError as e:
        cfg.supported_tlds = set()
        print(f"\nInfo: hoppar över /domains/tlds: {e}\n")
        return

    tlds: set[str] = set()
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                name = (item.get("name") or "").strip().lower()
                if name:
                    tlds.add(name)

    cfg.supported_tlds = tlds


def show_tld_support(cfg: Config) -> None:
    if not cfg.supported_tlds:
        print("\nTLD-lista är tom (kunde inte laddas eller API spärrad).")
        return
    print(f"\nTLD count: {len(cfg.supported_tlds)}")
    print(f".se supported:  {'se' in cfg.supported_tlds}")
    print(f".com supported: {'com' in cfg.supported_tlds}\n")


def check_domain(cfg: Config, domain: str, key: str, secret: str) -> dict:
    """
    GET /v1/domains/available?domain=...&checkType=FULL
    """
    url = f"{cfg.base_url}/domains/available"
    params = {"domain": domain, "checkType": "FULL"}
    data = request_json("GET", url, headers=auth_headers(key, secret), params=params)
    if not isinstance(data, dict):
        raise RuntimeError(f"Oväntat svar: {data!r}")
    return data


def format_price(price_micro: int | None, currency: str | None) -> str:
    if price_micro is None or currency is None:
        return "N/A"
    return f"{price_micro / 1_000_000:.2f} {currency}"


def print_result(data: dict) -> None:
    domain = data.get("domain")
    available = data.get("available")
    definitive = data.get("definitive")
    period = data.get("period")
    currency = data.get("currency")
    price_micro = data.get("price")
    reason = data.get("reason")

    print(f"\nDomain:     {domain}")
    print(f"Available:  {available}")
    print(f"Definitive: {definitive}")
    if period is not None:
        print(f"Period:     {period} year(s)")
    print(f"Price:      {format_price(price_micro, currency)}")
    if reason:
        print(f"Reason:     {reason}")


def switch_env(cfg: Config, new_env: str) -> tuple[str, str]:
    cfg.env = new_env
    print(f"Switched environment to: {cfg.env}  Base URL: {cfg.base_url}")

    key, secret = get_credentials_for_env(cfg.env)
    load_supported_tlds(cfg, key, secret)
    return key, secret


def main() -> None:
    # Ladda .env/.env.local från script-mapp och uppåt direkt
    loaded = load_dotenv_upwards()
    # (valfritt) visa vilka filer som hittades
    if loaded:
        print("Loaded env files (upwards):")
        for p in loaded[-5:]:  # visa max 5 sista (närmast)
            print(f"  {p}")
        if len(loaded) > 5:
            print(f"  ... +{len(loaded) - 5} more")
        print()

    cfg = Config(env=choose_default_env())

    print("GoDaddy Domain Lookup (availability + price)")
    print(f"Environment: {cfg.env}  Base URL: {cfg.base_url}")
    print(HELP)

    # Load creds for current env
    try:
        key, secret = get_credentials_for_env(cfg.env)
    except Exception as e:
        print(str(e), file=sys.stderr)
        sys.exit(2)

    # Preload TLD list (om möjligt)
    load_supported_tlds(cfg, key, secret)

    while True:
        try:
            raw = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return

        if not raw:
            continue

        cmd = raw.lower()
        if cmd in ("q", "quit", "exit"):
            return
        if cmd == "help":
            print(HELP)
            continue
        if cmd == "where":
            print(f"\nActive env: {cfg.env}")
            print(f"OTE creds present:  {creds_present_for_env('ote')}")
            print(f"PROD creds present: {creds_present_for_env('prod')}")
            print(f"Base URL: {cfg.base_url}\n")
            continue

        if cmd == "env":
            new_env = "prod" if cfg.env == "ote" else "ote"
            try:
                key, secret = switch_env(cfg, new_env)
            except Exception as e:
                print(f"Error: {e}\n")
            continue

        if cmd == "prod":
            try:
                key, secret = switch_env(cfg, "prod")
            except Exception as e:
                print(f"Error: {e}\n")
            continue

        if cmd == "ote":
            try:
                key, secret = switch_env(cfg, "ote")
            except Exception as e:
                print(f"Error: {e}\n")
            continue

        if cmd == "reload":
            try:
                load_supported_tlds(cfg, key, secret)
                print("Reloaded TLD list.")
            except Exception as e:
                cfg.supported_tlds = set()
                print(f"Error: {e}")
            continue

        if cmd == "tlds":
            show_tld_support(cfg)
            continue

        # Domain checks
        parts = [p.strip() for p in raw.split(",") if p.strip()]
        for p in parts:
            try:
                domain = extract_registrable_domain(p)
                tld = tld_of_domain(domain)

                # Om vi HAR en tld-lista, kan vi stoppa tidigt.
                # Om listan är tom (t.ex. pga 403), låt anropet avgöra.
                if cfg.supported_tlds and tld not in cfg.supported_tlds:
                    print(
                        f"\nDomain: {domain}\n"
                        f"Error: TLD '.{tld}' är inte aktiverad i denna GoDaddy-miljö ({cfg.env}).\n"
                        f"Kör 'tlds' för att se stöd.\n"
                    )
                    continue

                data = check_domain(cfg, domain, key, secret)
                print_result(data)

            except Exception as e:
                print(f"\nInput: {p}\nError: {e}\n")

        print()


if __name__ == "__main__":
    main()
