# Reparations- och verifieringskedjan — mätning och åtgärdsordning (2026-09-11)

> **Status: aningen flytande.** Det här är ett underlag, inte ett fattat beslut.
> Stegen, ordningen och avgränsningarna kan ändras när ägaren säger så, och
> siffrorna nedan är ett mätfönster — inte en policy. Skapa inga PR:er på den här
> planen utan att först stämma av att steget fortfarande gäller.

Utlöst av en prod-körning 2026-09-10 (`ecommerce`/`megastore-clean`) där
verifieraren hittade två TypeScript-fel, fixaren misslyckades, versionen
promotades ändå, Vercel-bygget föll på exakt samma fel och previewen slutade
svara. Buggsanning hör hemma i
[`BUG-SWARM-BACKLOG.md`](../../../../BUG-SWARM-BACKLOG.md); den här mappen håller
helhetsbilden och ordningen.

## De två brottytorna

Båda är klassificeringsluckor, inte designfel. Varje enskilt beslut i kedjan är
motiverat i sin egen kodkommentar — det är kombinationen som brister.

1. **`warm-tsc` stängs av när kvalitetsgrinden är planerad.**
   `src/lib/gen/stream/finalize-version/fast-path.ts` (`skipWarmTsc`). Motivet är
   att inte typechecka två gånger. Env-overriden `SAJTMASKIN_PRE_VM_TYPECHECK`
   finns redan, och telemetrifältet `warmTscSkipped` exponeras i backoffice.
2. **Kvalitetsgrinden advisory-promotar typecheck-fel i designläge.**
   `isTypecheckOnlyAdvisory` och `RENDER_RISK_TS_CODES` i
   `src/lib/gen/verify/quality-gate-checks.ts`. Motivet är att `next dev`
   renderar igenom semantiska typfel.

Kombinerat: typechecken hoppas över **för att** grinden ska ta den, och sedan
promotar grinden felet i stället för att reparera det. Ingen instans agerar på
typfelet.

En tredje, mindre yta med samma karaktär: `isBuildBreakingFinding` i
`src/lib/gen/preview/should-start-preview.ts` gatar på en fast lista fynd-id:n
plus regexmönster. Verifieraren namnger sina fynd själv, så ett LLM-uppfunnet id
(`typescript-product-icon-prop`) matchar ingenting och klassas som kosmetiskt.

## Mätning (prod, 40 dagar, 2026-09-11)

Reproducera med
`node scripts/db/control-stats.mjs --json --env=.env.vercel.production.pulled --days=40 --allow-insecure-ssl`
och jämför med `npm run stats:compare -- --current <fil> --md`.

Volym: 50 chattar, 128 versioner, 125 genereringar, 150 telemetrirader.

| Signal | Värde | Innebörd |
|---|---|---|
| Typechecks som föll | 19 av 122 | 15,6 % |
| Advisory-promotade | 12 | 63 % av alla fall |
| Hårt underkända | 3 | 16 % av alla fall |
| tsc-koder i luckan | 23 av 63 träffar | `TS2604` (8) och `TS1005` (15) saknas i `RENDER_RISK_TS_CODES` |
| Product Postcheck överlagrar verdikt | 80 av 150 | 53 % — kedjans största verdiktkälla |
| Verifieraren kör | 71 av 150 | 47 %, ca 40 s per körning |
| Server repair-loop | 3 körningar, 3 lyckade | Fungerar, men körs nästan aldrig |
| Vercel-deploys | 1 | Låg volym — slutsatser om deploy vilar på få observationer |

Mot den frysta baslinjen 2026-07-02 (14-dagarsfönster): quality gate pass
84 % → 63,2 %, importrelaterade typfel 84 % → 5,6 %, verifier skip 69 % → 50 %,
versioner som slutar `failed` 38 % → 1,8 %.

De två sista raderna hör ihop. Att andelen `failed` faller kraftigt samtidigt som
grindarnas pass-andel faller är inte två oberoende observationer — skillnaden
hamnar i advisory-promoteringen.

Baslinjen är ett mätvärde i
`scripts/observability/control-stats-baseline-2026-07-02.json`, inte en låsning.
Den ska bytas när ägaren vill, och `docs/architecture/quality-gate-flow.md`
säger själv att prod-mätning inte ägs av den filen.

## Ordning

Ordningen bär mer än verktygsvalet. Att slå på en kraftfullare
reparationsmodell före klassificeringen lägger en sjätte LLM-reparationsingång
till fem som redan misslyckades på samma defekt.

| Steg | Innehåll | Ägaryta |
|---|---|---|
| 1 | Klassificeringen: `TS2604` (och sannolikt `TS1005`) in i render-risk; build-breaking-klassificeraren görs oberoende av LLM-uppfunna fynd-id:n | `quality-gate-checks.ts`, `should-start-preview.ts` |
| 2 | Hård grind vid Vercel-publicering, mjuk preview kvar i buildern | `resolveDeployReleaseGate` i `src/lib/db/engine-version-lifecycle.ts` |
| 3 | Slå på byggfelsreparationen som redan finns | `src/lib/gen/verify/build-error-trigger.ts` |
| 4 | Konsolidera: warm-tsc tillbaka, skärpt `risky_fixes`-trigger, live review gatad på sensorfynd även vid init | `fast-path.ts`, `fixer-registry.ts`, `live-review.ts` |

Steg 2 är avgränsningen ägaren själv formulerat: publicering betyder
**publicering till Vercel**, inte F2-preview. Grinden ska göra det mycket svårt
för ett Vercel-bygge att falla, utan att lägga friktion på iframe-previewen i
buildern. Det är samma uppdelning arkitekturen redan har (F2 mjuk, F3
ReleaseGate) — grinden anropas bara inte från deployvägen i dag.

## Kopplingar

- `SM-077` (öppen) beskriver samma familj: postcheck PASS följt av krasch på en
  ikonkomponent efter follow-up, utan att reparationslagret ser det.
- `SM-075` (stängd) lade `TS2693` och `TS2724` i `RENDER_RISK_TS_CODES` av exakt
  det skäl som nu gäller `TS2604`.
- Öppen ägarfråga i backloggen: «Ska en dossierfil med `defect.kind: compile`
  blockera i stället för att vara advisory?» Körningen som utlöste planen hade
  `defect.kind: compile`.
- Öppna ägarfrågor som berör steg 4: «Ska F2 köra verifier-LLM-passet?» och
  `SM-047` om verifierarens kontextstorlek.
- Angränsande men separat spår:
  [`../2026-09-01-verifieringsflode-och-inspector/00-master-plan.md`](../2026-09-01-verifieringsflode-och-inspector/00-master-plan.md)
  äger preview, inspector och Degraderad-statusen.

## Inte avgjort

- Om `TS1005` ens borde kunna nå kvalitetsgrinden. Ett syntaxfel borde ha
  fastnat i esbuild-steget långt tidigare, så de 15 träffarna kan vara symptom
  på något annat och bör utredas innan koden läggs i listan.
- Om verifieraren ska behållas som domare när warm-tsc är påslagen. Det är en
  kostnadsfråga som kräver ytterligare ett mätfönster.
- Hur hård steg 2 ska vara: blockerande grind, eller grind med uttrycklig
  override efter varning.
- Om baslinjen ska bytas mot ett färskt fönster i samma ändring som steg 1.

Checklista: [`01-checklista.md`](01-checklista.md).
