# K2 — hero-variation i scaffold-filerna

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)
Status: redo efter #1087-merge. Parallell med K3/K4.

## Problemet

Tre webbscaffolds hårdkodar **samma** hero-komposition (text vänster + Card
höger) i sina faktiska filer:

- `src/lib/gen/scaffolds/landing-page/files/app/page.tsx:29` — `lg:grid-cols-[1.15fr_0.85fr]`
- `src/lib/gen/scaffolds/saas-landing/files/app/page.tsx:50` — `lg:grid-cols-[1.05fr_0.95fr]`
- `src/lib/gen/scaffolds/portfolio/files/app/page.tsx:44,99` — `lg:grid-cols-[0.95fr_1.05fr]`

Varianterna byter bara tokens/promptrader — och default-varianterna
(`corporate-grid`, `friendly-saas`, `minimal-studio`) **beskriver** dessutom
splitten, så fil + default drar åt samma håll. Init är visserligen
«inspirational» (fil-kroppen göms), men komponentvokabulären + default-hints +
addenda har i praktiken producerat samma 60/40 överallt.

## Uppgift

1. Ge de tre scaffoldsen **olika** hero-grundkomposition i filerna:
   - `landing-page`: behåll split (det är en legitim komposition — den ska bara
     inte vara den enda överallt).
   - `saas-landing`: byt till centrerad produkt-scen (rubrik centrerad,
     produktyta under, full bredd) eller annan tydligt icke-split-komposition.
   - `portfolio`: bilddominant/editorial (stor featured-yta, text under eller
     överlagd) — inte text-vänster+kort-höger.
2. Uppdatera default-varianternas `signaturePatterns.layouts` så de beskriver
   den nya filkompositionen (fil och default-variant får inte motsäga
   varandra).
3. Kontrollera att mönsterbrytande varianter (`hero-fullbleed-bg`,
   `asymmetric-stack`, `showcase-bold`) inte längre motsägs av filerna de
   bygger på; justera deras `layouts`-texter vid behov.
4. Behåll: placeholder-copy-konventionen (`[Rubrik]`, `[Företagsnamn]`),
   svenska ankare (`#erbjudande`, `#kontakt`), shadcn-vokabulären, inga nya
   dependencies, `SCAFFOLD_PROTECTED_PATHS`/`LLM_ONLY_PATHS` orörda.
5. Varianttexter ändrade ⇒ regenerera variant-embeddings.

## Vad som INTE ingår

- Nya sektioner, nya routes eller nya komponentfiler utöver hero-ombyggnaden.
- Blog/ecommerce (har redan egna kompositioner) och app-scaffolds.
- Ändringar i prompt-renderaren (det är K3).
- Copy-omskrivningar utanför hero-sektionerna.

## Verifiering

- `npm run typecheck` + `npm run scaffolds:validate`
- `npm run scaffolds:variant-embeddings` (eller `embeddings:ensure`) + parity-testet
- Riktad vitest på `scaffold-manifest-validation` och `variant-integrity`
- Manuell diff-läsning: tre olika grid-strukturer i de tre page.tsx-filerna

## Klart när

De tre webbscaffoldsen har bevisbart olika hero-DOM i filerna, default-varianter
och filer säger samma sak, och embeddings-index är i synk.
