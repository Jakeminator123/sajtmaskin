---
status: implemented-mvp
created: 2026-04-24
spår: 2 av 7 (LLM-flöde-körplan, NY efter deep-prefab feedback)
prio: P2 (största user-impact-vinst — fångar Unsplash-404, broken nav, fake forms)
estimat: 3–4 dagar (ny verifieringsnivå, kräver headless-browser i pipeline)
implemented: 2026-04-25 (MVP på branch f2-product-postcheck)
---

# Spår 2 — F2 Product Postcheck (verifiera att synliga saker fungerar)

> **Status 2026-04-25:** MVP implementerat på `f2-product-postcheck`.
> Server-only runner + API-route bakom `SAJTMASKIN_F2_PRODUCT_POSTCHECK=false`
> default, URL-allowlist, fail-open `product_postcheck.skipped`, befintlig
> `engine_version_error_logs`/Versionsdiagnostik-yta återanvänds. Ingen ny
> DB-tabell/migration/persistensmodell. Product Postcheck är warnings/status,
> inte F3 build/lint/typecheck.

## Bakgrund

Deep-prefab-agent föreslog att en hel ny verifieringsnivå behövs:

> "F2 Product Postcheck: alla synliga nav/CTA/mobilmeny-länkar fungerar, bilder laddar, anchors finns, formulär är antingen fungerande eller tydligt fake/disabled, inga 404-bilder."

**Verifieringen bekräftade att detta saknas idag.** Det som finns:

| Postcheck (idag) | Vad den kollar | Vad den INTE kollar |
|---|---|---|
| `validate-images` (HEAD-call) | URL-reachability via HEAD | `naturalWidth > 0`, semantisk match, fake images |
| `href-route-cross-check` | Interna `href` mot Next-routes | Same-page `#fragment` ↔ `id`, externa länkar |
| `quality-gate F2` | typecheck (build är F3) | DOM, click handlers, form actions |
| `visual-qa.ts` (statisk) | Kodmönster (placeholders, hero, färger) | Faktiska bilder i browser |
| `playwright` (dep i package.json) | **Används bara för inspector**, inte i F2-kö | F2-kritisk path |

I körning `eb152443`-bevisar:
- `https://images.unsplash.com/photo-1541544181051-...` blev 404 i klienten utan att fångas
- Två gallery-items visade samma "blond kvinna"
- Hero/Jakob-bild visade fel person
- Vi vet inte ens om mobilmeny-hamburgaren fungerar (ingen test)

## Föreslaget kontrakt

**F2 Product Postcheck körs efter `preview_ready` och blockar inte `previewBlocked`** (det är F2 Runtime som styr det). Den kan dock sätta:
- `productWarnings: number` — räknas upp för varje fynd
- `productBlocked: boolean` — endast vid kritiska fynd (t.ex. > 50% bilder broken, eller alla CTA:er saknar handler)

Visas i Versionsdiagnostik (se P0 spår 0) som separat **Product**-badge.

## Vad som behöver byggas

### A. Headless-browser-runner i pipeline

Vi har `playwright` som dev-dep men det körs bara för inspector. Behöver utöka:

**A1. Ny modul:** `src/lib/gen/verify/product-postcheck.ts`

```ts
export async function runProductPostcheck(params: {
  previewUrl: string;
  chatId: string;
  versionId: string;
  routes: string[];  // från route-plan
}): Promise<ProductPostcheckResult>;
```

**A2. Trigger:** efter `preview_ready` i `src/lib/providers/own-engine/generation-stream-post-finalize.ts` rad 285+, lägg in:

```ts
if (FEATURES.f2ProductPostcheck) {
  const postcheckResult = await runProductPostcheck({...});
  await persistProductPostcheck(versionId, postcheckResult);
}
```

**A3. Feature-flag:** `SAJTMASKIN_F2_PRODUCT_POSTCHECK=1` (default `0` tills stabilt).

### B. Konkreta DOM-checks

Inom `runProductPostcheck`, kör i Playwright headless:

**B1. Nav-anchors:** för varje `<a href="#x">` på sidan, verifiera att `id="x"` finns. Detta är **det** check som `href-route-cross-check` *inte* gör (verifierat: rad 126-136 hoppar över hash-länkar).

```ts
const anchorIssues = await page.evaluate(() => {
  const anchors = Array.from(document.querySelectorAll('a[href^="#"]'));
  const issues: string[] = [];
  for (const a of anchors) {
    const target = a.getAttribute('href')?.slice(1);
    if (!target || !document.getElementById(target)) {
      issues.push(`broken-anchor:${a.getAttribute('href')}`);
    }
  }
  return issues;
});
```

**B2. Bild-naturalWidth:** för varje `<img>`, verifiera `naturalWidth > 0` efter `load`-event. Fångar 404 från klient-perspektiv (server-HEAD kan ha givit 200 men edge-cache returnerar 404).

```ts
const brokenImages = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('img'))
    .filter(img => img.complete && img.naturalWidth === 0)
    .map(img => img.src);
});
```

**B3. CTA-knappar med tom handler:** för varje `<button>` och `<a>` som ser ut som CTA (klassnamn, position), verifiera att den har `href`, `onclick`, ingår i en `<form>` med `action`/`onSubmit`, eller har `disabled`/`aria-disabled`.

**B4. Mobil-meny:** sätt viewport till `375x667`, klicka hamburger-ikon (sök efter `[aria-label*="menu"]`, `<button>` med `<Menu>`-icon), verifiera att meny öppnas (DOM-ändring) och att länkarna i menyn pekar någonstans.

**B5. Form-validering:** för varje `<form>`, kontrollera:
- Har `action`-attribut **eller** `onSubmit`-handler?
- Om inte: är den markerad `aria-disabled` eller har varningstext "demo only"?
- Om varken eller: flagga som "fake form"

### C. Telemetri-events

Nya events i `src/lib/logging/devLog.ts`:

- `product_postcheck.broken_anchor`: `{ href, page }`
- `product_postcheck.broken_image`: `{ src, alt }`
- `product_postcheck.cta_no_handler`: `{ selector, text }`
- `product_postcheck.mobile_menu_failed`: `{ reason }`
- `product_postcheck.fake_form`: `{ formId }`
- `product_postcheck.summary`: `{ versionId, warnings, blocked }`

### D. UI-integration

I `src/components/builder/VersionDiagnosticsDialog.tsx` (lägg till sektion):

```
Product Postcheck:
- 0 broken anchors ✓
- 1 broken image ⚠ (https://images.unsplash.com/...)
- 0 CTA without handler ✓
- Mobile menu: not tested (viewport unsupported)
- 1 form marked as demo
```

### E. Bild-validering i två lager

Idag: `validate-images` HEAD från servern. Lägg till:

**E1.** `validate-images` förbättras med GET-fallback för 405/501 (se spår 03 — bild-minimum).

**E2.** Product Postcheck kör `naturalWidth`-check i klient-DOM som komplement. Båda lagren behövs eftersom server-HEAD och klient-fetch kan ge olika resultat.

## Vad detta INTE är

- **Inte F3 Build/Lint/Tsc** — det körs separat (typecheck redan i F2 quality-gate).
- **Inte semantisk bild-matchning** — "är den blonda kvinnan blond?" är AI-synsfråga som hör till nästa generations bildgen-pipeline.
- **Inte performance-test** — Lighthouse/Web Vitals kommer i ett senare spår.
- **Inte accessibility-audit** — axe-core kan läggas till senare när basen är stabil.

## Acceptanskriterier

- [ ] `runProductPostcheck` finns och körs efter `preview_ready` (bakom feature-flag).
- [ ] Playwright headless används för DOM-checks (inte bara inspector).
- [ ] Telemetri-events: `broken_anchor`, `broken_image`, `cta_no_handler`, `mobile_menu_failed`, `fake_form`.
- [ ] `VersionDiagnosticsDialog` visar Product-summary med konkreta fynd.
- [ ] Manuell verifiering: kör mot `eb152443` preview-URL — ska upptäcka `photo-1541544181051-...` 404 + duplikata "blond kvinna"-bilder.
- [ ] Performance-budget: postcheck får inte ta > 30 s. Hård timeout med graceful fallback (`postcheck_skipped`-event).

## Risker

- **Playwright cold start** på Fly-VM (10-30 s första gången per VM). Mitigation: pre-warm browser i preview-host samtidigt som `next dev` startas.
- **Falska positiver** för "fake form" — många demo-sidor har just demo-formulär. Tröskel + manuell undertryckning behövs.
- **Flaky tests** — mobile-menu-detection kan vara skör om LLM använder ovanliga selektorer. Försök med flera fallback-strategier (icon-name, aria-label, position).
- **Kostnad** — Playwright på varje generation kostar VM-cykler. Acceptabelt om det stoppar 3 av 10 buggiga sidor från att gå till user.

## Filer att läsa innan implementation

- `src/lib/gen/verify/href-route-cross-check.ts` (befintlig statisk check; jämför ytan)
- `src/app/api/engine/chats/[chatId]/validate-images/route.ts`
- `src/lib/utils/image-validator.ts` (befintlig HEAD-validator)
- `src/lib/gen/verify/visual-qa.ts` (statisk visual QA)
- `src/lib/hooks/chat/post-checks.ts` (rad 127-350 — postcheck-rörledning)
- `src/lib/providers/own-engine/generation-stream-post-finalize.ts` (rad 285-330 — preview-ready trigger)
- `src/app/api/inspector-element-map/route.ts` (referens för Playwright-pattern i repot)
- `src/app/api/inspector-capture/route.ts` (rad 553+ för Playwright-pattern)
- `package.json` (rad 183-204 för `@playwright/test` version)
- `src/components/builder/VersionDiagnosticsDialog.tsx` (rad 200+ för UI-integration)

## Källor

- Audit-agent V3 (claude-4.6-sonnet-medium-thinking) 2026-04-24, prompt fokus: F2 Product Postcheck-inventering
- Deep-prefab-agentens svar i `svar_gpt`: "Detta är mer värdefullt än fler abstrakta LLM-fixers" (P2-prioritet)
