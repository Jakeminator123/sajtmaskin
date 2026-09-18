# K1 — Inline bild i kallt mejl/DM (A/B)

> **Status: körbar nu.** Ingen ny produktförmåga behövs — render-till-bild
> finns redan i koden. Själva utskicken är ägarens steg; den här filen är
> protokollet så testet inte blir en känsla.

Spår 1 av de fyra kvarvarande i
[`../resterande-fyra-spar.md`](../resterande-fyra-spar.md). Det här spåret
letar inga nya leads — det förbättrar kuvertet på outreach som ändå ska ut.

## Hypotes

Samma mejl med mockupen *i* meddelandet ger fler svar än samma mejl med
bara en länk, därför att första intrycket inte kräver ett klick.

Det som varieras är bilden. Målgrupp, copy och avsändare hålls lika.

## Uppställning

| Del | Värde |
|---|---|
| Population | en liten batch, samma leadtyp i båda armarna |
| Arm A | dagens utskick: text + privat previewlänk |
| Arm B | samma copy och samma länk + mockupen inbäddad (CID i e-post, bifogad bild i LinkedIn-DM) |
| Storlek | ~20 riktiga leads per arm — v3-disciplinen, inte en kampanj |
| Fördelning | varannan lead till B; lägg inte de mest lovande i B |

## Mått, i den ordningen

1. **Levererat** — bildtunga mejl är det första som fastnar i spamfilter.
2. Öppnat.
3. Svar.
4. Positivt svar.
5. Klick vidare till previewen.

Beslutsregel: B vinner bara om leveransgraden håller **och** andelen
positiva svar är högre. Faller leveransen är resten av mätningen brus.

## Det som redan finns

| Del | Var |
|---|---|
| Render-till-bild | [`captureThumbnailScreenshot`](../../../../../src/lib/projects/thumbnail-capture.ts) — 1200×750 JPEG, SSRF-grindad, samma motor som projektminiatyrerna |
| Rapport som bevis i mejlet | `/analys` (#1471) |

Kört lokalt 2026-09-18: `example.com` → 15,5 kB JPEG på ~2,5 s.
`sajtmaskin.se` → 20,2 kB, men bilden visar **cookie-rutan**, inte sidan.

## Fynd som styr utförandet

En capture av en **levande tredjepartssajt** fotograferar ofta
samtyckesdialogen. Två följder:

- Inline-bilden ska komma från den **genererade** förslagssidan, som inte
  har någon samtyckesvägg — inte från ett foto av leadets nuvarande sajt.
- Vill man ha en «före»-bild måste samtyckesrutan hanteras först. Tills
  dess: skicka ingen före-bild.

## Stoppregler

- Bilden är ett **förslag**, inte en påstådd färdig leverans.
- Skriv inget skript och ingen automation förrän B faktiskt vinner. Först
  då är nästa steg att kapsla in den befintliga capturen bakom ett litet
  körbart steg.
- Ingen auto-start av generation från utskicket — samma regel som
  [`A4-cta-handoff.md`](A4-cta-handoff.md).
- Bygg ingen Radar för det här spåret. Det behöver ingen signal.
