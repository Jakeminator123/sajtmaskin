#!/usr/bin/env python3
"""
Interaktivt test av flytt_prefill - du fyller i falt, andra dyker upp automatiskt.

Kor: python inlogg/flytt_prefill_interactive.py

Oberoende skript - andrar inte flytt_prefill_test.py eller andra processer.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from flytt_prefill import prefill, _validation_summary, _lookup_postort_pap, _lookup_postort_fallback


def prompt(text: str, default: str = "") -> str:
    """Fragar anvandaren, returnerar trimmed svar."""
    if default:
        s = input(f"{text} [{default}]: ").strip()
        return s if s else default
    return input(f"{text}: ").strip()


def show_field(label: str, value: str, source: str = "") -> None:
    """Skriver ut ett falt med eventuell kalla."""
    src = f"  <- {source}" if source else ""
    print(f"  {label}: {value or '(tom)'}{src}")


def main() -> int:
    data: dict[str, str] = {}

    print()
    print("=" * 55)
    print("FLYTT PREFILL - Interaktivt test")
    print("=" * 55)
    print("Fyll i falt. Nya falt dyker upp nar du anger data.")
    print("Tryck Enter for att hoppa over valfria falt.")
    print()

    # --- Steg 1: Postnummer (triggerar postort)
    print("-" * 55)
    print("STEG 1: Postnummer (5 siffror)")
    print("-" * 55)
    postnummer = prompt("Postnummer for din nya adress", "").replace(" ", "")
    while postnummer and len(postnummer) != 5:
        print("  Ogiltigt. Ange 5 siffror, t.ex. 11622")
        postnummer = prompt("Postnummer", "").replace(" ", "")
    data["postnummer"] = postnummer[:5] if len(postnummer) >= 5 else ""

    if data["postnummer"]:
        pap_key = os.environ.get("PAP_API_KEY", "").strip()
        if pap_key:
            postort = _lookup_postort_pap(data["postnummer"], pap_key)
            src = "PAP API"
        else:
            postort = _lookup_postort_fallback(data["postnummer"])
            src = "fallback"
        data["postort"] = postort or ""
        print()
        show_field("postort", data["postort"], src if data["postort"] else "")
        print()
    else:
        data["postort"] = ""

    # --- Steg 2: Gatuadress
    print("-" * 55)
    print("STEG 2: Gatuadress")
    print("-" * 55)
    data["gatuadress"] = prompt("Gatunamn och nummer (nya adressen)", "")
    print()

    # --- Steg 3: Inflyttningsdatum
    print("-" * 55)
    print("STEG 3: Inflyttningsdatum")
    print("-" * 55)
    data["inflyttningsdatum"] = prompt("Flyttningsdatum (YYYY-MM-DD)", "2026-04-04")
    print()

    # --- Steg 4: Valfria falt
    print("-" * 55)
    print("STEG 4: Ytterligare falt (valfria)")
    print("-" * 55)
    data["lagenhetsnummer"] = prompt("Lagenhetsnummer (t.ex. 1401)", "")
    data["fastighetsbeteckning"] = prompt("Fastighetsbeteckning (t.ex. Bonden 7:1)", "")
    data["fastighetsagare"] = prompt("Fastighetsagare (eller 'egen')", "")
    data["telefonnummer"] = prompt("Telefonnummer", "")
    data["email"] = prompt("E-post", "")
    print()

    # --- Sammanstallning
    print("=" * 55)
    print("RESULTAT - Alla falt")
    print("=" * 55)
    result = prefill(
        inflyttningsdatum=data.get("inflyttningsdatum", ""),
        gatuadress=data.get("gatuadress", ""),
        postnummer=data.get("postnummer", ""),
        postort=data.get("postort", ""),
        lagenhetsnummer=data.get("lagenhetsnummer", ""),
        fastighetsbeteckning=data.get("fastighetsbeteckning", ""),
        fastighetsagare=data.get("fastighetsagare", ""),
        telefonnummer=data.get("telefonnummer", ""),
        email=data.get("email", ""),
    )
    for k, v in result.items():
        src = "auto" if (k == "postort" and v) else ""
        show_field(k, v, src)
    print()

    warnings, confidence = _validation_summary(result)
    print("-" * 55)
    print(f"Konfidens: {confidence:.0%}")
    if warnings:
        print("Saknade falt:")
        for w in warnings:
            print(f"  - {w}")
    else:
        print("OK - alla krav uppfyllda")
    print("=" * 55)

    # Spara till fil?
    save = prompt("Spara till resultat.json? (j/n)", "n").strip().lower()
    if save in ("j", "ja", "y", "yes"):
        out_path = os.path.join(os.path.dirname(__file__), "resultat.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"Sparat till {out_path}")

    return 0 if confidence >= 0.95 else 1


if __name__ == "__main__":
    sys.exit(main())
