# A3 — Abuse och rate limit

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)
Hör ihop med: [`A2-gastpolicy-credits.md`](A2-gastpolicy-credits.md)
Status: inte startad. Bygg inte en gästväg utan det här taket.

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

4 LLM-anrop / 10 min / IP är för löst för en gratismagnet och för tajt
som enda tak om många inloggade delar NAT. Gäst utan durabel dagsräknare
kan rotera IP.

`getClientId` får **inte** ta cookie / `x-session-id` som identitet —
kommentaren i `rate-limit.ts` säger varför.

## Uppgift

1. **Ny nyckel** t.ex. `audit:public` (namn fritt, inte återanvänd
   `audit:create` som enda gästtak). Föresatt default vid G1:
   1 req / 24 h / IP, plus ev. kort burst-tak (t.ex. 2 / 10 min) mot
   parallella klick.
2. **Behåll** `audit:create` för inloggade. Skicka `userId` in i
   `withRateLimit` när `prepareCredits` har en user, så bucketen blir
   `user:…` i stället för delad NAT-IP.
3. **In-flight för gäst:** nyckel utan user-id, t.ex.
   `ip:canonicalKey`. Process-lokal `Map` får vara *best effort* mot
   dubbelklick men **inte** enda kostnadsskydd. Om G1: durabel räknare
   (samma Redis som rate-limit) är A2:s grant — den här aktiviteten
   kopplar den till 429/409.
4. 429-svar ska vara begripligt på svenska i den publika ytan (nu:
   `"Too many requests"`). Inte ett nytt i18n-system; en sträng i
   befintligt JSON-fel.
5. SSRF, `MAX_PAGES`, `validateAndNormalizeUrl` orörda. Blockera inte
   publika sajter hårdare «för säkerhets skull» utan repro.
6. Tester: gäst slår taket; inloggad på samma IP kan fortfarande köra
   betald audit (skilda nycklar); ogiltig URL räknas inte som grant
   (handler validerar URL **före** credits redan i dag).

## Inte den här aktiviteten

- URL-resultatcache («samma domain → återanvänd rapport»). Kostnadshebel
  men stale + integritet; kräver eget ja.
- WAF / Vercel Firewall-regler som enda tak (får komplettera, inte
  ersätta applikationsnyckeln).
- Sänka `AUDIT_COSTS`.
- Global rate-limit-refaktor för andra endpoints.

## Klart när

- Gästvägen (om G1) har durabelt dygnstak + synlig 429.
- Inloggad väg har oförändrat eller bättre tak (`user:`-id).
- In-flight påstår inte kluster-garanti om den fortfarande är en `Map`.
- `route.test.ts` täcker 409-release (finns) plus nya 429/gästfall.
- A2 utan det här taket mergas inte.

## Stopp

Pausa om durabel räknare saknas i miljön (ingen Upstash) och någon
föreslår process-minne som prod-tak. Pausa om gäst-id föreslås som
client-header.
