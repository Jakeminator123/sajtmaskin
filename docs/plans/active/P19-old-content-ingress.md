# P19 — Old-content ingress hardening (konservativ)

Status: Active (Steg 2 KLART 2026-04-20; Steg 1, 3, 4 öppna)
Skapad: 2026-04-15
Prioritet: Medel

## Problem

I vissa flöden upplevs att äldre innehåll "kommer tillbaka" trots nyare ändringar.
Detta måste angripas konservativt: först bevisa ingresspunkter, sedan små säkra fixar.

## Primära misstänkta ingresspunkter

1. **Preview reuse utan filpush**
   - `src/app/api/engine/chats/[chatId]/preview-session/route.ts` kan returnera `startOutcome: "reused_url"` om `preview_url` redan finns.
   - Om filer uppdaterats men `preview_url` inte invalid­erats kan VM visa äldre runtime.

2. **Follow-up baseras på annan version än användaren tror**
   - `src/lib/gen/version-manager.ts` väljer `engineBaseVersionId` (från klient-meta) eller annars preferred/latest.
   - Om användaren står på äldre version i UI blir det korrekt enligt kod men kan upplevas som regress.

3. **Lokal v0-import kan vara äldre snapshot**
   - `src/lib/templates/local-v0-template-source.ts` läser senaste lokala zip-referens i `downloaded.jsonl`.
   - Ingen tydlig freshness-signal mot upstream i importögonblicket.

## Mål

- Eliminera oavsiktlig återanvändning av äldre preview-content.
- Göra "vilken version är bas" helt transparent i follow-up.
- Göra v0-importens källfärskhet tydlig utan att bryta nuvarande importflöde.

## Scope

- `src/app/api/engine/chats/[chatId]/files/route.ts`
- `src/app/api/engine/chats/[chatId]/preview-session/route.ts`
- `src/lib/gen/version-manager.ts`
- `src/lib/hooks/chat/useSendMessage.ts` och/eller relaterad builder-UI för version-basindikator
- `src/lib/templates/local-v0-template-source.ts`

## Genomförande

### Steg 1 — Evidens och reproducerbarhet

- Lägg till riktad loggning/telemetri för:
  - när `reused_url` används
  - vilken `engineBaseVersionId` som skickas i follow-up
  - vilken versionsrad som faktiskt används av `resolveFollowUpPreviousFiles()`
- Dokumentera 2-3 reproducerbara scenarier.

> **Status:** Öppen. Blockad på telemetri-grund (audit Tier B #19 Prometheus/OTel) för meningsfull analys.

### Steg 2 — Konservativa skydd — **DONE 2026-04-20**

- ✅ Ingress-punkt 1 stängd: `updateVersionFiles()` nollställer nu `preview_url` när filer muteras via `/api/engine/chats/[chatId]/files`. Levererat i commit `72837c500`. Nästa preview-session-request kortsluter inte längre till `startOutcome: "reused_url"` mot stale tier-2 VM-snapshot.
- Befintligt resume-flöde via session-store oförändrat (URL-genvägen undviks bara vid faktisk filmutering, inte vid normal preview-bootstrap).

### Steg 3 — Transparens i follow-up-basen

- Visa i UI/logg vilken basversion follow-up skickar (`engineBaseVersionId`).
- Om bas inte är latest: ge tydlig signal ("du redigerar version X, inte senaste Y").

> **Status:** Öppen. Subagent-fynd 2026-04-20 noterade att `9b1c5dc8` (unify active-version) löste *delvis* den race-condition som gjorde att fel bas valdes — men UX-transparensen återstår. Effort: ~4–8h.

### Steg 4 — v0-import freshness-signal

- Exponera importkällans timestamp/ursprung i import-respons eller metadata.
- Lägg till enkel varning när lokal källa är äldre än förväntat tröskelvärde (informationsnivå, ej blockering).

> **Status:** Öppen. Effort: ~2–4h.

### Steg 5 — Verifiering

- Scenario A: filändring -> preview-bootstrap får inte `reused_url` till stale runtime.
- Scenario B: follow-up på äldre vald version -> resultatet följer vald version och UI signalerar detta tydligt.
- Scenario C: v0-import -> metadata visar källa/tidsstämpel.

## Acceptanskriterier

- Ingen observerad stale preview efter filmutering av aktiv version.
- Follow-up-basen är tydlig och spårbar för användare och loggar.
- v0-importens ålder/källa synliggörs utan att stoppa fungerande import.

## Ej i denna plan

- Större omdesign av preview-arkitektur
- Byte av lagringsmodell för versionsfiler
- Full upstream-synk av v0-katalog i realtid
