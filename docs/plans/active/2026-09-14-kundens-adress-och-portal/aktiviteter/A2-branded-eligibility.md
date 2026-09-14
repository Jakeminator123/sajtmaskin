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
