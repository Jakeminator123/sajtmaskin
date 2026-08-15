# T7 — Readiness ska bli röd när produktkontrollen blockerar

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)
Ägarbeslut: **B1**, fattat 2026-08-15.

## Problemet

Samma körning kan i dag visa grönt och rött om exakt samma sak. I prod-körning
`6e865848-8df5-46e9-aa81-c52ce7221d07` (2026-08-14) loggades i tur och ordning:

```text
21:41:33Z  product_postcheck.preview_boot_page  → productBlocked: true
21:41:33Z  product_postcheck.summary            → F2 Product Postcheck found 1 warning(s)
21:42:21Z  preflight:quality-gate               → Automatic quality gate passed
           Readiness: PASS (changes + preview + stream quality)
```

Produktkontrollen sa att den inte kunde bekräfta sajten. Readiness sa `PASS`.
Telemetrin skrev dessutom `preview_success=true`.

`BUG-SWARM-BACKLOG.md` rad `SM-049` beskriver dagens läge: #981 projicerar
Product Postcheck-fynd som **advisory** warnings i readiness och sätter
`productPostcheckBlocksF3`, men `canDeploy` och `assertPromoteAllowed` läser
medvetet **inte** `productBlocked` — det var ett eget ägarbeslut.

## Beslutet (B1)

Ägaren valde 2026-08-15: **Readiness ska bli röd när produktkontrollen blockerar.**
En sanning, strängare hållning. Motivet är att en statusflagga som säger `PASS`
medan en kontroll säger "jag kunde inte se sajten" gör att man inte kan lita på
grönt någonstans.

## Uppgift

1. Låt readiness-ytan spegla `productBlocked` i stället för att bara projicera
   fyndet som en advisory varning. Kanonisk ägare är `src/lib/chat-readiness.ts`
   (~rad 224-286); ytan exponeras via
   `src/app/api/engine/chats/[chatId]/readiness/route.ts` (~rad 539-591).
2. **Avgränsning — rör inte deploy- och promote-grindarna.** B1 gäller
   readiness-*ytan*. `canDeploy` och `assertPromoteAllowed` ska förbli som de är;
   att de inte läser `productBlocked` är ett separat, uttryckligt ägarbeslut som
   inte har rivits upp. Bredda inte scope dit.
3. Se till att orsaken följer med. En röd readiness ska kunna säga **varför** —
   vilket `product_postcheck.*`-fynd som orsakade den. En röd lampa utan orsak
   flyttar bara gissandet.
4. **Registrera beslutet:** lägg B1 i
   [`docs/decisions/README.md`](../../../../decisions/README.md) med datum
   2026-08-15 och pekare till kanonisk källa (`chat-readiness.ts`). Arkivera
   backloggraden `SM-049`s relevanta del med pekare dit, enligt
   `plan-lifecycle.mdc` § Ägarbeslut.

## Var försiktig här

Efter #1002 finns nu **två** skilda utfall från produktkontrollen:
`preview_boot_page` (startsidans markörer matchade — hosten är faktiskt inte klar)
och `preview_probe_unreadable` (Chromium gav inget läsbart — vi vet inte).

Det andra är **advisory och ska inte blockera**. Läs `product-postcheck.ts` och
`preview-boot-page.ts` på master innan du kopplar in något, så att den nya röda
readinessen inte utlöses av "vi kunde inte se" — det vore att återinföra samma
felklass i en ny yta.

## Vad som INTE ingår

- Ingen ny visuell yta i buildern. Återanvänd den befintliga readiness-ytan.
- Ingen ändring av promotion, deploy eller `preview_success`-telemetrin.
- Ingen env-flagga.

## Verifiering

- Test: `productBlocked: true` med ett `preview_boot_page`-fynd → readiness röd,
  och orsaken syns i svaret.
- Test: `preview_probe_unreadable` → readiness **inte** röd (advisory).
- Test: `canDeploy` / `assertPromoteAllowed` är oförändrade av ändringen.
- `npm run typecheck` + `src/lib/chat-readiness.test.ts` och
  `src/app/api/engine/chats/[chatId]/readiness/route.test.ts`.
- `npm run docs:check` + `npm run docs:links` efter decisions-tillägget.

## Klart när

En körning inte längre kan visa `Readiness: PASS` samtidigt som
produktkontrollen blockerade, ett `preview_probe_unreadable` fortfarande är
advisory, och B1 är registrerat i decisions-registret.
