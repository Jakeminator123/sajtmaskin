# A2 — Begränsad branded pilot och portalens grundskydd

Område: [01](../01-varumarkta-adresser.md). Föreslaget svar: fråga 1 i
[masterplanen](../00-master-plan.md). Kör före A3 och A4.

## Vad grinden kan och inte kan göra

En auth-dossier kan vara host-only och behöver inte läcka en session. Omvänt
kan vilken sida som helst med JavaScript försöka sätta en parent-domain-cookie,
även utan auth-dossier. Att plocka bort `supabase-auth` och `clerk-auth` är
alltså en användbar risksignal men inget isolationsbevis.

Före PSL delar kundsajter och plattform också en site-gräns under `sajtmaskin.se`.
En PSL-post för `sites.sajtmaskin.se` ska inte beskrivas som en generell lösning
för alla cookies på föräldern `sajtmaskin.se`, gamla webbläsare eller portalens
CSRF-skydd. MVP-valet är en liten kontrollerad pilot, inte fri publicering av
ömsesidigt opålitlig kod på den delade domänen.

Mekanismen bakom föräldra-risken: `.se` är ett publikt suffix, men
`sajtmaskin.se` är det inte. En webbläsare tillåter därför en värd under
`sajtmaskin.se` att sätta `Domain=.sajtmaskin.se`, och den cookien skickas
sedan även till portalen. Riktningen kundsajt → plattform är alltså den
allvarligare, eftersom `sajtmaskin_session` bär ägandet av oägda projekt.

## Utgångsläge (verifierat 2026-09-14)

Ingen av plattformens cookies sätter `Domain` i dag — alla är host-only. Det
skyddar riktningen plattform → kundsajt, men **inte** mot att en subdomän sätter
en bredare cookie med samma namn.

| Cookie | Owner | Attribut i dag |
|---|---|---|
| `sajtmaskin_auth` | `setAuthCookie`, `src/lib/auth/auth.ts:132-141` | httpOnly, secure (prod), sameSite lax, path `/` — ingen `Domain` |
| `sajtmaskin_session` | `createSessionCookie`, `src/lib/auth/session.ts:71-81` | HttpOnly, SameSite=Lax, Secure (prod), Path=/ — ingen `Domain` |
| OAuth-state | `cookieOptions`, `src/lib/auth/oauth-state.ts:346-354` | httpOnly, secure, sameSite lax, path `/` — ingen `Domain` |

`sajtmaskin_auth` är HMAC-signerad, så ett påhittat värde faller på
signaturkontrollen. Det som återstår är att en angripare tvingar in sin **egen
giltiga** session, och att gästcookien skuggas utan någon signatur alls.

## Gör

1. Ha en uttrycklig pilotallowlist per projekt och granskad publiceringsversion.
   En enkel ägarstyrd konfiguration duger i början. Återanvänd befintliga
   capability-/versionssignaler som underlag, men anta inte att de beskriver
   all körbar kod. Ny version kräver ny pilotbedömning före publicering.
2. Tillåt enkla företagshemsidor utan inloggning, kundsessioner eller känsliga
   funktioner i denna första grupp. Okänd status ger väntande branded
   publicering. Verifierad egen domän är alternativet för andra sajter.
3. Före delad pilot: inventera **alla behörighetsbärande plattformscookies**,
   minst både `sajtmaskin_auth` och `sajtmaskin_session`. Gästsessionen i
   `src/lib/auth/session.ts` ingår i tenant-scope och kan användas vid claim av
   oägda projekt; den är därför också en behörighetsgräns. Flytta dessa cookies
   till `__Host-` över HTTPS (`Secure`, `HttpOnly`, `Path=/`, ingen `Domain`)
   eller verifierat likvärdigt skydd. Inventera även OAuth-skyddscookies.
   Uppdatera alla läsare/skrivare, tenant-resolver, OAuth och utloggning
   samordnat; lämna inte gamla oprefixade cookies som fortsatt behörighets-
   fallback i produktion. Bevara legitima gästprojekt via en verifierad
   övergång; lita inte blint på en gammal gästcookie för att flytta ägarskap.
   Dokumentera eventuell ny inloggning för befintliga användare.

   **Dev-friktion som måste lösas i samma ändring:** `Secure` sätts i dag bara i
   produktion (`secure: IS_PRODUCTION` i `auth.ts`, `NODE_ENV === "production"`
   i `session.ts`), och en `__Host-`-cookie utan `Secure` avvisas av
   webbläsaren. Utan åtgärd slutar inloggning fungera lokalt. Välj antingen
   miljöberoende cookienamn (prefix bara när `Secure` är på) eller alltid
   `Secure` med https lokalt, och motivera valet i PR:n.
4. Kontrollera exakt betrodd Origin för relevanta cookieautentiserade
   skriv-API:er, eller använd befintligt likvärdigt CSRF-skydd. Tillåt inte
   `*.sajtmaskin.se`. CORS-headers och SameSite ensamma är inget sådant skydd.
   Serverwebhooks använder sina egna signaturer, inte webbläsar-Origin.
5. Använd samma eligibility-beslut vid ny publicering, ompublicering,
   URL-visning och i `scripts/db/migrate-branded-live-urls.ts`. En migration
   får inte skapa alias som deployvägen skulle neka.
6. Pilotflaggor registreras hos env-/konfigägaren. PSL-status är metadata för
   framtida utrullning; den ska inte ensam öppna alla sajter automatiskt.

[MDN om cookieprefix](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#cookie_prefixes)
beskriver browserkraven för `__Host-`. HTTPS-testet måste täcka försöket att
sätta en cookie från en annan subdomän, inte bara inspect av headern.

## Befintliga och nya sajter

Äldre provider-publiceringar får tillfälligt ligga kvar enligt migreringslistan.
För nya projekt utan verifierad egen/branded adress visas väntande publicering
eller intern preview. Dölj inte en fallback bakom beskedet att branded är klart.
En nekad ny version får inte avpublicera den gamla godkända versionen.

## Verifiering och klart

Riktade tester: allowlist/version, okänd capability, auth-sajt, egen domän,
ompublicering och migreringsskript. Verkligt HTTPS-test av parent-domain
cookie-shadowing mot både inloggad session och gästprojekt/claim, samt Origin-
grundskyddet mot portalen. Dokumentera pilotens kvarvarande risk. Full
öppen publicering kräver en senare bedömning; bygg ingen stor säkerhetsplattform
för att genomföra dessa konkreta grundkontroller.

Testa uttryckligen **dubbel-cookie-fallet**: gammalt och nytt namn i samma
request, och två cookies med samma namn där den ena är host-only och den andra
satt på föräldern. Vilken `cookies().get()` returnerar är inte garanterat, så
utfallet ska bevisas i test och inte antas. Befintliga testfiler finns för alla
tre ägarna (`auth`, `session`, `oauth-state`).
