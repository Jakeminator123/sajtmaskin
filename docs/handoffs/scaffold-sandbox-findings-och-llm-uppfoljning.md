# Scaffold / sandbox-isolering — findings, ändringar och brief för LLM-flöde (Tier 2+)

> **STATUS: AVKLARAT** — Denna handoff kördes 2026-03-27. Åtgärderna är implementerade.
> Aktuellt handoff-dokument: [`export-reliability-och-nasta-steg.md`](export-reliability-och-nasta-steg.md).

Detta dokument sammanfattar **vad vi lärt oss** och **vad som ändrats i kodbasen** kring embedding-valda scaffolds, sandbox-preview och baseline-beroenden — utan att lista enskilda testfall. Sista avsnittet är en **utförlig prompt** till en ny agent som ska fortsätta arbetet med **LLM-kedjan** och hur den ska **bygga vidare på scaffolds** mot en högre produktstandard.

**Kanoniska begrepp:** Tier 1 = shim (`/api/preview-render`), Tier 2 = riktig Next i Vercel Sandbox (`npm run dev`), Fidelity 2/3 — se [`docs/architecture/preview-deploy.md`](../architecture/preview-deploy.md). Ordlista: [`.cursor/rules/terminology.mdc`](../../.cursor/rules/terminology.mdc).

---

## 1. Findings (vad som framkom)

### 1.1 Runtime-scaffolds vs research

- De **10 interna** scaffolds som används vid generering ligger i `src/lib/gen/scaffolds/*/manifest.ts` och registreras i [`registry.ts`](../../src/lib/gen/scaffolds/registry.ts). De är **källkod i repot**, inte nedladdade som hela GitHub-repon vid varje körning.
- **Python-skriptet** [`scripts/hamta_sidor_branch_emil.py`](../../scripts/hamta_sidor_branch_emil.py) skrapar Vercel Template-katalogen och kan klona repon till en **extern mapp** (default `../vercel-scrape` eller `SAJTMASKIN_VERCEL_SCRAPE_DIR`). Det är **Level 1 research / intake**, inte samma sak som de runtime-scaffolds som äger `matchScaffoldWithEmbeddings`.
- [`scripts/sync-scaffold-refs.mjs`](../../scripts/sync-scaffold-refs.mjs) klonar **referens-repon** till `_template_refs/` — underlag för inspiration, **inte** automatiskt liktydigt med de färdiga manifesten.

### 1.2 Isolerat flöde (prompt → embedding → scaffold → sandbox)

- För att **testa** endast **semantisk scaffold-matchning** + **byggbar** sajt i sandbox **utan** orchestrate, keyword-first-matcher, LLM eller Postgres kan man använda `searchScaffolds` + `buildCompleteProject` + `createSandboxRuntimeFromFiles` (se `isolated_tests/scaffold-embed-sandbox.integration.test.ts`).
- **`startSandboxPreview`** drog in **DB** för projekt-env (`buildSandboxEnvLocalContents` → `project-env-vars`) vid statisk import; därför använder isolerade testet **inte** den vägen i sandbox-steget — annars krävs `POSTGRES_URL` bara för att **ladda** testfilen.
- **Vitest** har globalt `environment: "jsdom"`; OpenAI-klienten för query-embedding kräver **`// @vitest-environment node`** i den isolerade testfilen.

### 1.3 npm / baseline

- Flera **felpinnade** versioner i `project-scaffold.ts` `PACKAGE_JSON`-baseline fanns inte på npm (t.ex. `@radix-ui/react-select@2.1.15`, `@radix-ui/react-switch@1.1.8`, `@radix-ui/react-tooltip@1.1.14`, `@react-three/drei@10.1.5`). Det gav **`ETARGET`** i sandbox vid `npm install`.
- **Scaffolds shippar inte** egen `package.json` i `files`; **merge** sker via `mergePackageJsonWithBaseline` + `runDepCompleter` — så **en** giltig baseline är kritisk för `npm install`.

### 1.4 Sandbox-livstid och UX

- **Vercel Sandbox** (`Sandbox.create({ timeout })`) har en **maximal VM-livstid**. Dashboard visar t.ex. **Timeout** (tidigare kunde integrationstestet begära 12 min).
- **`SANDBOX_INTEGRATION_KEEP_OPEN=1`** gör att testet **inte** anropar `Sandbox.stop()` — sandlådan kan ligga kvar tills plattformen stoppar eller användaren stoppar manuellt. Standard utan det är att testet **stänger** efter lyckat HTTP-check.

### 1.5 Verifierad preview (exempel)

- En sandbox-URL visade **e-handels-scaffold** (`id: ecommerce`): svensk UI, placeholders som `[Butiksnamn]`, `[Kategori 1]` — **avsiktlig** mall så LLM kan ersätta. Tekniskt är det **Next.js + React + Tailwind** (dev-server), inte en statisk HTML-fil.

---

## 2. Ändringar i kodbasen (relevanta)

| Område | Ändring |
|--------|---------|
| `src/lib/gen/project-scaffold.ts` | Korrigerade npm-pinnar för Radix / `@react-three/drei` (faktiska versioner på registry). |
| `src/lib/mcp/runtime-url.ts` | `SANDBOX_MAX_LIFETIME_MS = 8 * 60_000`; all `timeout` till `Sandbox.create` **begränsas** till detta tak (kortare max än tidigare 12 min i vissa fall). |
| `isolated_tests/scaffold-embed-sandbox.integration.test.ts` | Isolerat flöde med `searchScaffolds`, `buildCompleteProject`, `createSandboxRuntimeFromFiles`; `@vitest-environment node`; `SCAFFOLD_EMBED_TEST_PROMPT` för egen prompt; logg av toppmatchningar; `SANDBOX_INTEGRATION_KEEP_OPEN`; dokumentation om `--env-file=.env.local`. |
| `scripts/validate-baseline-npm-versions.ts` + `package.json` | `npm run baseline-deps:verify` — validerar att alla `PACKAGE_JSON`-pinnar i `project-scaffold.ts` **resolver** mot npm. |

*(Äldre `sandbox-browse-once.ts` togs bort i samma spår som tidigare plan; hänvisning finns i `sandbox-dev-homepage-smoke.test.ts`.)*

---

## 3. Prompt till nästa agent — LLM-flöde, Tier 2 och utbyggnad av scaffolds

**Roll:** Du fortsätter arbetet i **Sajtmaskin**-repot med fokus på **egen motor (own-engine)**, **finalize-merge**, **sandbox-preview (Tier 2 / Fidelity 2)** och **hur LLM ska transformera** användarens prompt till en **högkvalitativ** sajt utifrån **vald scaffold** — inte bara ett tunnare “tema på placeholders”.

### 3.1 Bakgrund du ska utgå från

1. **Scaffold** = startmall: filer under `src/lib/gen/scaffolds/<id>/manifest.ts`, vald via `matchScaffoldWithEmbeddings` / `searchScaffolds` + registry. Ger struktur, typiska sidor och **promptHints**.
2. **Efter scaffold** serialiseras innehållet till systemkontext; **own-engine** genererar kod; **finalize-merge** (`src/lib/gen/stream/finalize-merge.ts`) sammanför modell + scaffold.
3. **Tier 2 preview** = `startSandboxPreview` → `createSandboxRuntimeFromFiles` + bl.a. env-merge via `buildSandboxEnvLocalContents` när projekt-id finns — se [`docs/architecture/preview-deploy.md`](../architecture/preview-deploy.md).
4. **Isolerat test** (`isolated_tests/scaffold-embed-sandbox.integration.test.ts`) **hoppar över** LLM och visar bara scaffold + baseline; **produktion** ska vara **rikare** än det.

### 3.2 Mål (produktnivå)

- När användaren t.ex. vill ha **e-handel med 3D-element** ska kedjan **förstå intent** och kunna ta in **lämpliga beroenden** (`three`, `@react-three/fiber`, `@react-three/drei` finns redan i baseline — **använd dem medvetet** när det passar).
- När användaren vill ha **animation i bakgrunden** ska **Framer Motion**, CSS, eller lämpliga libs användas så resultatet känns **levande**, inte generiskt — inom rimliga gränser för sandbox-tid och bundle.
- LLM ska **inte bara** byta `[Butiksnamn]` mot en sträng — den ska **tolka syftet** (målgrupp, ton, bransch) från användarens prompt och **lyfta** layout, copy och mikrointeraktioner där det är möjligt.
- **Kvalitetsribba:** definiera mätbara riktlinjer (t.ex. inga kvarvarande hakparentes-placeholders i hero efter “klar” generation om inte nödvändigt; konsekvent typografi; tydliga CTA).

### 3.3 Var du ska gräva i koden (icke uttömmande)

- `src/lib/gen/orchestrate.ts` — hur scaffold väljs och hur modell anropas.
- `src/lib/gen/stream/finalize-merge.ts` — merge av scaffold + modellfiler.
- `src/lib/gen/project-scaffold.ts` — baseline `package.json` och `mergePackageJsonWithBaseline`.
- `src/lib/gen/autofix/dep-completer.ts` — import→dependency.
- `src/lib/gen/sandbox-preview.ts` — Tier 2, `startSandboxPreview`.
- `src/lib/config` / env för **modell-tier**, max tokens, om relevant.
- `docs/ENV.md` + `docs/schemas/model-build-profiles.md` för modellval per tier.

### 3.4 Konkreta förslag på arbetsspår (prioritera själv)

1. **Systemprompt / scaffold-serialisering:** Se till att modellen får **tydlig** instruktion om att **ersätta placeholders**, **matcha** användarens bransch och **lägga till** avancerade features när prompten ber om det (3D, animation, etc.).
2. **Fler-stegs eller “polish”-steg:** Utvärdera om en efterföljande pass (copy + visuell polish) förbättrar resultatet utan att dubbla hela kostnaden.
3. **Token-budget:** Kartlägg var `maxTokens` / motsvarande sätts för own-engine; avgör om **planerings-** eller **implementations**-steget behöver mer utrymme för stora sidor.
4. **Richer scaffolds:** Parallellt: förbättra **en** manifest (t.ex. `ecommerce`) med bättre design tokens och färre tomma placeholders — det **höjer golvet** för alla LLM-anrop.
5. **Verifiering:** Efter ändringar: kör relevanta vitest, och manuellt verifiera **Tier 2** i sandbox enligt `preview-deploy.md`.

### 3.5 Begränsningar

- Ändra inte **planfiler** i användarens `.cursor/plans/` om inte uttryckligen ombedd.
- Håll **baseline** `package.json` **installerbar** (`npm run baseline-deps:verify` efter pin-ändringar).
- Respektera **SANDBOX_MAX_LIFETIME_MS** (8 min) — om längre builds behövs, diskutera separat policy.

---

## 4. Snabbreferens kommandon (underhåll)

```bash
# Validera baseline-pinnar mot npm
npm run baseline-deps:verify

# Isolerat: embedding + sandbox (kräver .env med OPENAI + Vercel + SANDBOX_INTEGRATION_TEST=1)
node --env-file=.env.local ./node_modules/vitest/vitest.mjs run isolated_tests/scaffold-embed-sandbox.integration.test.ts
```

---

*Skapad som handoff efter arbete med scaffold-embedding, sandbox-isolering, baseline npm-fixar och produktbrief för LLM/Tier 2.*
