# Checklista — reparationskedjan

> **Aningen flytande.** Rutorna nedan är förslag i en föreslagen ordning, inte
> ett godkänt arbetspaket. Stäm av med ägaren innan ett steg påbörjas, och
> stryk eller flytta rutor fritt när verkligheten säger något annat.

Master: [`00-master-plan.md`](00-master-plan.md).

## A — Klassificeringen (steg 1)

- [ ] Bekräfta att `TS2604` verkligen är render-dödande i vår Next-version:
      minimal repro där en strängvärdad `icon` renderas som `<icon />`.
- [ ] Utred `TS1005`-träffarna (15 st / 40 d) innan koden läggs i listan —
      varför når ett syntaxfel kvalitetsgrinden i stället för esbuild-steget?
- [ ] `TS2604` in i `RENDER_RISK_TS_CODES`
      (`src/lib/gen/verify/quality-gate-checks.ts`), med test som låser koden.
- [ ] Gör `isBuildBreakingFinding` oberoende av LLM-uppfunna fynd-id:n
      (`src/lib/gen/preview/should-start-preview.ts`) — klassificera på
      diagnostik, inte på ett id modellen hittar på.
- [ ] Verifiering: `npm run typecheck` + riktade Vitest på båda filerna.

## B — Hård grind vid Vercel-publicering (steg 2)

- [ ] Ägarbeslut: blockerande grind, eller grind med uttrycklig override efter
      varning.
- [ ] Låt publiceringsvägen köra ReleaseGate för designversioner
      (`resolveDeployReleaseGate` i `src/lib/db/engine-version-lifecycle.ts`).
- [ ] Säkerställ att F2-previewen i buildern förblir mjuk och snabb — ingen ny
      friktion i iframe-flödet.
- [ ] UX: vad ser användaren medan den tyngre grinden kör? Publiceringsknappen
      får inte se ut att hänga.
- [ ] Verifiering: riktade tester på gatevillkoret + en manuell publicering av
      en känt trasig designversion.

## C — Byggfelsreparation (steg 3)

- [ ] Läs `src/lib/gen/verify/build-error-trigger.ts` och bekräfta varför den
      stängdes av i produktion — orsaken kan fortfarande gälla.
- [ ] Slå på efter att A och B landat, inte före.
- [ ] Sätt ett tak per chatt så en misslyckad reparation inte loopar.
- [ ] Verifiering: mät hur ofta den fyrar under ett fönster innan den lämnas på.

## D — Konsolidering (steg 4)

- [ ] Kör warm-tsc i F2 även när grinden är planerad (`skipWarmTsc` i
      `fast-path.ts`), med fail-open vid kall cache.
- [ ] Låt tsc-resultatet avgöra om verifieraren behövs.
- [ ] Skärp `risky_fixes`-triggern — `import-validator` och `dep-completer` är
      mekaniska och katalogdrivna (`fixer-registry.ts`).
- [ ] Gata live review på sensorfynd även vid init (`live-review.ts`).
- [ ] Verifiering: nytt `control-stats`-fönster jämfört med mätningen i
      masterplanen, inte mot julibaslinjen.

## E — Mätning och baslinje

- [x] Färsk prod-mätning gjord 2026-09-11 (40 d + 14 d), siffror i masterplanen.
- [ ] Ägarbeslut: ska `control-stats-baseline-2026-07-02.json` bytas mot ett
      färskt fönster, och i så fall i vilken ändring?
- [ ] Efter varje landat steg: kör om `control-stats` och notera deltat här.

## F — Svansar som hör hemma någon annanstans

- [ ] Olänkade rutter (`/categories`, `/om` utan navlänk) — nav-synken filtrerar
      men lägger aldrig till, och follow-up fryser läget. Egen rad i backloggen
      snarare än i den här planen.
- [ ] `cta_no_handler` är brusigt: 61 händelser fördelade på 11 versioner.
      Hör ihop med UX-svansen i verifieringsflödesplanen.
- [ ] Preview readiness-felet «Runtime never accepted HTTP» med ny
      defektsignatur `510500185579` — ny, unik för en chatt, behöver egen repro.
