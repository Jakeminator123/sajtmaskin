# P19 — Old-content ingress hardening (konservativ)

**Status:** 3/5 steg klara. **Kvar: Steg 3** (UX-transparens — visa vilken basversion follow-up använder i UI + "du redigerar version X, inte senaste Y"-signal). Effort: 4–8h. Linear: SAJ-22.

Historik: Steg 1 (ingress-telemetri), Steg 2 (preview_url invalidering vid filmutering), Steg 4 (v0-import freshness-metadata) alla levererade 2026-04-20. Resten av filen är bakgrund + evidens.

Skapad: 2026-04-15 · Prioritet: Låg

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

### Steg 1 — Evidens och reproducerbarhet — **DONE 2026-04-20**

- ✅ Ny Prometheus-räknare `sajtmaskin_ingress_event_total{type, reason}` exponerad via `incIngressEvent()` i `src/lib/observability/metrics.ts`. Reset i `resetMetricsForTest()`. Täcker:
  - `preview_reused_url` — wired i `src/app/api/engine/chats/[chatId]/preview-session/route.ts` precis innan `startOutcome: "reused_url"`-svar (med `devLogAppend({ type: "preview.reused-url", chatId, versionId, previewUrl })`, URL trunkerad till 60 tecken).
  - `followup_base_resolved{reason="explicit"|"preferred"|"latest"}` + per-branch räknarna `followup_base_explicit|preferred|latest` — wired i `resolveFollowUpPreviousFiles()` i `src/lib/gen/version-manager.ts`. Dubbel-räknare medvetet: `_resolved` ger en linje för dashboard, typade räknare ger drilldown utan label-join. Per call `devLogAppend({ type: "version-manager.followup-base", chatId, branch, versionId })`.
- Alla telemetri-anrop wrappade i `try { ... } catch {}` så observability aldrig blockerar codegen eller preview-svar.
- Reproducerbara scenarier dokumenteras separat när första analysfönstret rullats in.

> **Status:** Klart 2026-04-20. Analysen av insamlad data är nästa steg (kopplas till Steg 3).

### Steg 2 — Konservativa skydd — **DONE 2026-04-20**

- ✅ Ingress-punkt 1 stängd: `updateVersionFiles()` nollställer nu `preview_url` när filer muteras via `/api/engine/chats/[chatId]/files`. Levererat i commit `72837c500`. Nästa preview-session-request kortsluter inte längre till `startOutcome: "reused_url"` mot stale tier-2 VM-snapshot.
- Befintligt resume-flöde via session-store oförändrat (URL-genvägen undviks bara vid faktisk filmutering, inte vid normal preview-bootstrap).

### Steg 3 — Transparens i follow-up-basen

- Visa i UI/logg vilken basversion follow-up skickar (`engineBaseVersionId`).
- Om bas inte är latest: ge tydlig signal ("du redigerar version X, inte senaste Y").

> **Status:** Öppen. Subagent-fynd 2026-04-20 noterade att `9b1c5dc8` (unify active-version) löste *delvis* den race-condition som gjorde att fel bas valdes — men UX-transparensen återstår. Effort: ~4–8h.

### Steg 4 — v0-import freshness-signal — **DONE 2026-04-20**

- ✅ `/api/template` POST-respons innehåller nu ett `source`-objekt med `templateId`, `timestamp`, `ageSeconds`, `stale`, `sourceSlugs` och `categoryLabel`. Se `src/app/api/template/route.ts` (`buildTemplateSourceMetadata`).
- ✅ Tröskel `STALENESS_THRESHOLD_SECONDS = 30 dygn` (module-level, intern). När `stale === true` skrivs en info-rad via `devLogAppend("latest", { type: "v0-import.stale-source", templateId, ageSeconds, timestamp })` — ej blockerande.
- ✅ Saknad/oparsbar timestamp ger `ageSeconds: null, stale: false` (safe default). Existerande responsfält är oförändrade; fältet är additivt.
- Klienter kan nu opt-in:a UI-varning. UX-exponering i builder är egen uppgift (ej del av denna plan).

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
