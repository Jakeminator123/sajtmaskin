"""Safe, provider-specific messages. Only explicit admin checks contact billing APIs."""

import json
import math
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from provider_config import provider_key


class ProviderIssue(ValueError):
    def __init__(self, provider, reason):
        self.provider = provider
        self.reason = reason
        super().__init__(f"{provider}: {reason}")


def classify(provider, status, detail):
    evidence = str(detail).lower()
    if status == 402 or any(code in evidence for code in (
        "insufficient_quota", "quota_exceeded", "credit_balance_exhausted",
        "billing_hard_limit_reached", "insufficient funds", "insufficient balance",
        "insufficient credits", "not enough credits", "low balance",
    )):
        reason = "Kontot saknar tillgängliga krediter eller har nått sin betalgräns."
    elif "missing_permissions" in evidence or "missing permission" in evidence:
        reason = ("Nyckeln saknar user_read för att läsa abonnemanget. Röstsyntesen har separat behörighet."
                  if "user_read" in evidence else "Nyckeln saknar behörighet för anropet.")
    elif status == 401:
        reason = "API-nyckeln avvisades."
    elif status == 403:
        reason = "Nyckeln saknar behörighet för anropet."
    elif status == 429:
        reason = "För många samtidiga eller täta anrop. Prova igen om en stund."
    elif status == 404:
        reason = "Den begärda modellen eller resursen är inte tillgänglig för nyckeln."
    else:
        reason = "Tjänsten svarade med ett fel. Saldo kunde inte fastställas."
    return ProviderIssue(provider, reason)


def read_json(provider, request, *, timeout):
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.load(response)
    except urllib.error.HTTPError as err:
        with err:
            raise classify(provider, err.code, err.read(8192).decode(errors="replace")) from None
    except (OSError, ValueError):
        raise ProviderIssue(provider, "Svaret kunde inte läsas. Kontrollera anslutningen.") from None


def checked_key(provider, name):
    try:
        return provider_key(name)
    except RuntimeError:
        raise ProviderIssue(provider, "API-nyckel saknas i den här studions miljö.") from None


def subscription():
    req = urllib.request.Request("https://api.elevenlabs.io/v1/user/subscription",
        headers={"xi-api-key": checked_key("ElevenLabs", "ELEVENLABS_API_KEY")})
    data = read_json("ElevenLabs", req, timeout=6)
    used, limit = data["character_count"], data["character_limit"]
    if not all(isinstance(n, int) and n >= 0 for n in (used, limit)):
        raise ValueError("invalid credit counts")
    remaining = max(0, limit - used)
    note = " Debitering utöver paketet är tillåten." if data.get("allowed_to_extend_character_limit") else ""
    return f"{remaining:,} av {limit:,} inkluderade krediter kvar.".replace(",", " ") + note


def balance():
    req = urllib.request.Request("https://api.runpod.io/v2/billing/balance",
        headers={"Authorization": "Bearer " + checked_key("RunPod", "RUNPOD_API_KEY"),
                 "User-Agent": "Alina-Studio/1.0"})
    data = read_json("RunPod", req, timeout=6)
    amount = data["balanceAmount"]
    if not isinstance(amount, (int, float)) or not math.isfinite(amount):
        raise ValueError("invalid balance")
    note = " Fakturakonto." if data.get("billingMode") == "POSTPAID" else ""
    return f"Kontosaldo {amount:.2f} USD.".replace(".", ",", 1) + note


def openai_probe():
    req = urllib.request.Request("https://api.openai.com/v1/responses", data=json.dumps({
        "model": "gpt-4o-mini", "input": "Reply OK.", "max_output_tokens": 16, "store": False,
    }).encode(), headers={"Authorization": "Bearer " + checked_key("OpenAI", "OPENAI_API_KEY"),
                          "Content-Type": "application/json"})
    data = read_json("OpenAI", req, timeout=12)
    if data.get("error"):
        raise classify("OpenAI", None, data["error"])
    if data.get("status") != "completed":
        raise ProviderIssue("OpenAI", "Modellprovet slutfördes inte. Saldo okänt.")
    return "Den här studions nyckel genomförde ett modellprov. Exakt saldo lämnas inte ut."


def safe_result(check):
    try:
        return check()
    except ProviderIssue as issue:
        return issue.reason
    except (KeyError, TypeError, ValueError):
        return "Inget säkert saldobesked från tjänsten."


def site_gateway():
    req = urllib.request.Request("https://sajtmaskin.se/api/openclaw/health",
                                 headers={"User-Agent": "Alina-Studio/1.0"})
    try:
        status = read_json("OpenClaw", req, timeout=6)
    except ProviderIssue:
        return "Sajtens OpenClaw kunde inte bekräftas. Kontrollera gatewayen i Render. Fakturastatus okänd."
    if status.get("status") == "ok":
        return "Sajtens befintliga OpenClaw svarar. Render-fakturor visas i driftkontot."
    return "Sajtens gateway rapporterar ett driftfel. Fakturastatus okänd."


def accounts(hosted):
    with ThreadPoolExecutor(max_workers=3) as pool:
        gpu, voice, gateway = pool.map(safe_result, (balance, subscription, site_gateway))
    return {"RunPod": gpu, "ElevenLabs": voice, "OpenClaw / Render": gateway,
            "Talserver": "Studions fjärrserver svarar." if hosted else "Studion körs på din dator."}
