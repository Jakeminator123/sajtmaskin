#!/usr/bin/env python3
"""
Stegvis test av flytt_prefill – visar vad som krävs vs vad som auto-fylls.

Kör: python inlogg/flytt_prefill_test.py
"""
import json
import os
import sys

# Add parent so we can import flytt_prefill
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from flytt_prefill import prefill, _validation_summary, _lookup_postort_pap, _lookup_postort_fallback

def main():
    print("=" * 60)
    print("FLYTT PREFILL – STEGVIS TEST")
    print("=" * 60)
    print()
    print("Testdata: Jakob Eberg, Folkungagatan Stockholm, flytt 2026-04-04")
    print("(Ny adress antas: Folkungagatan 50, 11622 – du kan ändra i test_jakob.json)")
    print()

    # Load test payload
    test_path = os.path.join(os.path.dirname(__file__), "test_jakob.json")
    if not os.path.isfile(test_path):
        print(f"Skapa {test_path} först.")
        return 1

    with open(test_path, "r", encoding="utf-8") as f:
        raw = json.load(f)

    print("STEG 1: Vad du anger (input)")
    print("-" * 40)
    for k, v in raw.items():
        status = "OK" if v else "- tom"
        print(f"  {k}: {v or '(tom)'} {status}")
    print()

    # Check what we can enrich
    postnummer = (raw.get("postnummer") or "").replace(" ", "")
    postort_in = (raw.get("postort") or "").strip()
    pap_key = os.environ.get("PAP_API_KEY", "").strip()

    print("STEG 2: Vad API/fallback kan hämta")
    print("-" * 40)
    if postnummer and len(postnummer) == 5:
        if pap_key:
            ort = _lookup_postort_pap(postnummer, pap_key)
            src = "PAP API" if ort else "PAP API (inga svar)"
        else:
            ort = _lookup_postort_fallback(postnummer)
            src = "Inbäddad fallback" if ort else "Fallback (okänt postnummer)"
        print(f"  postnummer {postnummer} -> postort: {ort or '(ej hittat)'} [{src}]")
    else:
        print("  postnummer saknas eller ogiltigt – postort kan inte slås upp")
    print("  (Övriga fält: ingen gratis API kan hämta dem)")
    print()

    print("STEG 3: Resultat efter prefill")
    print("-" * 40)
    result = prefill(
        inflyttningsdatum=raw.get("inflyttningsdatum", ""),
        gatuadress=raw.get("gatuadress", ""),
        postnummer=raw.get("postnummer", ""),
        postort=raw.get("postort", ""),
        lagenhetsnummer=raw.get("lagenhetsnummer", ""),
        fastighetsbeteckning=raw.get("fastighetsbeteckning", ""),
        fastighetsagare=raw.get("fastighetsagare", ""),
        telefonnummer=raw.get("telefonnummer", ""),
        email=raw.get("email", ""),
    )
    for k, v in result.items():
        auto = "<- auto" if (k == "postort" and v and not postort_in) else ""
        print(f"  {k}: {v or '(tom)'} {auto}")
    print()

    warnings, confidence = _validation_summary(result)
    print("STEG 4: Validering")
    print("-" * 40)
    print(f"  Konfidens: {confidence:.0%}")
    if warnings:
        print("  Varningar (saknade fält):")
        for w in warnings:
            print(f"    - {w}")
    else:
        print("  OK Alla krav uppfyllda")
    print()

    print("SAMMANFATTNING: Vad krävs från dig vs vad som auto-fylls")
    print("-" * 60)
    print("  FRÅN DIG (ingen API har detta):")
    print("    - inflyttningsdatum, gatuadress, postnummer")
    print("    - lagenhetsnummer, fastighetsagare, telefonnummer, email")
    print()
    print("  AUTO-FYLLS (via PAP/fallback):")
    print("    - postort (från postnummer)")
    print()
    print("  FRÅN SKATTEVERKET (när du loggar in med BankID):")
    print("    - Nuvarande adress, namn, personnummer")
    print("=" * 60)

    return 0 if confidence >= 0.95 else 1

if __name__ == "__main__":
    sys.exit(main())
