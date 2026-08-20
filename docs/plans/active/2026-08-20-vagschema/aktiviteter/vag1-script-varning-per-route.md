# Våg 1 — Script-varningen döljs över hela crawlen i stället för per route

Backlograd: `SM-067`
Beror på: inget. Blockerar: `#1052` rör samma fil — den uppdateras efter den här.
Ägda filer: `src/lib/gen/verify/product-postcheck.ts` + `product-postcheck.test.ts`.

## Det verifierade fyndet

`#1050` var rätt i sak: next-themes-varningen «Encountered a script tag» är en
**följd** av en hydreringskrock, inte en egen defekt, och ska inte rapporteras
som ett fynd när krocken redan är rapporterad. Se `SM-037` för orsaksbilden.

Filtret gäller däremot hela körningen:

```
src/lib/gen/verify/product-postcheck.ts:686-695
function dropDerivedScriptTagWarnings(
  warnings: ProductPostcheckWarning[],
): ProductPostcheckWarning[] {
  const hasHydrationMismatch = warnings.some(
    (w) => w.code === "hydration_mismatch",
  );
  if (!hasHydrationMismatch) return warnings;
  return warnings.filter(
    (w) => w.code !== "console_error" || !isScriptTagWhileRenderingWarning(w.message),
  );
}
```

`browserRuntimeIssues` samlas i **en** array för desktop-start, crawl och mobil
(`:825-852`), och klassificeras en gång på hela listan (`:1147`). Dedupen är
redan route-medveten (`:654` nycklar på `code|route|message`) — suppressionen är
det inte. `route` finns på varje warning (`:53-54`) men jämförs aldrig.

Konsekvensen: en hydreringskrock på `/` döljer en verklig script-varning på
`/kontakt`. Kommentaren på `:676` säger «in the same run», vilket är precis det
som är för brett.

Testet `product-postcheck.test.ts:1237-1254` använder bara `route: "/"`, så
inget cross-route-fall finns.

## Uppgiften

Gör suppressionen route-lokal. En script-varning ska bara tystas på den route
där en hydreringskrock faktiskt rapporterades.

Enklaste formen: bygg en mängd av routes med `hydration_mismatch` och filtrera
`console_error`-script-varningar mot den mängden i stället för mot en boolean.

## Gränser

- Ändra inte `isScriptTagWhileRenderingWarning`-matchningen. Vilka meddelanden
  som räknas som script-varning är inte frågan här.
- Ändra inte severity eller `productBlocked`-logiken. Det här är rapporterings-
  omfång, inte en ny grind.
- Rör inte dedupe-nyckeln på `:654`.
- Ingen ny crawl, inga extra sidladdningar.

## Klart när

- Ett test med två routes: krock på route A, script-varning på route B → B:s
  varning ska **finnas kvar**.
- Ett test där båda ligger på samma route → varningen tystas, som i dag.
- Befintligt same-route-test grönt (eventuellt omskrivet till den nya formen).
- `npm run typecheck` + `npx vitest run src/lib/gen/verify` gröna.

## Agentprompt

> Du är Builder i Sajtmaskin. Utgå från origin/master. Läs
> `docs/plans/active/2026-08-20-vagschema/00-master-plan.md` (agentkontraktet)
> och sedan den här filen.
>
> Uppgift: `dropDerivedScriptTagWarnings` i `src/lib/gen/verify/product-postcheck.ts`
> tystar next-themes-script-varningar över hela crawlen så snart **någon** route
> hade en hydreringskrock. Gör suppressionen route-lokal — varje warning bär
> redan `route`.
>
> Ändra inte meddelandematchningen, severity, `productBlocked`-logiken eller
> dedupe-nyckeln. Lägg till ett cross-route-test som bevisar att en varning på
> en ren route överlever.
>
> Verifiering: `npm run typecheck`, `npx vitest run src/lib/gen/verify`.
>
> EN PR mot master, inte draft. Bugbot-pass på egen diff, sign-off-kommentar
> innan `merge:ready`. Du mergar inte. Rör inte `BUG-SWARM-BACKLOG.md`.
