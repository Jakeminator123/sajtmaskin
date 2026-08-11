# 01 — Product Postcheck: vad den är, vad den kollar, och om den ger bättre sajter

**Status:** kartläggning klar · åtgärd 3 nedan väntar på go
**Källor:** `src/lib/gen/verify/product-postcheck.ts`, `src/lib/config.ts`, `docs/ENV.md`, prod-loggar 2026-08-11

## Kort svar

| Fråga | Svar |
|---|---|
| Ger Postcheck mer fungerande sajter? | **Ja, potentiellt mycket** — den är den enda kontrollen som öppnar sajten i en riktig webbläsare. Men den kraschar i prod ([`02`](02-tmp-krasch.md)), så nyttan uteblir i dag. |
| Vad kollar den? | Trasiga länkar/bilder, döda CTA:er, fejkformulär, mobilmeny, browser-runtime-fel. Se tabellen nedan. |
| Var det den som stängdes av för SEO-varningar? | **Nej.** SEO-varningarna kommer från `post-checks-results.ts` (kategori `seo`). Postcheck rör inte SEO. |

## Vad den gör

Startar Chromium (Playwright) på servern, surfar in på preview-URL:en, kryper upp
till 5 sidor (`MAX_CRAWL_ROUTES`, deadline 25s) och läser av DOM + runtime i både
desktop- och mobilvy. Den kontrollerar alltså **produkten**, inte koden.

| Kod | Fångar | Blockerar? |
|---|---|---|
| `broken_anchor` | `<a href="#x">` vars mål inte finns | **Ja vid ≥2** |
| `mobile_menu_failed` | hamburgermenyn går inte att öppna | **Ja** |
| `runtime_crash` | React-fatalt fel eller Next-felöverlägget | **Ja** |
| `broken_image` | bild laddade inte (`naturalWidth === 0`) | nej |
| `cta_no_handler` | knapp/länk utan mål eller handling | nej |
| `fake_form` | formulär ser aktivt ut men saknar `action`/integration | nej |
| `hydration_mismatch` | hydration-fel i konsolen | nej |
| `console_error` · `request_failed` · `http_error` | konsolfel, döda requests, 4xx/5xx | nej |

Render-fatala mönster som blockar: `Element type is invalid`, `Minified React error`,
`Objects are not valid as a React child`, `Rendered more/fewer hooks than`,
`Maximum update depth exceeded`.

Två egenskaper som är lätta att missa:

- **`demoOnly` respekteras.** Formulär och CTA:er märkta som demo räknas inte som fejk — Postcheck bråkar alltså inte om F2-demoytor.
- **Fail-open.** Kan den inte köra loggas `product_postcheck.skipped` och versionen släpps igenom. Den kan aldrig falskt-röda en fungerande sajt.

Blockerande fynd stoppar **F3-triggern**, inte F2-previewen.

## Varför den skulle hjälpa

Ingen annan kontroll i kedjan öppnar sajten:

| Kontroll | Ser |
|---|---|
| typecheck / build | att koden kompilerar |
| verifier-LLM | att koden *läser* rätt |
| SEO review | metataggar, robots, sitemap |
| RenderGate | att dev-servern svarar |
| **Product Postcheck** | **att sidan fungerar för en människa** |

Konkret från sessionen: verifiern flaggade i Gen2 v1 att `demo-dialog.tsx` och
`login-panel.tsx` "bara sätter lokal state" — men det var en *läsning av koden*.
Postcheck hade kunnat bekräfta det i DOM:en och hade sannolikt fångat AI-sidans
attrapp (`fake_form` / `cta_no_handler`) före publicering.

## Historiken bakom "jag tror jag stängde av den"

Tre signaler är lätta att blanda ihop:

| Signal | Källa | Upplevelse |
|---|---|---|
| "SEO review hittade N launch-varning(ar)" | `post-checks-results.ts`, kategori `seo` | brusigt, varje körning |
| "Automatic preflight reported issues" | preflight-summeringen | brus |
| "F2 Product Postcheck skipped" | Postcheck | såg ofarligt ut, var en krasch |

`SAJTMASKIN_F2_PRODUCT_POSTCHECK` är **inte satt** i prod-env ⇒ default på
(kill-switch = strängen `false`). Före 2026-08-05 importerade modulen `playwright`
rakt av — en devDependency som inte finns på Vercel — så den var tyst verkningslös i
prod. Det är sannolikt det minnet som sitter kvar.

## Åtgärder

1. **Behåll påslagen.** Enda produktnära kontrollen, kan inte falskt-röda.
2. **Fixa `/tmp` först** ([`02`](02-tmp-krasch.md)) — annars är den på men blind.
3. **Låt kraschar synas — GJORT 2026-08-11:** krasch-orsakerna
   (`playwright_unavailable`, `navigation_failed`, `timeout`, `runtime_error`)
   loggas nu som `warning` i `buildProductPostcheckLogItems`
   (`src/lib/hooks/chat/post-checks.ts`); policy-skips förblir `info`.
   Gates opåverkade — verdikt-läsarna ankrar på `preflight:quality-gate`.
4. Rör **inte** SEO-modulen i samma ändring — separat brusfråga.
