# K1 — Inline bild i kallt mejl/DM (A/B)

> **Status: protokollet är levererat, experimentet är inte genomfört.**
> Hypotesen är obevisad tills utskicken faktiskt gått ut och utfallet är
> inskrivet här. Ingen ny produktförmåga behövs — render-till-bild finns
> redan i koden.

Utskick och leadhantering ägs av ägarens separata repo
`Jakeminator123/JakobScrape` («POIT-leads och dashboard»). Sajtmaskin-repot
ska **inte** få en utskicks- eller leadpipeline för det här spåret.

Spår 1 av de fyra kvarvarande i
[`../resterande-fyra-spar.md`](../resterande-fyra-spar.md). Det här spåret
letar inga nya leads — det förbättrar kuvertet på outreach som ändå ska ut.

## Hypotes

Samma mejl med mockupen *i* meddelandet ger fler svar än samma mejl med
bara en länk, därför att första intrycket inte kräver ett klick.

**Endast inline-bilden varieras.** Copy, länk, segment, avsändare och
tidpunkt hålls lika. Ändras något mer mäter testet inte bilden.

## Uppställning

| Del | Värde |
|---|---|
| Population | en liten batch, samma leadtyp i båda armarna |
| Arm A | dagens utskick: text + privat previewlänk |
| Arm B | samma copy och samma länk + mockupen inbäddad (CID i e-post, bifogad bild i LinkedIn-DM) |
| Storlek | ~20 riktiga leads per arm — ett **pilotprov**, inte ett statistiskt facit |
| Fördelning | varannan lead till B; lägg inte de mest lovande i B |

## Mått

| Roll | Mått |
|---|---|
| Spärr | **Leveransgrad** — får inte försämras i B; bildtunga mejl fastnar först i spamfilter |
| Primärt utfall | **Positivt svar** |
| Sekundärt | Klick vidare till previewen |
| Endast orienterande | Öppningar — styr inte beslutet |

Beslutsregel, i den ordningen:

1. Faller leveransgraden i B → B förlorar, resten av mätningen är brus.
2. Håller leveransen och andelen positiva svar är tydligt högre i B → B vinner.
3. Är skillnaden liten → **INCONCLUSIVE**. Vid den storleken finns ingen
   vinnare att utropa; skriv in det som obesvarat, inte som ett nej.

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
- Inget utskicksskript och ingen automation i det här repot. Utskicken hör
  i `JakobScrape`; vinner B är nästa steg att kapsla in den befintliga
  capturen bakom ett litet körbart steg — och det beställs separat.
- Skriv inte «spår 1 klart» när protokollet är skrivet. Spåret är klart när
  utfallet står här.
- Ingen auto-start av generation från utskicket — samma regel som
  [`A4-cta-handoff.md`](A4-cta-handoff.md).
- Bygg ingen Radar för det här spåret. Det behöver ingen signal.
