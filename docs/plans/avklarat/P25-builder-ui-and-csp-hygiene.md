---
id: P25
title: Builder UI hygiene — CSP + avatar CORS (badge-tooltips flyttade till P25b)
status: done
created: 2026-04-20
completed: 2026-04-20
priority: medium
wave: 1
parallel_safe_with: [P21, P22, P24]
blocked_by: []
owner_files:
  - next.config.ts
  - src/components/avatar/did-openclaw-bridge.tsx
read_only_files: []
validator_hooks:
  - { kind: file-contains, target: next.config.ts, expect: "api-js.mixpanel.com" }
  - { kind: file-contains, target: src/components/avatar/did-openclaw-bridge.tsx, expect: "handleAvatarConnectError" }
  - { kind: npm-script, target: typecheck }
---

# P25 — Builder UI hygiene (avgränsad)

## Status — 2026-04-20

Ursprunglig plan hade fem steg. **Endast steg 1 + 2 levererades** här. Steg 3-5
flyttade till **P25b** (skapas separat) eftersom de kräver ändringar i filer
utanför ursprungligt `owner_files` (`VersionHistory.tsx` för verifier-badgen,
preview-panel-komponent för mismatch-overlayen) eller är beroende av att P24
exporterar `VersionMismatchOverlayPayload`.

| Steg | Status | Anledning |
|---|---|---|
| 1. CSP `connect-src` + Mixpanel | done | Inom `next.config.ts` |
| 2. Avatar `handleAvatarConnectError` + offline-state | done | Inom `did-openclaw-bridge.tsx` |
| 3. Verifier-badge tooltip ("Fel"/"Verifying") | flyttad → P25b | Badge renderas i `VersionHistory.tsx`, inte i `BuilderHeader.tsx`. Att duplicera bara strängen i headern uppfyller validator-hooken kosmetiskt men inte funktionellt. |
| 4. `GenerationSummary` väntar med "promoted" | flyttad → P25b | `GenerationSummary.tsx` parsar bara prosa+kodblock — den renderar ingen "promoted"-badge och saknar både `verificationBlocked` och server-verify-poll. Logiken hör hemma i `VersionHistory.tsx`. |
| 5. `VersionMismatchOverlayPayload`-konsument | flyttad → P25b | Typen finns inte i repot än — P24 ska exportera den. Beroende ej uppfyllt + sista meningen ("lägg in i preview-panel-komponenten") spiller utanför `preview-panel-types.ts`. |

## Roll & uppgift (kvarvarande scope)

Två UX-problem från DevTools-sessionen 2026-04-20:

| Issue | Källa |
|---|---|
| Mixpanel-tracking blockerad av CSP `connect-src` (report-only) | `index.js:289` |
| D-ID avatar (`v2_agt_*`) CORS-blockerad → "Kunde inte ansluta" | `did-openclaw-bridge.tsx` |

## Filer

| Får ändras | Får läsas (read-only) |
|---|---|
| `next.config.ts` | — |
| `src/components/avatar/did-openclaw-bridge.tsx` | — |

## Steg

1. **CSP allow-list** (`next.config.ts`): i `headers()`-sektionen, lägg till `https://api-js.mixpanel.com` i `connect-src`-direktivet. Om explicit CSP saknas idag, lägg till en `Content-Security-Policy-Report-Only`-policy enligt befintlig kodningskonvention i filen.
2. **Avatar error-handling** (`did-openclaw-bridge.tsx`): ny intern fn `handleAvatarConnectError(err)`. Vid CORS-fel mot `v2_agt_*` (D-ID rate-limit eller okänt agent-id), logga tyst och visa diskret "Sajtagenten offline"-state i widget-headern istället för toast-popup. Behåll befintlig retry-logik.

## Icke-scope (här)

- Verifier-badge-tooltip, "promoted"-fördröjning och version-mismatch-overlay → P25b.
- Ingen ändring av `ModelTraceOverlay.tsx` (P26 äger).
- Ingen ändring av modell-dropdown-disabled-logik.
- Ingen ändring av "Lägg till media"-flödet.

## Acceptans

| # | Kommando / Kontroll | Förväntat |
|---|---|---|
| 1 | Hard refresh `localhost:3000` → DevTools Issues-panelen | Ingen Mixpanel CSP-violation kvar |
| 2 | Inducera D-ID-fel (block i DevTools eller fake error) | Sajtagenten visar "offline"-state, ingen toast-popup |
| 3 | `npm run typecheck` | exit 0 |
| 4 | `npm run lint` på de två owner-filerna | inga nya warnings/errors (befintligt fel i `font-import-fixer.ts` är pre-existing) |
