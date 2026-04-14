# P18 — Preview runtime stability (WSS/HMR + hydration)

Status: Active
Skapad: 2026-04-15
Prioritet: Hög

## Problem

Två operativa problem påverkar preview-upplevelsen:

1. WSS/HMR mot Fly tappar anslutning intermittenta gånger.
2. Hydration overlay visas på landningssidan (pre-existerande fel).

Detta ger låg tillit till preview även när generationen i övrigt lyckas.

## Mål

- Stabil realtidskoppling i preview-läge.
- Ingen återkommande hydration mismatch på startsidan.
- Tydlig diagnos när fel ändå uppstår.

## Scope

- `src/app/builder/useBuilderVmPreview.ts`
- Relevanta preview/stream/VM-kopplade moduler i `src/lib/gen/preview/` och anslutande routes
- Landningssidans server/client-gränssnitt som orsakar hydration mismatch

## Genomförande

### Spår A — WSS/HMR-stabilitet

1. Repro med loggning av connect/disconnect och retry.
2. Verifiera URL/protokolluppbyggnad (`ws`/`wss`) och eventuella proxy-header-antaganden.
3. Inför robust reconnect-strategi med backoff och tydlig status till UI.
4. Säkerställ fallback till polling/status-API när socket är nere.

### Spår B — Hydration mismatch

1. Identifiera exakt nod/komponent som divergerar server vs client.
2. Flytta icke-deterministiskt innehåll till client-safe path eller stabilisera server-render.
3. Validera att overlay försvinner vid normal första rendering.

### Spår C — Regression-skydd

1. Lägg till riktad test/checklist för preview-boot och hydration.
2. Dokumentera felsökningssteg i relevant arkitekturdoc om ändringen blir större.

## Verifiering

- Minst 5 konsekutiva preview-bootar utan fast reconnect-loop.
- Ingen hydration overlay på landningssidan i samma testpass.
- Preview-status når stabil `running` och förblir nåbar under edit/refresh.

## Acceptanskriterier

- WSS-fel ger inte längre "död" preview utan återhämtning.
- Hydration mismatch är åtgärdad eller reducerad till en dokumenterad edge case med planerad uppföljning.
- Inga regressionsfel i builderns previewflöde.

## Ej i denna plan

- Övrig deploy-arkitektur
- Större ombyggnad av builder-UI utanför previewflödet
