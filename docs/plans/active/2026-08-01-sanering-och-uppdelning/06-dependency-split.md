---
status: active
owner: unassigned
topic: Separera appens verkliga runtime-dependencies från generatorns "paketförråd" och lokal tooling. Kräver inventering per paket — flera "oanvända" deps bär previewens modulkarta.
created: 2026-08-01
source: Master-planens steg 9. Knip-körning + grep-verifiering 2026-08-01 — de 22 "oanvända" paketen förekommer som strängar i bl.a. dep-completer.ts, dependency-utils.ts och project-scaffold.ts.
---

# Steg 9: dependency-split

## Problemet

`package.json` bär tre olika roller i en fil (82 deps + 32 devDeps +
137 scripts):

1. **Appens runtime** — det Sajtmaskin själv importerar.
2. **Generatorns paketförråd** — versioner som genererade sajter får
   (strängbaserade referenser i `src/lib/gen/autofix/dep-completer.ts`,
   `src/lib/deploy/dependency-utils.ts`, `src/lib/gen/export/project-scaffold.ts`
   m.fl.) samt paket som F2-previewens modulkarta behöver kunna serva
   (`src/lib/gen/preview/constants.ts`, `transpile.ts`).
3. **Lokal tooling/warm-cache** — scripts som kör utanför appens runtime.

Knips 22 "oanvända dependencies" (Radix, TanStack, form-, animations- och
UI-paket, `date-fns`, `canvas-confetti`, …) är därför **inte** raderbara som
grupp — de är rollen 2-paket som saknar statiska imports.

## Arbetsgång

1. **Inventering (läs-only, en tabell i denna fil):** för varje av de 22 +
   övriga gränsfall, klassa:
   - (a) importeras statiskt av appen ⇒ roll 1,
   - (b) del av preview-modulkartan / warm-cache som kräver installerad kod
     ⇒ måste stanna som installerad dependency (roll 2-installerad),
   - (c) förekommer bara som versionssträng i generator-katalogen ⇒ kan
     flyttas till **data** (roll 2-deklarativ).
2. **Deklarativ katalog:** flytta (c)-paketens versioner till en JSON-katalog
   (t.ex. `config/generated-site-dependencies.json`) som `dep-completer`/
   `dependency-utils`/`project-scaffold` läser. Då slutar appens
   `package.json` ljuga om vad appen använder, och knip blir signal i st.f.
   brus. En källa — inte hårdkodade versioner i tre filer (signal-gate-regeln:
   ändra ägaren, inte fem konsumenter).
3. **Scripts-städning:** 137 scripts — gruppera med prefix (finns delvis) och
   flytta rena engångs-/forskningsscripts till `scripts/` med egen README
   i st.f. package.json-poster. Mål < 100.
4. **Uppdatera** `docs/architecture/code-map.md` + `docs/ENV.md` om
   katalogfilen införs, och knip-konfigen så roll 2-installerade paket är
   medvetet undantagna med kommentar.

## Risker

| Risk | Skydd |
|---|---|
| Preview slutar kunna serva ett paket som togs bort | Inventeringssteget (b) är blockerande innan någon rad flyttas; riktade preview-tester + `npm run scaffolds:validate` |
| Genererade sajter får odeklarerad versionsdrift | Katalog-JSON:en blir enda källan; test som diffar katalogen mot det `project-scaffold` skriver |
| Lockfil-churn maskerar fel | Egen PR per flytt-batch, full CI |

## Klart-kriterium

`npm run knip` rapporterar < 5 oanvända dependencies utan nya
exclude-poster, och generatorns versioner ägs av en deklarativ katalog med
test.
