# P18 — Preview runtime stability (hydration)

Status: Delvis avklarat — WSS/Fly är löst; hydration-varning kvarstår
Skapad: 2026-04-15
Prioritet: Låg–medel (varning, inte krasch)

## Uppdatering 2026-04-15

**Spår A (WSS/HMR-stabilitet) — STÄNGT.** Fly-proxyn fungerar nu stabilt; inga rapporterade reconnect-loopar.

**Spår B (hydration mismatch)** är det enda kvarvarande problemet. Den gula varning som visas på landningssidan misstänks vara kopplad till ett 3D-bibliotek ("Tree"/Three.js-liknande) med eventuell versionsinkompatibilitet. Varningen blockerar inte funktionalitet men är visuellt störande.

## Kvarstående — hydration-varning

1. Identifiera vilken komponent på landningssidan som orsakar den gula hydration-varningen.
2. Undersök om det rör sig om ett 3D/canvas-bibliotek och om en versionsuppdatering löser det.
3. Om det inte är trivialt: dokumentera som känd edge case och prioritera ned.

## Avklarat

- ~~WSS/HMR mot Fly tappar anslutning~~ — LÖST
- ~~Reconnect-strategi med backoff~~ — inte längre relevant
- ~~Fallback till polling~~ — inte längre relevant
