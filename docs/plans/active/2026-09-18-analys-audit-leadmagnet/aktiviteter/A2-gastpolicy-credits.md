# A2 — Gästpolicy och credits

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)
Status: pågår. Default G1 som 1 körning / 24h per IP via `analys:public`.
Ingen credit-debitering. Inloggade Audits är oförändrade.

## Uppdrag

Låt en gäst köra auditen på `/analys` utan att nollställa prislistan
eller bränna kontots free-generation — eller välj medvetet att inte
låta gästen köra.

## Problemet

`prepareCredits` utan användare returnerar 401
(`failureType === "auth"`). Audit-handlern skickar **inte**
`allowFreeGeneration`. Den flaggan kan ändå bara slå för
`prompt.create` / `prompt.refine`
([`src/lib/credits/server.ts`](../../../../../src/lib/credits/server.ts)).

Klienten speglar det: `SiteAuditSection` avbryter före POST om
`!isAuthenticated` och visar saldo mot `AUDIT_COSTS`
(15 / 25 i [`pricing.ts`](../../../../../src/lib/credits/pricing.ts)).

Entry-modalen lovar ändå «helt gratis». Det är A4:s copy; den här
aktiviteten äger *sanningen bakom copy*.

Inloggade betalar efter lyckad analys via `creditCheck.commit`. Ingen
resultatcache på URL, så varje körning kostar scrape + LLM.

## Tre alternativ

### Alt G1 — 1 × basic / IP / kalenderdygn

Gäst får köra `audit.basic` en gång per IP och dygn. `audit.advanced`
fortsätter kräva konto + credits.

| Plus | Minus |
|---|---|
| Faktisk magnet: scores och förbättringar utan konto | LLM-kostnad per unikt IP |
| Taket är begripligt | IP-rotation, CGNAT, VPN |
| Advanced förblir betald | Kräver durabel räknare (Redis/Upstash, inte process-minne) |

Implementation (när vald): utöka `prepareCredits` *eller* en smal
audit-grant bredvid den — inte en andra creditägare. Nollställ inte
`AUDIT_COSTS`. Konsumera inte `free_generation_available`. In-flight-
nyckel för gäst kan inte vara `user.id` (finns inte) — A3.

**Paketets default.** Full rapport i modal. PDF/spara/handoff = signup
(A4).

### Alt G2 — Signup-wall före körning

Behåll 401. `/analys` är landning med ärlig copy och inloggnings-CTA.
Minsta kod, noll ny spend, svag magnet. Välj detta om B1 är «ingen
gäst-LLM».

### Alt G3 — Preview-scores + signup för PDF

Kör (eller visa) scores, lås PDF/rapportbakom konto.

| Plus | Minus |
|---|---|
| Konverteringskrok | Riktiga scores ⇒ samma LLM-kostnad som G1 |
|  | Fejkade/heuristiska scores ⇒ ny analysväg = utanför scope |

Välj G3 bara om Jakob uttryckligen vill ha delvis låst UI **och**
accepterar antingen G1:s kostnad eller en svagare, icke-LLM-preview
(då är det inte den befintliga wow-rapporten).

## Rekommendation

**G1 + A4-lås på PDF/spara/bygg.** G2 om ja-paketet avvisas till förmån
för noll gästspend. Inte G3 som första steg.

B5 i masterplanen: ingen advanced för gäst.

## Uppgift när B1 är G1

1. Gästväg bara för `audit.basic` från den publika ytan (flagga eller
   Origin/referrer räcker inte — client-controlled. Serverbeslut:
   t.ex. `auditMode: "basic"` + avsaknad av session + durabel IP-grant).
2. 402-vägen för inloggade med för lite saldo lämnas orörd.
3. Testanvändare och `isTest` ändras inte i tysthet.
4. Klientflaggor i `SiteAuditSection`: gäst får skicka basic utan
   diamond-precheck; credit-chip för gäst visar «1 gratis analys / dygn»
   bara om det stämmer.
5. Telemetri/logg: `requestId` finns redan. Skilj `guest_grant` från
   charged så kostnaden syns.
6. Preview och prod delar databas. Grant-nyckeln ska inte kunna
   återställas genom att byta cookie (`getClientId` vägrar gäst-id).

## Uppgift när B1 är G2

Ingen creditsändring. A1+A4 räcker. Den här filen stängs med en rad i
PR-bodyn: «G2 valt, prepareCredits orörd».

## Gränser

- Inte `AUDIT_COSTS.basic = 0`.
- Inte `allowFreeGeneration` på audit-actions.
- Inte kampanj-entitlement (`kostnadsfri`) som bakdörr.
- Inte URL-cache utan nytt ja.
- Inte ny betalskala. Prislistan i `pricing_settings` förblir ägare för
  inloggade.

## Klart när

- B1 är skrivet i PR-bodyn.
- G1: gäst basic 1/IP/dygn grönt i test; andra anrop 401/402/429 enligt
  kontrakt; inloggad 15/25 oförändrat.
- G2: 401 kvar, dokumenterat.
- `src/lib/credits/server.test.ts` + audit-routetester uppdaterade.
- A3:s tak är på plats i samma eller omedelbart följande PR. G1 utan A3
  är stopp.

## Stopp

Pausa om grant behöver ny tabell utan additiv migration, om någon vill
återanvända free-generation, eller om gästresultat ska skrivas i
`user_audits` utan user-id (cross-tenant / anonyma rader).
