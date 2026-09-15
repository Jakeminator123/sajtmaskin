# 01 — Varumärkta adresser

Mål och pilotundantag: [N1](00-master-plan.md).
Driftinstruktioner: [branded-user-urls](../../../runbooks/branded-user-urls.md).

## Verifierad kodbas

På granskad `preview` finns `resolveLiveUrl` (custom → branded → provider),
slug-reservation, exakta Vercel-alias och ett migreringsskript. De är byggstenar;
de bevisar inte att DNS, TLS eller produktionsflaggor är aktiva.

`sites.sajtmaskin.se` rapporterades som NXDOMAIN 2026-08-24 i runbooken. Ny
mätning krävs i A1. Inget produktions-DNS har ändrats i plan-PR:n.

## Adresskontrakt

| Läge | Kundens adress |
|---|---|
| Utkast | Intern förhandsvisning, inte en såld publicerad sajt |
| Pilot med godkänd version och fungerande alias | `<slug>.sites.sajtmaskin.se` |
| Egen domän klar | Kundens verifierade domän |
| Ny sajt som inte kan få någon av ovan | Väntande publicering med begriplig åtgärd |
| Äldre provider-publicering under övergång | Uttryckligt tidsbegränsat migreringsundantag |

Sluggen är stabil per `app_projects.id`. Namnbyte ändrar inte automatiskt
adressen. Branded-adressen finns kvar som sekundärt alias efter egen domän;
bara verifierade alias får omdirigeras till den valda primäradressen.

## Provider-adresser

Vercel skapar automatiska deployment-adresser. Produktmålet är att kundens
normala länkar och SEO använder rätt adress, inte att utlova att alla tekniska
URL:er kan raderas. Se [Vercels domändokumentation](https://vercel.com/docs/domains/working-with-domains/add-a-domain).

Produktionens provider-host kan omdirigeras när målhosten fungerar. Skyddade
preview-deployer, teknisk diagnostik och rollback behöver en separat väg.
`noindex` är ett sökmotordirektiv, inte åtkomstkontroll.

## Aktiviteter

| Ref | Leverans | Förutsättning |
|---|---|---|
| [A1](aktiviteter/A1-dns-och-psl.md) | Exakta kundvärdnamn, DNS/TLS och PSL-underlag | Tillgång till aktuell DNS-konfiguration |
| [A2](aktiviteter/A2-branded-eligibility.md) | Begränsad pilot och portalens grundskydd | Godkänd pilotavgränsning före aktivering |
| [A3](aktiviteter/A3-kanonisk-host-guard.md) | Samma primäradress i env, metadata och redirects | A2 för delade deployfiler |
| [A4](aktiviteter/A4-aktivering-och-migrering.md) | Pilot, därefter spårbar migrering | A1:s DNS-del, A2, A3 |

## Klart när

Ett testprojekt kan publiceras, få branded adress, få egen domän, byta tillbaka
och återställas utan loop eller fel målprojekt. Testa den verkliga HTTP-kedjan.
Äldre sajter redovisas separat tills även deras runtime är uppdaterad; ett
nytt DB-värde räcker inte. PSL-ansökan eller partnerkontakt är inte ett krav
för att bygga och granska adressfunktionerna.
