#!/usr/bin/env python3
"""
Interactive domain availability + price lookup via GoDaddy Domains API.

OBS:
- Nycklarna nedan är hårdkodade eftersom du bad om det (och du sa att de är fejk).
- I praktiken bör du läsa dem från miljövariabler och aldrig committa dem i git.

Kör:
  python godaddy_domain_lookup.py
"""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlparse
import sys
import requests

# ----- HÅRDKODADE (FEJK) UPPGIFTER ENLIGT DIG -----
GODADDY_API_KEY = "3mM44YwfEJai81_Vrm7CjDxLuyKLf6R9oFNSK"
GODADDY_API_SECRET = "PaW4zaEsAfVVxDePUmrJ3K"

# Startmiljö: "ote" (test) eller "prod" (production)
ENVIRONMENT = "ote"


@dataclass
class Config:
    env: str  # "ote" or "prod"

    @property
    def base_url(self) -> str:
        if self.env == "ote":
            return "https://api.ote-godaddy.com/v1"
        if self.env == "prod":
            return "https://api.godaddy.com/v1"
        raise ValueError("env must be 'ote' or 'prod'")


HELP = """Kommandon:
  <domän eller URL>   Kolla availability + pris (t.ex. example.se eller https://example.com/path)
  a.se, b.com         Flera i samma rad (kommaseparerat)
  env                 Växla miljö (ote <-> prod)
  tlds                Visa om .se och .com stöds i nuvarande miljö (ote/prod)
  help                Visa hjälp
  q / quit / exit     Avsluta

Notis:
  GoDaddy vill ha "registrable domain" (example.se) - inte subdomäner som www.example.se.
"""


def _host_from_input(user_input: str) -> str:
    """
    Plockar ut host från:
      - example.se
      - www.example.se
      - https://www.example.se/path
      - example.se:8080/path
    """
    s = user_input.strip()
    if not s:
        raise ValueError("Tom input")

    # Om det ser ut som URL utan scheme men med path/query, lägg på http:// för urlparse
    if "://" not in s and ("/" in s or "?" in s or "#" in s):
        s = "http://" + s

    parsed = urlparse(s)

    # urlparse("example.se") -> path="example.se" netloc=""
    host = parsed.netloc if parsed.netloc else parsed.path
    host = host.strip().lower()

    # Om host fortfarande råkar innehålla path-delar
    if "/" in host:
        host = host.split("/", 1)[0]

    # Ta bort port
    if ":" in host:
        host = host.split(":", 1)[0]

    host = host.rstrip(".")
    if not host or " " in host:
        raise ValueError(f"Inte en domän/URL: {user_input!r}")

    # IDNA (å/ä/ö-domäner)
    try:
        host = host.encode("idna").decode("ascii")
    except Exception:
        pass

    return host


def extract_registrable_domain(user_input: str) -> str:
    """
    GoDaddy /domains/available vill ha "registrable domain" (SLD+TLD),
    inte subdomäner.

    För ditt fokus (.se och .com) räcker:
      - strip 'www.'
      - om fler än 2 labels: ta sista 2 (ex: a.b.example.se -> example.se)
    """
    host = _host_from_input(user_input)

    if host.startswith("www."):
        host = host[4:]

    parts = [p for p in host.split(".") if p]
    if len(parts) < 2:
        raise ValueError(f"Inte en giltig domän: {user_input!r}")

    # Om subdomäner finns, behåll sista två labels (passar .se och .com)
    if len(parts) > 2:
        host = ".".join(parts[-2:])
    else:
        host = ".".join(parts)

    return host


def request_json(method: str, url: str, headers: dict, params: dict | None = None) -> dict:
    r = requests.request(method, url, headers=headers, params=params, timeout=20)
    if r.status_code >= 400:
        raise RuntimeError(f"HTTP {r.status_code}: {r.text.strip()}")
    return r.json()


def check_domain(cfg: Config, domain: str, key: str, secret: str) -> dict:
    """
    GoDaddy: GET /v1/domains/available?domain=...&checkType=FULL
    """
    url = f"{cfg.base_url}/domains/available"
    headers = {
        "Authorization": f"sso-key {key}:{secret}",
        "Accept": "application/json",
    }
    params = {"domain": domain, "checkType": "FULL"}
    return request_json("GET", url, headers=headers, params=params)


def list_tlds(cfg: Config, key: str, secret: str) -> list[dict]:
    """
    GoDaddy: GET /v1/domains/tlds  (vilka TLDs som är konfigurerade/aktiva i miljön)
    """
    url = f"{cfg.base_url}/domains/tlds"
    headers = {
        "Authorization": f"sso-key {key}:{secret}",
        "Accept": "application/json",
    }
    data = request_json("GET", url, headers=headers)
    if isinstance(data, list):
        return data
    return []


def format_price(price_micro: int | None, currency: str | None) -> str:
    # GoDaddy returnerar ofta pris i "micro units" (valuta * 1_000_000)
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


def main() -> None:
    key = GODADDY_API_KEY
    secret = GODADDY_API_SECRET

    if not key or not secret:
        print("Saknar API-nycklar i scriptet.", file=sys.stderr)
        sys.exit(2)

    cfg = Config(env=ENVIRONMENT)

    print("GoDaddy Domain Lookup (availability + price)")
    print(f"Environment: {cfg.env}  Base URL: {cfg.base_url}")
    print(HELP)

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
        if cmd == "env":
            cfg.env = "prod" if cfg.env == "ote" else "ote"
            print(f"Switched environment to: {cfg.env}  Base URL: {cfg.base_url}")
            continue
        if cmd == "tlds":
            try:
                tlds = list_tlds(cfg, key, secret)
                codes = {t.get("name", "").lower() for t in tlds if isinstance(t, dict)}
                print(f"\nTLD count: {len(codes)}")
                print(f".se supported:  {'se' in codes}")
                print(f".com supported: {'com' in codes}\n")
            except Exception as e:
                print(f"\nError: {e}\n")
            continue

        parts = [p.strip() for p in raw.split(",") if p.strip()]
        for p in parts:
            try:
                domain = extract_registrable_domain(p)
                data = check_domain(cfg, domain, key, secret)
                print_result(data)
            except Exception as e:
                print(f"\nInput: {p}\nError: {e}")
                print("Tips: skriv utan 'www.' (t.ex. example.se)\n")

        print()


if __name__ == "__main__":
    main()
