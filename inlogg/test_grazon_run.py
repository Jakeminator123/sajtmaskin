#!/usr/bin/env python3
"""Standalone testkorning av flytt_grazon med Jakobs data."""
import os, sys

os.environ["PAP_API_KEY"]   = "0162da2c088764fc394ab326f43332d0044ca753"
os.environ["ENIRO_API_KEY"] = "zOhVo6Zp6qZf_Y_mmaNOyHnsqsW8PjdppLrB3hGERrE"

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import flytt_grazon as g

sep = "-" * 55

# ── TEST 1: PAP ──────────────────────────────────────────
print()
print("TEST 1: PAP – postnummer -> postort")
print(sep)
for pnr in ["11622", "41115", "75310", "21222", "85234"]:
    r = g.pap_lookup_postort(pnr)
    print(f"  {pnr}  ->  {r.get('postort', '(okand)'):<20} [{r.get('_source','')}]")

# ── TEST 2: Eniro Company ────────────────────────────────
print()
print("TEST 2: Eniro Company – fastighetsagare-sokning")
print(sep)
for query in ["Folkhem", "HSB", "Wallenstam"]:
    hits = g.eniro_company_search(query, "stockholm")
    if hits:
        h = hits[0]
        name = h.get("name", "")
        addr = h.get("address", "")
        city = h.get("city", "")
        tel  = h.get("phone", "")
        print(f"  {query:<12}  ->  {name}, {addr} {city}, tel:{tel}")
    else:
        print(f"  {query:<12}  ->  (inga resultat)")

# ── TEST 3: Eniro Person (forvantad 403 med trial) ───────
print()
print("TEST 3: Eniro Person – namnsokning (forvantad 403 trial)")
print(sep)
hits = g.eniro_person_search("Jakob Eberg", "stockholm")
if hits:
    for h in hits:
        print(f"  {h.get('name')} | {h.get('postort')} | tel:{h.get('telefonnummer')}")
else:
    print("  (Inga traffar - krav uppgradering fran trial)")

# ── TEST 4: Samlad berika ─────────────────────────────────
print()
print("TEST 4: Samlad berika – Jakob Eberg, tel 0739558087")
print(sep)
res = g.berika(
    namn="Jakob Eberg",
    telefon="0739558087",
    postnummer="11622",
    stad="Stockholm",
    fastighetsagare_query="Folkhem",
)
g.print_result(res)

print()
print("STATUS SUMMARY")
print(sep)
print(f"  PAP nyckel aktiv:          {'JA' if os.environ.get('PAP_API_KEY') else 'NEJ'}")
print(f"  Eniro nyckel aktiv:        {'JA' if os.environ.get('ENIRO_API_KEY') else 'NEJ'}")
print(f"  Ratsit nyckel aktiv:       {'JA' if os.environ.get('RATSIT_API_KEY') else 'NEJ (API nedlagt)'}")
print(f"  PersonKontakt nyckel:      {'JA' if os.environ.get('PERSONKONTAKT_API_KEY') else 'NEJ (maila info@marknadsinformation.se)'}")
print()
