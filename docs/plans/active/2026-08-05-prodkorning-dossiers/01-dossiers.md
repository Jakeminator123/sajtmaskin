---
status: active
owner: unassigned
topic: Dossier-kedjans fem defekter från prod-körningen 2026-08-05 + kontraktsinsikter. A1 (MapLibre) och A3 (package.json) är mekaniska; A4 (auto-repair) och A5 (advisory-policy) styr allt annat.
created: 2026-08-05
source: Live-körning chatId 3a6c5472 + /logg. Versioner: edc7ea62 (v1, promotad, trasig karta), d46e89a7 (v2, promotad, demo-chatt), e0d6cc0e (v3, F3, underkänd).
---

# Dossiers: defekter och insikter

Allt nedan är filverifierat mot master och/eller prod-DB under sessionen.

## Hur kedjan är TÄNKT att fungera (och vad som faktiskt hände)

Det avsedda flödet fungerade långt: prompten "AI-chatt med `OPENAI_API_KEY`"
fick capability `ai-chat` detekterad → dossiern `openai-chat`
(`defaultForCapability: true`) valdes in → F2 byggde en ärlig demo-attrapp
("Chatten använder lokala demosvar tills OPENAI_API_KEY kopplas in i
integrationssteget") → blocket fick status `planned`, `requiresF3: true` →
nyckeln registrerades (`hasRealValue: true`, `missingLiveKeys: []`) → "Bygg
integrationer" byggde `app/api/chat/route.ts` med `streamText` +
`process.env.OPENAI_API_KEY`, `chat-panel.tsx` och
`integration-config-notice.tsx` exakt enligt manifestet.

Det som fällde resultatet var fyra saker **runt** kedjan: A1–A4 nedan.

## A1 — MapLibre-dossiern levererar trasig kod till varje sajt (hög, mekanisk)

`data/dossiers/soft/maplibre-map/components/map-display.tsx:61`:

```ts
const maplibregl = (await import("maplibre-gl")).default;
```

Manifestet pinnar `"maplibre-gl": "^6"`. MapLibre tog bort default-exporten ur
ESM-bygget, så uttrycket blir `undefined` → `new maplibregl.Map()` kastar →
komponentens egen try/catch visar "Kartan kunde inte laddas just nu" utan
vidare signal. Dossiern kräver verbatim-kopiering ("SSR/cleanup wiring is
load-bearing"), så generatorn gjorde rätt — **felet är vårt**.

Typkontrollen fångade det exakt (`TS2339: Property 'default' does not exist`)
men släpptes som advisory (se A5). `lastVerified: 2026-07-22`.

**Åtgärd:** byt till namespace-import (`const maplibregl = await
import("maplibre-gl")`) eller namngivna exporter; bumpa `lastVerified`; kör
`npm run dossiers:validate-all`.

**Följdinsikt → systemåtgärd:** verbatim-filer ruttnar när upstream bumpar
major. Ingen kontroll typkontrollerar i dag dossier-filerna mot sina pinnade
beroenden — `lastVerified` är en handskriven etikett utan mekanik bakom. En
valideringsrad i `scripts/dossiers/` (tsc per dossier-komponent mot manifestets
deps) hade fångat A1 för veckor sedan.

## A2 — F3 är icke-deterministisk: förslag i stället för kod (hög)

Två pass med **identiska** förutsättningar (samma nyckel, samma byggblock,
samma basversion):

| Pass | Utfall |
|---|---|
| 1 (21:02) | Noll kodfiler. Två `integration suggestion`-kort med "Status: Kräver konfiguration" — **även för OpenAI vars nyckel var registrerad och riktig** |
| 2 (21:05, via "Godkänn förslag") | Komplett: 10 filer, 1309 rader, korrekt chat-route |

Env-grinden var friad: båda dossierna har `enforcement: feature-runtime`,
alltså utanför F3-blockerande scope (`missingKeys: []` för båda i
dossiers-API:et). Modellen valde ändå att "föreslå konfiguration". Grinden
"Integrationer signalerades, men modellen skrev inga kodfiler" fångade tomheten
— men användaren betalade ett helt pass för att få veta det.

**Åtgärdsspår:** (a) skarpare F3-instruktion: suggestion-actions är förbjudna
när `hasRealValue: true`; (b) in-pass-retry när suggestion+0 filer upptäcks,
i stället för manuell "Godkänn förslag"-runda.

**Bifynd:** "Godkänn förslag"-knappen skickar sin egen etikett som prompttext
(`Typ: followup_general`, `Längd: 15 tecken`). Lifecycle-kontexten följer med
ändå, så det fungerar — men prompt-loggen blir missvisande.

## A3 — F3 skriver om `package.json` från grunden (hög, kontraktsfel)

I den underkända v3 gick `package.json` från 47 → **9 rader**: build-scripts
och `next`/`react`/`react-dom`/`tailwindcss` försvann, och AI-paketen pinnades
inkompatibelt (`ai@^7` mot `@ai-sdk/react@^2` + `@ai-sdk/openai@^2`).
`dep-completer` hann pinna 5 saknade paket men kan inte återställa scripts.

Manifestet listar `dependencies: ["ai", "@ai-sdk/openai", "@ai-sdk/react"]`
**utan versioner** — majorvalen kom från modellen.

**Åtgärdsspår:** (a) F3-regel/mekanik: `package.json` får bara **utökas**,
aldrig ersättas (merge-kontrakt i finalize eller autofixer); (b) överväg
versionspinnar i dossier-manifestens `dependencies` så modellen inte väljer
majors själv.

**Status 2026-08-08:** relaterat arbete i **öppen PR #839** (SM-023) — markera
inte levererat före merge.

## A4 — Auto-repair undertrycks exakt när den behövs (hög, policyfel)

v3 föll på fyra blockerare. Två var triviala saknade importer (`FormEvent`,
`Resend`) — precis vad `import-validator` fixar mekaniskt i varje annat pass.
Loggen:

> `server-verify:diagnostic` — "Server verify gate failed but auto-repair
> suppressed (verifier blockers already exist; surface findings for inspection
> only)."

Grinden bromsar hårdast i det läge där en billig deterministisk fix hade räddat
versionen. Notera att `SAJTMASKIN_AUTO_REPAIR_BUILD_ERROR` **är** satt i
Production (34 dagar gammal), så koddefaulten "av i prod" är överstyrd —
undertryckandet här är en separat kodväg, inte env-flaggan.

**Åtgärdsspår:** låt mekaniska fixers (import-validator m.fl.) köra även när
verifier-blockerare finns; undertryck bara **LLM**-reparationen. Kräver att
någon skiljer fixer-klasserna åt i `server-verify.ts`-vägen.

**Status 2026-08-08:** **öppen PR #839** (SM-023, stale-check av verifier-dom)
+ SM-024-branch `fix/sm024-diagnostic-only-deterministic-repair` på väg upp —
inte levererat före merge.

## A5 — Typecheck-advisory släpper igenom trasiga dossier-funktioner (ägarbeslut)

Kvalitetsgrinden loggade kartfelet som `defect.kind: "compile"`, `exitCode: 2`,
`repairable: true` — och promotade med "F2 render-first: typecheck-varning
(advisory) — previewen renderar, versionen promotas". Preview-kompileringen
(SWC) typkontrollerar inte, så ett typfel når aldrig användaren som fel — bara
som en funktion som tyst inte fungerar.

Render-first är avsiktlig F2-policy, så detta är ett **beslut**, inte en bugg:
ska ett `compile`-fel i en fil som en dossier levererat verbatim undantas från
advisory-nedgraderingen? Dossier-filer är vårt eget kontrakt — ett typfel där
är per definition inte "modellens smak".

## Insikter om dossier-kontraktet (för morgondagens arbete)

- **`feature-runtime` ≠ `build`.** `feature-runtime`-nycklar blockerar aldrig
  F3 (`missingKeys` tom trots att `missingLiveKeys` listar dem); de styr bara
  demo-vs-live i runtime. Resend-hypotesen ("den blockerade allt") var fel —
  och `Kräver F3` härleds separat via `dossierRequiresF3()`, inte av
  `hard`-klassen ensam.
- **Status-livscykeln syntes fungera:** `planned` → (F3) → `built-demo` →
  (riktiga nycklar) → `built-live`. Efter sessionen: `openai-chat` =
  `built-demo` med `configured: true` — nästa steg mot live är promotion av en
  frisk F3-version, inte fler nycklar.
- **Dossiers-API:et läser den promotade versionen**, inte drafts. Byggblock-
  räknaren "hoppar" därför när versioner promotas/underkänns — förvirrande men
  korrekt (ägaren såg 3 → 4 → "5?" → 4).
- **Demo-attrappen är en styrka.** F2-mocken var ärlig om sitt läge och kom ur
  dossierns `mock: canned`-kontrakt. Behåll det mönstret; problemet ligger
  uteslutande i F3-exekveringen.
