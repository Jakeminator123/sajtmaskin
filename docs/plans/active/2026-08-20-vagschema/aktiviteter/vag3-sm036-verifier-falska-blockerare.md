# Våg 3 — `SM-036`: verifierarens falska blockerare spärrar promotion

Backlograd: `SM-036` (Aktiv kö, P1, öppen kvalitet-risk)
Beror på: `#1052` bör vara avgjord först — den rör samma verifieryta.
Ägda filer: verifier-/repair-vägen i `src/lib/gen/stream/finalize-version/`.

## Läget

Två fel i samma kalibrering:

1. **Kantfall klassas som blockerare.** Null-payload och en redan avregistrerad
   medlem ska vara kvalitetsfynd, inte något som spärrar promotion.
2. **Falska dep-fynd.** «next/react saknas» rapporteras trots att
   `package.json` har dem (signatur `777848b18c3b`). När server-verify är grön ska
   ett sådant fynd inte kunna spärra promotion.

Mätunderlag från 30 dagar: 27 repair-försök → 10 förbättrade, 16 oförändrade, 1
försämrade. Loopen kostar alltså mer än den ger i dagens kalibrering.

## Uppgiften

Kalibrera severity-mappningen och dep-existenskollen så att en spärr betyder att
något faktiskt är fel.

1. **Dep-existenskollen:** hitta varför en deklarerad dependency rapporteras som
   saknad. Utgå från signaturen `777848b18c3b`. Rimliga misstankar: kollen läser
   en annan fillista än den mergade `package.json`, eller körs före merge, eller
   matchar paketnamn på ett sätt som missar workspace-/alias-former. Rätta orsaken
   — inte symptomet med en undantagslista.
2. **Severity:** flytta de två kantfallen från blocker till quality. Gör det i
   mappningen, inte med en `if` på meddelandetexten.
3. **Regressionstest:** ett test per riktning. Ett verkligt blockerande fynd ska
   fortfarande blockera; de två kantfallen och ett dep-fynd med grön server-verify
   ska inte.

## Gränser

- Sänk **inte** severity generellt och gör inte grinden fail-open. Principen står
  fast: systemet får misslyckas, men aldrig ljuga. En falsk grön är värre än en
  falsk röd.
- Ändra inte `verificationPolicy: "strict"` och inte fixer-riskklassningen.
- Rör inte verifierarens promptbudget eller filurval — det är `SM-047` och ett
  ägarbeslut.
- Bygg ingen ny repair-agent och ingen ny LLM-ingång.
- Rör inte live-review-koden. Om `#1052` fortfarande är öppen: håll dig utanför
  dess filer och säg i PR-bodyn att den kan behöva rebasas.

## Klart när

- Dep-existenskollens orsak är hittad och rättad, med ett test som reproducerar
  det falska fyndet före fixen.
- De två kantfallen är quality, inte blocker, med test.
- Ett test bevisar att ett verkligt blockerande fynd fortfarande blockerar.
- `npm run typecheck` + `npx vitest run src/lib/gen/stream src/lib/gen/verify` gröna.

## Agentprompt

> Du är Builder i Sajtmaskin. Utgå från origin/master. Läs
> `docs/plans/active/2026-08-20-vagschema/00-master-plan.md` (agentkontraktet)
> och sedan den här filen.
>
> Uppgift: `SM-036`. Verifieraren spärrar promotion på kantfall (null-payload,
> redan avregistrerad medlem) och på falska dep-fynd — «next/react saknas» trots
> att `package.json` har dem (signatur `777848b18c3b`). Hitta orsaken till det
> falska dep-fyndet och rätta den; flytta de två kantfallen från blocker till
> quality i severity-mappningen. Skriv regressionstest i båda riktningarna.
>
> Gör inte grinden fail-open och sänk inte severity generellt — en falsk grön är
> värre än en falsk röd. Rör inte `verificationPolicy: "strict"`,
> fixer-riskklassningen, verifierarens promptbudget (`SM-047`) eller
> live-review-koden i PR #1052.
>
> Verifiering: `npm run typecheck`,
> `npx vitest run src/lib/gen/stream src/lib/gen/verify`.
>
> EN PR mot master, inte draft. Bugbot-pass på egen diff, sign-off-kommentar
> innan `merge:ready`. Du mergar inte. Rör inte `BUG-SWARM-BACKLOG.md`.
