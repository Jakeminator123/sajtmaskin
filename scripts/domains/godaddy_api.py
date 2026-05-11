from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

DEFAULT_TIMEOUT = 20

OTE_BASE_URL = "https://api.ote-godaddy.com"
PROD_BASE_URL = "https://api.godaddy.com"


_ENV_LOADED = False


def load_local_env() -> None:
    global _ENV_LOADED
    if _ENV_LOADED:
        return

    repo_env_local = Path(__file__).resolve().parents[2] / ".env.local"
    env_path = Path(__file__).with_name(".env")
    if repo_env_local.exists():
        load_dotenv(repo_env_local, override=False)
    if env_path.exists():
        load_dotenv(env_path, override=False)
    elif not repo_env_local.exists():
        load_dotenv(override=False)

    _ENV_LOADED = True


def _first_env(*names: str) -> str | None:
    for name in names:
        value = os.getenv(name)
        if value:
            return value.strip()
    return None


def get_godaddy_config(environment: str | None = None) -> dict[str, str] | None:
    load_local_env()

    env = (environment or "auto").strip().lower()

    ote = {
        "environment": "ote",
        "base_url": OTE_BASE_URL,
        "key": _first_env("OTE_GODADDY_API", "GODADDY_API_KEY"),
        "secret": _first_env("OTE_GODADDY_SECRET", "GODADDY_API_SECRET"),
    }
    prod = {
        "environment": "prod",
        "base_url": PROD_BASE_URL,
        "key": _first_env("GODADDY_API", "GODADDY_PROD_API_KEY"),
        "secret": _first_env("GODADDY_SECRET", "GODADDY_PROD_SECRET"),
    }

    candidates: list[dict[str, str | None]]
    if env == "ote":
        candidates = [ote]
    elif env in {"prod", "production"}:
        candidates = [prod]
    else:
        candidates = [ote, prod]

    for candidate in candidates:
        if candidate["key"] and candidate["secret"]:
            return {
                "environment": str(candidate["environment"]),
                "base_url": str(candidate["base_url"]),
                "key": str(candidate["key"]),
                "secret": str(candidate["secret"]),
            }

    return None


def _format_price(price_micro: Any, currency: str | None) -> str | None:
    if not isinstance(price_micro, int):
        return None

    amount = price_micro / 1_000_000
    code = currency or "USD"
    return f"{amount:.2f} {code}"


def check_domain_availability(
    domain: str,
    *,
    environment: str | None = None,
    check_type: str = "FAST",
    timeout: int = DEFAULT_TIMEOUT,
) -> dict[str, Any]:
    config = get_godaddy_config(environment)
    if not config:
        return {
            "configured": False,
            "ok": False,
            "environment": None,
            "base_url": None,
            "query_url": None,
            "status_code": None,
            "message": (
                "GoDaddy-nycklar hittades inte i .env. "
                "Stöd finns för OTE_GODADDY_API / OTE_GODADDY_SECRET "
                "och GODADDY_API / GODADDY_SECRET."
            ),
        }

    url = f"{config['base_url']}/v1/domains/available"
    headers = {
        "Authorization": f"sso-key {config['key']}:{config['secret']}",
        "Accept": "application/json",
    }

    try:
        response = requests.get(
            url,
            headers=headers,
            params={"domain": domain, "checkType": check_type},
            timeout=timeout,
        )
    except requests.RequestException as exc:
        return {
            "configured": True,
            "ok": False,
            "environment": config["environment"],
            "base_url": config["base_url"],
            "query_url": url,
            "status_code": None,
            "message": f"Nätverksfel mot GoDaddy API: {exc}",
        }

    try:
        body = response.json()
    except Exception:
        body = {"raw_text": response.text}

    if response.ok and isinstance(body, dict):
        return {
            "configured": True,
            "ok": True,
            "environment": config["environment"],
            "base_url": config["base_url"],
            "query_url": response.url,
            "status_code": response.status_code,
            "domain": body.get("domain") or domain,
            "available": body.get("available"),
            "definitive": body.get("definitive"),
            "currency": body.get("currency"),
            "price_micro": body.get("price"),
            "price_display": _format_price(body.get("price"), body.get("currency")),
            "period": body.get("period"),
            "body": body,
        }

    message = None
    if response.status_code == 401:
        message = "GoDaddy API nekade autentisering. Kontrollera key/secret och att rätt miljö används."
    elif response.status_code == 403:
        message = (
            "GoDaddy API nekade åtkomst. I production kräver Availability API normalt att kontot "
            "uppfyller GoDaddys åtkomstkrav."
        )
    elif response.status_code == 429:
        message = "GoDaddy API rate limit uppnådd. GoDaddy anger 60 requests per minut och endpoint."
    elif isinstance(body, dict):
        message = body.get("message") or body.get("code")

    return {
        "configured": True,
        "ok": False,
        "environment": config["environment"],
        "base_url": config["base_url"],
        "query_url": response.url,
        "status_code": response.status_code,
        "message": message or "Okänt fel från GoDaddy API.",
        "body": body,
    }
