#!/usr/bin/env python3
"""
flytt_grazon.py - Grazon-berikare for Skatteverkets flytt anmalan

Kombinerar flera kallor for att maximera autoifyllning och konfidens:

  AKTIVA KALLOR (fungerar direkt):
    [1] PAP/API Lite      - postnummer -> postort, GPS, kommundata
    [2] Eniro Company     - fastighetsagare (foretag)

  KRAV API-NYCKEL / AVTAL (stubar - aktiveras nar du skaffar nyckel):
    [3] Eniro Person      - namn+plats -> personlista  (krav uppgradering)
    [4] Eniro Number      - telefon -> person           (krav uppgradering)
    [5] PersonKontakt     - telefon/personnr -> adress  (krav avtal) BAST ALTERNATIV

Kora:
  python inlogg/flytt_grazon.py
  python inlogg/flytt_grazon.py --json inlogg/test_jakob.json

Miljovariabler (satt i .env eller systemet):
  PAP_API_KEY             - gratis fran papilite.se
  ENIRO_API_KEY           - finns (trial) / uppgradera pa api.eniro.com
  PERSONKONTAKT_API_KEY   - kontakta info@marknadsinformation.se (REKOMMENDERAS)
"""

from __future__ import annotations
import argparse
import difflib
import json
import os
import re
import sys
from typing import Any

try:
    import requests
except ImportError:
    print("requests saknas. Kor: pip install requests")
    sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))
except ImportError:
    pass

# ---------------------------------------------------------------------------
# API-konfig
# ---------------------------------------------------------------------------
PAP_KEY      = re.sub(r"^=+", "", os.environ.get("PAP_API_KEY", "").strip())
ENIRO_KEY    = os.environ.get("ENIRO_API_KEY", "").strip()
PKONTAKT_KEY = os.environ.get("PERSONKONTAKT_API_KEY", "").strip()

TIMEOUT = 6


# ---------------------------------------------------------------------------
# 1. PAP/API Lite  (AKTIV)
# ---------------------------------------------------------------------------
def pap_lookup_postort(postnummer: str) -> dict[str, str]:
    """Postnummer -> postort, kommun, lan. Gratis med nyckel."""
    pnr = re.sub(r"\s+", "", postnummer)
    if not PAP_KEY:
        return _pap_fallback(pnr)
    url = f"https://api.papapi.se/lite/?query={pnr}&format=json&apikey={PAP_KEY}"
    try:
        r = requests.get(url, timeout=TIMEOUT)
        if r.status_code == 200:
            data = r.json()
            results = (data.get("results") or [])
            if results:
                item = results[0]
                return {
                    "postort":  item.get("city", ""),
                    "kommun":   item.get("county", ""),
                    "lan":      item.get("state", ""),
                    "lat":      item.get("latitude", ""),
                    "lng":      item.get("longitude", ""),
                    "_source":  "PAP API",
                }
    except Exception as e:
        _log(f"PAP fel: {e}")
    return _pap_fallback(pnr)


_FALLBACK: dict[str, str] = {
    "111": "Stockholm", "113": "Stockholm", "114": "Stockholm",
    "115": "Stockholm", "116": "Stockholm", "117": "Stockholm",
    "118": "Stockholm", "119": "Stockholm",
    "120": "Arsta",     "121": "Johanneshov","122": "Enskede",
    "131": "Nacka",     "141": "Huddinge",  "161": "Bromma",
    "171": "Solna",     "172": "Sundbyberg","175": "Jarfalla",
    "181": "Lidingo",   "183": "Taby",
    "211": "Malmo",     "212": "Malmo",     "213": "Malmo",
    "221": "Lund",      "222": "Lund",      "231": "Helsingborg",
    "411": "Goteborg",  "412": "Goteborg",  "413": "Goteborg",
    "414": "Goteborg",  "415": "Goteborg",  "416": "Goteborg",
    "431": "Molndal",   "433": "Partille",
    "501": "Boras",     "502": "Boras",
    "581": "Linkoping", "582": "Linkoping",
    "601": "Norrkoping","602": "Norrkoping",
    "651": "Karlstad",  "652": "Karlstad",
    "721": "Vasteras",  "722": "Vasteras",
    "751": "Uppsala",   "752": "Uppsala",   "753": "Uppsala",
    "801": "Gavle",     "802": "Gavle",
    "851": "Sundsvall", "852": "Sundsvall",
    "861": "Ostersund",
    "901": "Umea",      "902": "Umea",
    "931": "Skelleftea","941": "Pitea",
    "971": "Lulea",     "972": "Lulea",
}

def _pap_fallback(pnr: str) -> dict[str, str]:
    prefix = pnr[:3] if len(pnr) >= 3 else ""
    ort = _FALLBACK.get(prefix, "")
    return {"postort": ort, "_source": "fallback" if ort else "okand"}


# ---------------------------------------------------------------------------
# 2. Eniro Company  (AKTIV med trial-nyckel)
# ---------------------------------------------------------------------------
def eniro_company_search(query: str, where: str = "sverige") -> list[dict]:
    """Soker foretag - bra for att slå upp fastighetsagare."""
    if not ENIRO_KEY:
        return []
    url = "https://api.eniro.com/cs/v2/search/company"
    params = {"q": query, "where": where, "api_key": ENIRO_KEY, "country": "se"}
    try:
        r = requests.get(url, params=params, timeout=TIMEOUT)
        if r.status_code == 200:
            data = r.json()
            results = []
            for item in (data.get("companies") or [])[:5]:
                results.append({
                    "name":    item.get("name", ""),
                    "address": item.get("address", {}).get("street", ""),
                    "city":    item.get("address", {}).get("city", ""),
                    "phone":   (item.get("phones") or [{}])[0].get("number", ""),
                    "_source": "Eniro Company",
                })
            return results
        elif r.status_code == 403:
            _log("Eniro: 403 Forbidden - kontrollera API-nyckel")
    except Exception as e:
        _log(f"Eniro Company fel: {e}")
    return []


# ---------------------------------------------------------------------------
# 3. Eniro Person Search  (STUB - krav uppgradering)
# ---------------------------------------------------------------------------
def eniro_person_search(name: str, where: str = "stockholm") -> list[dict]:
    """
    Soker person pa namn + plats. Krav betald plan pa api.eniro.com (fran 990 kr/man).
    Trial-plan ger HTTP 403 pa detta endpoint.
    """
    if not ENIRO_KEY:
        _log("Eniro: Ingen nyckel")
        return []
    url = "https://api.eniro.com/cs/v2/search/person"
    params = {"q": name, "where": where, "api_key": ENIRO_KEY, "country": "se"}
    try:
        r = requests.get(url, params=params, timeout=TIMEOUT)
        if r.status_code == 200:
            persons = r.json().get("persons") or []
            results = []
            for p in persons[:10]:
                results.append({
                    "name":       p.get("name", ""),
                    "gatuadress": p.get("address", {}).get("street", ""),
                    "postnummer": re.sub(r"\s+", "", p.get("address", {}).get("zipCode", "")),
                    "postort":    p.get("address", {}).get("city", ""),
                    "telefonnummer": (p.get("phones") or [{}])[0].get("number", ""),
                    "_source":    "Eniro Person",
                })
            return results
        elif r.status_code == 403:
            _log("Eniro Person: 403 - krav uppgradering fran trial till betald plan")
    except Exception as e:
        _log(f"Eniro Person fel: {e}")
    return []


# ---------------------------------------------------------------------------
# 4. Eniro Number (STUB - krav uppgradering)
# ---------------------------------------------------------------------------
def eniro_number_lookup(phone: str) -> dict | None:
    """
    Vem ager telefonnummer? Krav betald plan (ej trial).
    """
    if not ENIRO_KEY:
        return None
    phone_clean = re.sub(r"[^\d+]", "", phone)
    url = "https://api.eniro.com/cs/v2/search/company"
    params = {"q": phone_clean, "api_key": ENIRO_KEY, "country": "se"}
    try:
        r = requests.get(url, params=params, timeout=TIMEOUT)
        if r.status_code == 200:
            items = r.json().get("persons") or r.json().get("companies") or []
            if items:
                p = items[0]
                return {
                    "name":       p.get("name", ""),
                    "gatuadress": p.get("address", {}).get("street", ""),
                    "postort":    p.get("address", {}).get("city", ""),
                    "_source":    "Eniro Number",
                }
        elif r.status_code == 403:
            _log("Eniro Number: 403 - krav uppgradering fran trial")
    except Exception as e:
        _log(f"Eniro Number fel: {e}")
    return None


# ---------------------------------------------------------------------------
# 5. PersonKontakt (STUB - krav avtal med marknadsinformation.se)
# ---------------------------------------------------------------------------
def personkontakt_phone_lookup(phone: str) -> dict | None:
    """
    Telefonnummer -> namn, adress, personnummer.
    Krav: Kontakta info@marknadsinformation.se for API-atkomst.
    Dok: https://apidocs.marknadsinformation.se/
    """
    if not PKONTAKT_KEY:
        _log("PersonKontakt: Ingen nyckel - hoppar over")
        return None
    phone_clean = re.sub(r"[^\d+]", "", phone)
    url = "https://api.marknadsinformation.se/v1/person/lookup"
    headers = {"Authorization": f"Bearer {PKONTAKT_KEY}"}
    params  = {"phone": phone_clean}
    try:
        r = requests.get(url, headers=headers, params=params, timeout=TIMEOUT)
        if r.status_code == 200:
            p = r.json()
            return {
                "name":        p.get("name", ""),
                "gatuadress":  p.get("address", {}).get("street", ""),
                "postnummer":  re.sub(r"\s+", "", p.get("address", {}).get("zipCode", "")),
                "postort":     p.get("address", {}).get("city", ""),
                "personnummer": p.get("personalNumber", ""),
                "_source":     "PersonKontakt",
            }
        else:
            _log(f"PersonKontakt: HTTP {r.status_code}")
    except Exception as e:
        _log(f"PersonKontakt fel: {e}")
    return None


# ---------------------------------------------------------------------------
# Fuzzy matching - narrowing down
# ---------------------------------------------------------------------------
def fuzzy_score(a: str, b: str) -> float:
    """Similarity 0.0-1.0 mellan tva strangar (case-insensitivt)."""
    return difflib.SequenceMatcher(None, a.lower(), b.lower()).ratio()


def narrow_down(
    candidates: list[dict],
    ref_name:   str = "",
    ref_city:   str = "",
    ref_phone:  str = "",
) -> list[tuple[float, dict]]:
    """
    Rankar kandidater mot kand information.
    Returnerar sorterad lista [(score, candidate), ...].
    """
    scored = []
    for c in candidates:
        score = 0.0
        reasons = []

        if ref_name and c.get("name"):
            s = fuzzy_score(ref_name, c["name"])
            score += s * 0.50
            reasons.append(f"namn={s:.0%}")

        if ref_city and c.get("postort"):
            s = fuzzy_score(ref_city, c["postort"])
            score += s * 0.30
            reasons.append(f"stad={s:.0%}")

        if ref_phone and c.get("telefonnummer"):
            s = fuzzy_score(ref_phone, c.get("telefonnummer", ""))
            score += s * 0.20
            reasons.append(f"tel={s:.0%}")

        c["_score_reasons"] = ", ".join(reasons)
        scored.append((round(score, 3), c))

    scored.sort(key=lambda x: x[0], reverse=True)
    return scored


# ---------------------------------------------------------------------------
# Huvud-orchestrering
# ---------------------------------------------------------------------------
def berika(
    namn: str = "",
    telefon: str = "",
    postnummer: str = "",
    stad: str = "",
    personnummer: str = "",
    fastighetsagare_query: str = "",
) -> dict[str, Any]:
    """
    Kombinerar alla kaller och returnerar berikat payload med konfidens.
    """
    result: dict[str, Any] = {
        "namn_input":    namn,
        "postort":       "",
        "postnummer":    re.sub(r"\s+", "", postnummer),
        "fastighetsagare": "",
        "kandidater":    [],
        "bast_match":    None,
        "konfidens":     0.0,
        "kallor_aktiva": [],
        "kallor_saknar": [],
        "naesta_steg":   [],
    }

    # --- Steg 1: PAP - postnummer -> postort ---
    if postnummer:
        pap = pap_lookup_postort(postnummer)
        result["postort"] = pap.get("postort", "")
        result["postort_kalla"] = pap.get("_source", "")
        if pap.get("_source") in ("PAP API", "fallback"):
            result["kallor_aktiva"].append("PAP")

    # --- Steg 2: Eniro Company - fastighetsagare ---
    if fastighetsagare_query:
        companies = eniro_company_search(fastighetsagare_query, stad or "sverige")
        if companies:
            best = companies[0]
            result["fastighetsagare"] = best["name"]
            result["fastighetsagare_adress"] = best.get("address", "")
            result["fastighetsagare_telefon"] = best.get("phone", "")
            result["kallor_aktiva"].append("Eniro Company")
        elif ENIRO_KEY:
            result["naesta_steg"].append("Eniro Company returnerade inga resultat")

    # --- Steg 3: PersonKontakt - telefon -> person ---
    kandidater: list[dict] = []
    if telefon:
        pk = personkontakt_phone_lookup(telefon)
        if pk:
            kandidater.append(pk)
            result["kallor_aktiva"].append("PersonKontakt")
        elif not PKONTAKT_KEY:
            result["kallor_saknar"].append("PersonKontakt (kontakta info@marknadsinformation.se)")
            result["naesta_steg"].append("PersonKontakt: telefon -> person (krav avtal)")

    # --- Steg 4: Eniro Person (om nyckel och betald) ---
    if namn:
        eniro_hits = eniro_person_search(namn, stad or "stockholm")
        if eniro_hits:
            kandidater.extend(eniro_hits)
            result["kallor_aktiva"].append("Eniro Person")
        elif ENIRO_KEY and not eniro_hits:
            result["kallor_saknar"].append("Eniro Person (krav uppgradering fran trial, 990 kr/man)")
            result["naesta_steg"].append("Eniro Person: namnsokning (uppgradera pa api.eniro.com)")

    # --- Steg 5: Narrow down ---
    result["kandidater"] = [c for _, c in narrow_down(kandidater)] if kandidater else []
    if kandidater:
        scored = narrow_down(kandidater, ref_name=namn, ref_city=stad, ref_phone=telefon)
        if scored:
            best_score, best = scored[0]
            result["bast_match"] = best
            result["bast_match_score"] = best_score
            result["antal_kandidater"] = len(kandidater)

            # Berika postort om bäst match har det och vi saknar det
            if not result["postort"] and best.get("postort"):
                result["postort"] = best["postort"]

    # --- Konfidens ---
    result["konfidens"] = _berakna_konfidens(result)
    return result


def _berakna_konfidens(r: dict) -> float:
    score = 0.0
    if r.get("postort"):         score += 0.20
    if r.get("postnummer"):      score += 0.15
    if r.get("bast_match"):
        ms = r.get("bast_match_score", 0)
        score += ms * 0.65
    return round(min(score, 1.0), 2)


# ---------------------------------------------------------------------------
# Utskrift
# ---------------------------------------------------------------------------
def _log(msg: str) -> None:
    print(f"  [!] {msg}", file=sys.stderr)


def print_status() -> None:
    print()
    print("=" * 60)
    print("KALLOR - STATUS")
    print("=" * 60)
    sources = [
        ("PAP/API Lite",    PAP_KEY,      "gratis pa papilite.se"),
        ("Eniro (Company)", ENIRO_KEY,    "trial - company OK, person krav uppgradering"),
        ("PersonKontakt",   PKONTAKT_KEY, "info@marknadsinformation.se (avtal)"),
    ]
    for name, key, how in sources:
        status = "AKTIV" if key else "SAKNAS"
        print(f"  {status:<7}  {name:<20} {'' if key else '-> ' + how}")
    print()
    if not PAP_KEY:
        print("  OBS: PAP_API_KEY borjar med = i .env - ta bort = -tecknet")
        print("       Korrekt: PAP_API_KEY=0162da2c...")
    print()


def print_result(res: dict) -> None:
    print("=" * 60)
    print("RESULTAT")
    print("=" * 60)

    print(f"  postort:           {res.get('postort') or '(tom)'}"
          f"  [{res.get('postort_kalla', '')}]")
    print(f"  postnummer:        {res.get('postnummer') or '(tom)'}")

    if res.get("fastighetsagare"):
        print(f"  fastighetsagare:   {res['fastighetsagare']}")
        if res.get("fastighetsagare_telefon"):
            print(f"    telefon:         {res['fastighetsagare_telefon']}")

    if res.get("bast_match"):
        m = res["bast_match"]
        ms = res.get("bast_match_score", 0)
        print()
        print(f"  Bast personmatch ({ms:.0%} konfidens, kalla: {m.get('_source','?')}):")
        print(f"    Namn:      {m.get('name') or '(okand)'}")
        print(f"    Adress:    {m.get('gatuadress') or '(okand)'}")
        print(f"    Postort:   {m.get('postort') or '(okand)'}")
        if m.get("telefonnummer"):
            print(f"    Telefon:   {m['telefonnummer']}")
        if m.get("personnummer"):
            print(f"    Personnr:  {m['personnummer']}")
        if len(res.get("kandidater", [])) > 1:
            print(f"    ({res['antal_kandidater']} kandidater hittades totalt)")
            for c in res["kandidater"][1:3]:
                print(f"      - {c.get('name')} / {c.get('postort')} [{c.get('_source')}]")

    print()
    print(f"  Konfidens: {res['konfidens']:.0%}")

    if res.get("kallor_aktiva"):
        print(f"  Aktiva kallor: {', '.join(res['kallor_aktiva'])}")

    if res.get("naesta_steg"):
        print()
        print("  For hogre konfidens:")
        for s in res["naesta_steg"]:
            print(f"    -> {s}")

    if not PKONTAKT_KEY:
        print()
        print("  BAST NASTA STEG:")
        print("    PersonKontakt (info@marknadsinformation.se)")
        print("    -> telefon/personnr -> namn + adress, uppdaterat mot SPAR")

    print("=" * 60)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def prompt(text: str, default: str = "") -> str:
    if default:
        v = input(f"  {text} [{default}]: ").strip()
        return v or default
    return input(f"  {text}: ").strip()


def main() -> int:
    parser = argparse.ArgumentParser(description="Grazon-berikare for flytt-formular")
    parser.add_argument("--json", "-j", help="Lasa input fran JSON-fil")
    parser.add_argument("--out",  "-o", help="Spara output till JSON-fil")
    args = parser.parse_args()

    print_status()

    # --- Input ---
    raw: dict[str, str] = {}
    if args.json and os.path.isfile(args.json):
        with open(args.json, encoding="utf-8") as f:
            raw = json.load(f)
        print(f"Input fran: {args.json}")
    else:
        print("-" * 60)
        print("STEG 1: Ange vad du vet (tryck Enter for att hoppa over)")
        print("-" * 60)
        raw["namn"]               = prompt("Namn (t.ex. Jakob Eberg)", "")
        raw["telefon"]            = prompt("Telefonnummer", "")
        raw["postnummer"]         = prompt("Postnummer pa nya adressen", "")
        raw["stad"]               = prompt("Stad (nya adressen)", "")
        raw["personnummer"]       = prompt("Personnummer (om kand)", "")
        raw["fastighetsagare"]    = prompt("Fastighetsagare att slå upp (foretag)", "")

    res = berika(
        namn                 = raw.get("namn", ""),
        telefon              = raw.get("telefon", ""),
        postnummer           = raw.get("postnummer", ""),
        stad                 = raw.get("stad", ""),
        personnummer         = raw.get("personnummer", ""),
        fastighetsagare_query= raw.get("fastighetsagare", ""),
    )

    print_result(res)

    if args.out:
        # Ta bort interna debug-nycklar for ren output
        clean = {k: v for k, v in res.items()
                 if not k.startswith("_") and k not in ("kandidater",)}
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(clean, f, ensure_ascii=False, indent=2)
        print(f"\nSparat till: {args.out}")
    else:
        save = input("\nSpara resultat? (j/n) [n]: ").strip().lower()
        if save in ("j", "ja"):
            out_path = os.path.join(os.path.dirname(__file__), "grazon_resultat.json")
            clean = {k: v for k, v in res.items()
                     if not k.startswith("_") and k not in ("kandidater",)}
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(clean, f, ensure_ascii=False, indent=2)
            print(f"Sparat till: {out_path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
