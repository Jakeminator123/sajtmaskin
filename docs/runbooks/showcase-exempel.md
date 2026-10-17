# Showcase-exempel — live-läge

Produktens kanoniska URL-lista ägs av
[`src/lib/exempel/showcase-sites.ts`](../../src/lib/exempel/showcase-sites.ts).
Publik indexerbar yta: [`/exempel`](https://sajtmaskin.se/exempel). Facit är
live GitHub + live HTTP/Vercel, inte äldre revival-handoffs.

## Live 2026-10-18

Inget exempel är kundcase eller exakt output från nuvarande Sajtmaskin.
Byråflöde, Springa, Palma, Paddlelines och Glass är **rekonstruktioner**, inte
verifierade verksamheter, och ska förbli `noindex` / `Disallow: /`.
DG97, Kontorshotellkartan, Persona Royale, Scout Gaming och Nexus OS är egna
live-projekt och koncept; deras indexering styrs i respektive repo.

| Exempel | Repo | Live-URL |
|---|---|---|
| DG97 Kontorsguiden | `Jakeminator123/dg-97` | https://www.dg97.org |
| Kontorshotellkartan | `Jakeminator123/kontorshotellkartan` | https://kontorshotellkartan.se |
| Persona Royale | `Jakeminator123/persona-royale-casino` | https://persona-royale-casino.vercel.app |
| Scout Gaming | `jakeminator0/sajtmaskin-casino` | https://sajtmaskin-casino-f440ccf7.vercel.app |
| Nexus OS | `jakeminator0/futuristic-dashboard` | https://futuristic-dashboard-five-indol.vercel.app |
| Byråflöde | `Jakeminator123/byraflode-showcase` | https://byraflode-showcase.vercel.app |
| Springa | `Jakeminator123/springa-showcase` | https://springa-showcase.vercel.app |
| Palma | `Jakeminator123/palma-showcase` | https://palma-showcase.vercel.app |
| Paddlelines | `Jakeminator123/paddlelines-showcase` | https://paddlelines-showcase.vercel.app |
| Glass | `Jakeminator123/glass-showcase` | https://glass-showcase-umber.vercel.app |

Bare alias `glass-showcase` (utan `-umber`) tillhör en orelaterad
bröllopssida. Länka aldrig dit och rör inte den aliasen.

Byråflöde kör production från `main`. Springa, Palma, Paddlelines och Glass
kör redan publika `*.vercel.app`-alias från sina `preview`-grenar. Påståendet
i `byraflode-showcase/SHOWCASE_REVIVAL_HANDOFF.md` att 02–05 bara finns lokalt
är **stale**.

Befintlig återlänk från showcase-sidorna till Sajtmaskin:

`https://sajtmaskin.se/builder?new=1&utm_source=<id>&utm_medium=showcase&utm_campaign=showcase_revival`

Ändra inte det UTM-kontraktet utan skäl.

## Hygiene

- Radera inga gamla Vercel-projekt, original eller `*-revival`.
- Skapa inga nya showcase-projekt eller `*-revival-2`.
- Inga DNS-writes. Föreslagna `*.exempel.sajtmaskin.se` är inte skrivna.
- Normalisera inte remote-branches om det kan byta production-target.
- `LandingFooter` ägs av SEO-spåret; `/exempel` länkas från navbar och
  startsidans kompakta proof-strip.

Kvar manuellt: uppdatera stale revival-handoff i `byraflode-showcase` utan att
promota eller byta live-alias. Inte ett sajtmaskin-kodsteg.
