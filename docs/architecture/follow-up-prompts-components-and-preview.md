# Uppföljningsprompter: nya komponenter, importer och preview

## Vad som händer vid varje ny prompt i buildern

1. **Ny generation** mot samma chatt/projekt kan **lägga till, byta namn på eller ersätta filer** (t.ex. nya komponenter under `components/`, nya routes under `app/`).
2. Systemprompten (`STATIC_CORE` + dynamisk kontext i [`src/lib/gen/system-prompt.ts`](../../src/lib/gen/system-prompt.ts)) instruerar modellen att:
   - följa användarens uppföljande önskemål (fler sektioner, tredje animation, extra sida, osv.);
   - **säkerställa att varje JSX-referens** antingen finns i utdata eller redan i scaffold befintliga filer (**import safety**).
3. Efter generering körs validering, autofix och sparning som en **ny version** (se [`docs/architecture/engine-status.md`](engine-status.md)).

Det finns **inget separat “låst” läge** som hindrar nya komponenter i uppföljande steg — så länge modellen håller importkedjan konsistent.

## Dynamiska importer (`next/dynamic`, nya filer)

- Modellen uppmanas använda **explicita importer** och vid behov `next/dynamic` med `ssr: false` för tung klientkod (se systempromptens avsnitt *Preview-safe libraries*).
- Own-engine-preview **tar bort** `import … from "next/dynamic"` och injicerar en liten **`dynamic`-shim** (React.lazy + Suspense) i preview-preluden — se [`src/lib/gen/preview/shims.ts`](../../src/lib/gen/preview/shims.ts). Det ersätter inte full Next.js code splitting på riktig deploy.
- Preview-lagret kan **stubba** saknade lokala importer så att vyn inte kraschar med hårda fel — se [`src/lib/gen/preview/script-builder.ts`](../../src/lib/gen/preview/script-builder.ts). Det är ett **hjälp-lager**, inte en ersättning för att faktiskt skapa filen i nästa prompt.

**Rekommendation till användaren:** om du ber om en tredje animation eller en ny komponent, nämn gärna **filnamn/placering** eller “lägg till i samma sida” så minskar risken för lösa referenser.

## Preview-URL vs “full” Next.js på en Node-server

Standard-preview (`/api/preview-render`) bygger en **självständig HTML-vy** för iframe från sparade filer — den startar **inte** en full `next dev` / full SSR-pipeline för varje klick. Det är medvetet för hastighet och kostnad.

- **Mer som “riktig” Next:** deploy till Vercel (eller sandbox-flöde där det finns) — se *Own-engine preview model* i [`engine-status.md`](engine-status.md).

**Obs:** preview kan vara **grön** samtidigt som felpanelen visar quality-gate- eller importfel — se exempel och tolkning i [`example-preview-preflight-failure-log.md`](example-preview-preflight-failure-log.md).

## Produkt-UI (t.ex. tredje animation på en dashboard)

Marketing-/dashboard-animationer på **själva Sajtmaskin** (t.ex. landningssidan) styrs av **appens egna React-komponenter** (t.ex. under `src/components/landing-v2/`), inte av den genererade sajt-motorn. En “tredje animation” där är en **frontend-feature** i den koden — samma repo, separat från användarens genererade webbplatser.
