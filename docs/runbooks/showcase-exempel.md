# Showcase-exempel — live-läge

Produktens kanoniska URL-lista ägs av
[`src/lib/exempel/showcase-sites.ts`](../../src/lib/exempel/showcase-sites.ts).
Publik indexerbar yta: [`/exempel`](https://sajtmaskin.se/exempel). Facit är
live GitHub + live HTTP/Vercel, inte äldre revival-handoffs.

## Live 2026-09-18

Alla fem är **rekonstruktioner**. De är inte kundcase, inte verifierade
verksamheter och inte exakt output från nuvarande Sajtmaskin. De ska förbli
`noindex` / `Disallow: /`.

| Exempel | Repo | Live-URL |
|---|---|---|
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
