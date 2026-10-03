# A3 — Abuse och rate limit

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)
Hör ihop med: [`A2-gastpolicy-credits.md`](A2-gastpolicy-credits.md)
Status: levererad. `analys:public:attempt` är försökstaket och
`public-analys-quota` äger kvoten för levererade rapporter.

## Uppdrag

Ge den publika audit-vägen ett tak som överlever mer än en
serverless-instans, utan att sänka SSRF-skyddet eller öppna
inloggades betalsaldo.

## Problemet

Nuvarande skydd är dimensionerat för **inloggade, betalda** anrop — och
är dessutom svagare än det ser ut.

| Skydd | Verklighet |
|---|---|
| `audit:create` 4 / 10 min | [`RATE_LIMITS`](../../../../../src/lib/rate-limit.ts). Handler anropar `withRateLimit(request, "audit:create", …)` **utan** `userId` → `getClientId` blir `ip:…` även för inloggade. |
| Upstash i prod, in-memory fallback | Samma fil. In-memory är per process; kommentaren varnar redan för serverless. |
| `inFlightAudits` | [`in-flight.ts`](../../../../../src/app/api/audit/modules/in-flight.ts): process-lokal `Map`, nyckel `userId:canonicalKey`, stale-städ 10 min. På Vercel stoppar den dubbletter *i samma isolat*, inte kluster-wide. |
| SSRF + max 4 sidor | [`webscraper.ts`](../../../../../src/lib/webscraper.ts) + [`ssrf-guard.ts`](../../../../../src/lib/ssrf-guard.ts). Behålls. |
| Ingen URL-resultatcache | Varje släppt anrop = scrape + LLM. |

Den betalda vägens `audit:create` är inte gästvägens enda skydd. Gästvägen
har ett separat kort försökstak och en durabel leveranskvot; processlokal
in-flight är bara best effort.

`getClientId` får **inte** ta cookie / `x-session-id` som identitet —
kommentaren i `rate-limit.ts` säger varför.

## Uppgift

1. **Försökstak:** `analys:public:attempt` tillåter 3 försök / 10 min
   och fail-close:ar vid limiterfel.
2. **Leveranskvot:** `public-analys-quota` reserverar per klient och
   Stockholmsdygn. Bara ett serverbekräftat 200-svar committar kvoten;
   fel släpper reservationen.
3. **Behåll** `audit:create` för den separata inloggade audit-vägen.
4. **In-flight för gäst:** process-lokal `Map` är *best effort* mot
   samma URL samtidigt men **inte** enda kostnadsskydd.
5. 409/429-svar ska skilja på pågående URL, upptagen/brukad dygnskvot och
   försökstak så klienten inte visar fel återkoppling.
6. SSRF, `MAX_PAGES`, `validateAndNormalizeUrl` orörda. Blockera inte
   publika sajter hårdare «för säkerhets skull» utan repro.
7. Tester: parallell reservation, fel/retry, Redisfel, 409 och separata
   429-koder. Ogiltig URL valideras före försökstak och leveranskvot.

## Inte den här aktiviteten

- URL-resultatcache («samma domain → återanvänd rapport»). Kostnadshebel
  men stale + integritet; kräver eget ja.
- WAF / Vercel Firewall-regler som enda tak (får komplettera, inte
  ersätta applikationsnyckeln).
- Sänka `AUDIT_COSTS`.
- Global rate-limit-refaktor för andra endpoints.

## Klart när

- Gästvägen har durabel leveranskvot + separat försökstak och synliga felkoder.
- Inloggad väg är oförändrad.
- In-flight påstår inte kluster-garanti om den fortfarande är en `Map`.
- `route.test.ts` täcker release vid motorfel, 409 och separata 429/gästfall.
- A2 utan det här taket mergas inte.

## Stopp

Pausa om durabel räknare saknas i miljön (ingen Upstash) och någon
föreslår process-minne som prod-tak. Pausa om gäst-id föreslås som
client-header.
