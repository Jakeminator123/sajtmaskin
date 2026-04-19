# Session-noteringar — 2026-04-19

Sammanställning av observationer, buggar och hypoteser från dagens session.
Baserat på `npm run build`, `npm run dev`, två live-genereringar (chat
`49b84031...`, projekt `sWLi64E-LGNsxFK8F7Lqy`) och tre follow-ups.

Sortering: hög impact + hög sannolikhet att vara bugg först.

---

## ✅ Faktiskt åtgärdat denna session

| Sak | Var | Effekt |
|---|---|---|
| `HIDDEN_HIBERNATE_DELAY_MS` 60s → 600s + env-override | `src/components/builder/preview-panel/hooks/usePreviewHeartbeat.ts:11` | Tabbsbyte under 10 min dödar inte längre VM:en |
| `streamSafetyTimeoutMs` 720000 → 840000 ms | `config/ai_models/manifest.json:691` | Klient ger inte längre upp innan server hard-cap |
| Fly health-check timeout 10s → 20s | `preview-host/fly.toml:34` | npm install i sandbox triggar inte längre unhealthy |
| `DEFAULT_THINKING` `false` → `true` | `src/lib/builder/defaults.ts:171` | Reasoning på som default. **OBS:** kräver hard-refresh av öppna builder-flikar för att slå in (useState reads default bara på mount). |
| Dokumenterande kommentar om Turbopack-varningar | `src/lib/gen/dossiers/registry.ts:24-37` | Förhindrar att framtida agenter loopar på samma fix-försök |

---

## 🔴 Kritiska problem (åtgärda först)

### #1 — Sandbox installerar inte nya `package.json`-deps vid follow-up
**Sannolikhet bugg:** 95%
**Inverkan:** 90% (blockerar all funktionalitet som kräver nya npm-paket)

**Vad jag observerade:** Follow-up som lade till `three`, `@react-three/fiber`, `@react-three/drei` skapade en ny `package.json` i v2. Sandboxen `sbx_a301c6a5...` var redan booted med v1:s deps. När v2 levererades kördes **ingen `npm install`** i sandboxen. Konsekvens: `import { useFrame } from "@react-three/fiber"` kraschar, hela `<Canvas>` failar tyst i `<Suspense fallback={null}>`, användaren ser bara hero-sektionen utan 3D-pennan.

**Varför det är ett problem:** Det är osynligt — sandboxen rapporterar `status: running` även när moduler kraschar internt. Ingen återkoppling till användaren om att deps saknas.

**Min hypotes om hur det borde fungera (möjligen tidigare):** Antingen fanns det logik som detekterade `package.json`-diff och triggade `npm install` automatiskt, eller också fanns det aldrig. Värt att kolla git-historik på `preview-host/src/runtime.js` (sök efter `npm install`, `package.json`, `installDeps`).

**Föreslagen åtgärd — tre alternativ rangordnade:**

1. **Auto-detect + auto-install** *(ren fix)*
   I `preview-host/src/runtime.js` när en ny version laddas:
   - jämför `package.json` mellan tidigare och ny version
   - om `dependencies`/`devDependencies` skiljer → `npm install` i sandbox + soft-reload dev-server
   - logga som telemetry-event så vi ser när det händer

2. **Användarens flöde (vad du beskrev):** "lägg till deps → spara projektet tillfälligt → kör fix-runda → starta upp allt igen"
   Det är i praktiken en **rebuild-from-scratch-pipeline**. Funkar men är dyrare (full reboot, spillvärmen är 30–60s extra). Fungerar som fallback om #1 är komplext.

3. **LLM-fixer runda i slutet** *(din "buggfixrunda")*
   Lägger till en ny pass efter `finalize` som kollar om någon ny dep refereras i koden men inte finns i `package.json` eller node_modules — och i så fall lägg till + install. Mer robust mot att modellen glömmer skriva `package.json` (vi såg en sådan miss i v2 också — inget exportkommando på `floating-pencil-mesh.tsx` mesh-komponenten gjordes felaktigt med ofullständiga JSX-stängningar).

**Min rekommendation:** Börja med #1. Det är 50–100 rader kod i `preview-host/src/runtime.js`. Bevisas direkt nästa gång du lägger till en dep i en follow-up.

---

### #2 — `corporate-grid`-variant väljs trots att eval rekommenderar borttagning
**Sannolikhet bugg:** 85%
**Inverkan:** 70% (försämrar visuell kvalitet på första iteration)

**Vad jag observerade:** I första genereringen valdes `scaffoldVariant: 'corporate-grid'`. Din egen eval-rapport (`scripts/scaffolds/eval-landing-variants.ts`) säger:
```
[landing-variant-eval] corporate-grid wins= 0/20 expected_wins=0/4
[landing-variant-eval] candidates_for_removal=corporate-grid
```

**Varför det är ett problem:** Eval-pipeline finns men variant-pickern ignorerar den. Resultat: användare får dålig första generation som färgar uppfattningen "tråkig sajt". I follow-up (v2) byttes varianten till `nature-flow` — vilket bekräftar att picker *kan* välja andra varianter, men i v1 valde den den sämsta.

**Föreslagen åtgärd:**
- Om eval-rapporten finns på disk: läs in och *exkludera* `candidates_for_removal` från picker-poolen.
- Eller hård-koda en blocklist tills evaluation-data integreras.
- Långsiktigt: variantens `weight` i `pickScaffoldVariant` borde komma från eval-rapporten istället för manuella konstanter.

**Filplats för fix:** `src/lib/gen/scaffold-variants/picker.ts` (förmodat) — gör en grep på `pickScaffoldVariant`.

---

### #3 — Brief och scaffold-picker oense, loggas som "agreement"
**Sannolikhet bugg:** 100% (det är en rapporterings-bug)
**Inverkan:** 60% (försämrar felsökningsbarhet, döljer riktiga problem)

**Vad jag observerade:**
```
[orchestrate] scaffold_drift {
  briefNominated: 'content-site',
  briefConfidence: 0.8,
  finalPick: 'landing-page',
  pickMethod: 'agreement',     <-- LJUGER
  pickConfidence: 'high'
}
```
Brief-LLM:n nominerade `content-site` (bra match för "tre sidor + spel"), pickern överrullade till `landing-page`, men loggar `agreement`. Det är inte en agreement.

**Varför det är ett problem:** När man felsöker scaffold-val ser man `agreement` och tror att brief och picker var överens. Det maskerar en faktisk konflikt och försvårar att hitta att det är pickern som väljer fel.

**Föreslagen åtgärd:**
```ts
const pickMethod =
  briefNominated === finalPick ? 'agreement' :
  briefConfidence < 0.6        ? 'picker_default' :
                                  'picker_override';
```
Filplats: leta i `src/lib/gen/orchestrate.ts` eller `src/lib/gen/scaffolds/`.

---

### #4 — Geist-font 404 i preview-sandbox
**Sannolikhet bugg:** 90%
**Inverkan:** 50% (kosmetiskt men förklarar "tråkigt typsnitt"-känslan)

**Vad jag observerade:** Konsolerror i preview-iframen:
```
geist-latin.woff2 → 404 Not Found
```
Samtidigt CSS som refererar `font-(--font-heading)`. Browsern faller tillbaka på system-default sans-serif. Förklarar exakt din observation: "typsnittet kan göras bättre".

**Varför det är ett problem:** Det är inte ett designval — det är en saknad fil. Användaren tror att modellen valt ett tråkigt typsnitt, men det är en infra-bug.

**Föreslagen åtgärd:** Preview-host materialiserar inte `_next/static/media/*.woff2`. Två sub-orsaker möjliga:
- Next i sandbox kör i dev-mode och förväntar sig att fonten serveras från `node_modules/geist/...` men den importeras som modul utan att kopieras.
- Eller fonten genereras från `next/font` som inte fungerar samma i sandbox-runtime.

Behöver djupdykning i `preview-host/src/runtime.js` runt static-asset-serving.

---

### #5 — Tyst stream-abort utan UI-feedback
**Sannolikhet bugg:** 75%
**Inverkan:** 70% (användaren vet inte att generation dog)

**Vad jag observerade:** Tredje follow-up ("Gör denna knallbrun") gav:
```
phase: 'error'
eventCounts: { start: 1, 'start-step': 1, abort: 1 }
unavailableReason: 'stream_aborted_or_provider_error_before_usage_report'
```
Total tid 1,4s LLM. Ingen toast, ingen versions-bumpning, inget felmeddelande. Du trodde rimligen att inget hade hänt — men en hel server-roundtrip + provider-call hade misslyckats.

**Föreslagen åtgärd:**
- I `useCreateChat`/`useSendMessage`: när stream slutar med `phase: 'error'` ska klienten visa en discreet toast: "Genereringen avbröts. Försök igen."
- Logga `phase: 'error'` med fler detaljer än bara `unavailableReason` så vi kan diagnosticera om det är provider-throttling, network blip, eller något annat.

---

## 🟡 Medelviktiga problem

### #6 — `qualityTarget: 'standard'` är scaffold-default, inte adaptivt
**Sannolikhet bugg:** 30% (det är ett designval)
**Inverkan:** 50% (försämrar utfall för multi-page)

**Vad jag observerade:** Multi-page sajt (3 sidor + spel) fick samma `qualityTarget: 'standard'` som en single-page landing. Modellen producerade 7338 output-tokens — Codex Pro kan göra 30k+. Det är scaffolden som signalerar "nöj dig med spartanskt".

**Föreslagen åtgärd (måttligt invasiv):** Om `routeCount > 1`, höj `qualityTarget` till `'high'` automatiskt. Single-page landing får behålla `standard`.

---

### #7 — Modell-default Lagom (Pro) + thinking off ger "lagom" men inte bra
**Sannolikhet bugg:** 20% (designval, men undermåligt)
**Inverkan:** 60% (första intryck för nya användare blir dåligt)

**Vad jag observerade:** Default-tier är "Lagom" (Pro). Default-thinking är (var) `false`. Det är en kombination som ger "snabb men spartansk" output. Användare som inte fixar inställningarna får en första generation som inte showcasar vad systemet faktiskt kan göra.

**Föreslagen åtgärd:** ✓ `DEFAULT_THINKING = true` är gjort. Värt att också överväga om "Lagom" bör vara default eller om "Pro" / något högre vore bättre. Säkrare alternativ: visa "Modell: Lagom — för bästa kvalitet, byt till Pro/Max" som hint i builder-headern.

---

### #8 — Streamdown hydration error i builder-chat
**Sannolikhet bugg:** 100%
**Inverkan:** 20% (bara dev-overlay, syns inte i prod)

**Vad jag observerade:**
```
<p> cannot contain a nested <div>
<p> cannot contain a nested <p>
Komponent: Streamdown / MarkdownParagraph i link-säkerhets-popup
```
Genererat när chatten visar en länk med preview-popup.

**Föreslagen åtgärd:** Renderar du popupen i `<p>`? Antingen byt till `<span>` eller portala popupen utanför paragrafens ancestor.

**Filplats:** Sök efter `MarkdownParagraph`, `Streamdown` i `src/components/`.

---

### #9 — Quality-gate tar 56–74 sekunder
**Sannolikhet bugg:** 40% (kanske rimligt, kanske inte)
**Inverkan:** 60% (UX — "Verifying..." tar lång tid)

**Vad jag observerade:** `POST /api/.../quality-gate 200 in 56s` (follow-up) och `74s` (första gen). Det är en stor del av total upplevd tid.

**Föreslagen åtgärd:** Profilera vad de 56–74 sekunderna gör. Om det är LLM-anrop för rubrik-/SEO-check kan vi köra dem i parallell istället för sekventiellt. Om det är network roundtrips kan vi batcha.

---

### #10 — `/api/projects/:id/chat` returnerar 404 istället för 200 + null
**Sannolikhet bugg:** 80%
**Inverkan:** 30% (cosmetic, men distraherar i konsolen)

**Vad jag observerade:** Builder-laddning ger:
```
GET /api/projects/.../chat 404
useBuilderPageController.ts:702 → Error in console
```
Borde returnera `200 { chatId: null }` eftersom "ingen chat finns ännu" är ett normalt tillstånd, inte ett fel.

**Föreslagen åtgärd:** I `src/app/api/projects/[id]/chat/route.ts:97-103`, ändra:
```ts
if (!project) return NextResponse.json({ chatId: null }, { status: 200 });
```

---

## 🟢 Lågprioriterade / kosmetiska

### #11 — Turbopack "Overly broad pattern"-varningar (3 st i `registry.ts`)
**Sannolikhet bugg:** 0% (fungerande beteende, kosmetiskt)
**Inverkan:** 5% (lite längre build, ingen runtime-effekt)

Tre approacher provades (`turbopackIgnore`-comment, `outputFileTracingExcludes`, `JSON.parse`-indirection) — ingen fungerade utan biverkningar. Dokumenterande kommentar inlagd. Vänta på Turbopack-uppgradering.

### #12 — CSS-preload-warning i Chrome
**Sannolikhet bugg:** 0%
**Inverkan:** 5%

Next 16/Turbopack-quirk i dev-läge. Försvinner i prod.

### #13 — WebSocket HMR-fail mot fly.dev
**Sannolikhet bugg:** 30% (Fly-proxy-konfiguration)
**Inverkan:** 10%

Fly:s HTTP-proxy stödjer inte WS-upgrade för `_next/webpack-hmr`. Förvirrande spam i konsolen men sajten fungerar utan HMR i preview.

---

## 📊 Sammanställning, prioritet

| # | Problem | Bugg-% | Impact-% | Prioritet |
|---|---|---|---|---|
| 1 | Sandbox installerar inte nya deps | 95 | 90 | **🔴 kritisk** |
| 4 | Geist-font 404 | 90 | 50 | 🔴 hög |
| 2 | corporate-grid trots eval-borttagning | 85 | 70 | 🔴 hög |
| 5 | Tyst stream-abort | 75 | 70 | 🔴 hög |
| 7 | Default-konfig ger spartansk output | 20 | 60 | 🟡 medel (delvis fixat) |
| 9 | Quality-gate 56-74s | 40 | 60 | 🟡 medel |
| 6 | qualityTarget inte adaptivt | 30 | 50 | 🟡 medel |
| 3 | "agreement" ljuger när picker överrullar | 100 | 60 | 🟡 medel |
| 8 | Streamdown hydration error | 100 | 20 | 🟢 låg |
| 10 | /chat 404 istället för 200+null | 80 | 30 | 🟢 låg |
| 13 | WS HMR fail i preview | 30 | 10 | 🟢 cosmetic |
| 11 | Turbopack-varningar | 0 | 5 | 🟢 cosmetic |
| 12 | CSS-preload-warning | 0 | 5 | 🟢 cosmetic |

---

## 🧠 Övergripande analys

Tre teman kommer fram:

1. **Sandbox-pipeline har antaganden som inte håller.**
   #1 (deps) och #4 (font) är båda preview-host-issues. Sandboxen behandlas som
   "skicka kod, kör npm run dev" — men i praktiken behöver den hantera
   dep-changes, asset-pipeline och static-files mer aktivt. Det är värt en
   separat genomgång av `preview-host/src/runtime.js` med fokus på
   "vad händer mellan v1 och v2 av samma chat".

2. **Eval/quality-signaler genereras men används inte.**
   #2 (corporate-grid) är klassisk: vi har `scripts/scaffolds/eval-landing-variants.ts`
   som genererar data, men variant-pickern (#2) och scaffold-pickern (#3)
   konsulterar inte resultatet. Hela orchestrate-kedjan är "klassisk regelmotor"
   medan eval-data ligger orörd. Att stänga den loopen ger sannolikt största
   kvalitetshoppet per timme arbete.

3. **Felsignaler maskeras eller försvinner.**
   #3 ("agreement"), #5 (tyst abort), #4 (silent font fail), #6 (qualityTarget
   låst). Alla är "användaren ser inget men något är fel". Pattern: lägg till
   discreet UI-feedback + bättre telemetry-strängar **innan** vi jagar fler
   buggar, så vi har bättre signaler nästa gång.

---

## 💡 Notes från användaren att komma ihåg

- "Thinking" ska vara på som default. ✓ Gjort men kräver hard-refresh.
- "Tråkigt typsnitt" → kopplat till #4 (Geist-font 404), inte modellens val.
- "Spartanska sidor på första försök" är delvis önskvärt om vi inte gett
  instruktioner — men användaren förbehåller sig att standarden ska vara
  redigerbar. Det här är konceptet "standardiserad form som man kan editera"
  och stödjer #6 (adaptivt qualityTarget).
- Fidelity-2 (preview-host) = ingen riktig backend, bara client-side. Det är
  rätt och förväntat.
- Frågan om "logiken kanske fanns i tidigare versioner": värt att kolla
  git-blame på `preview-host/src/runtime.js` runt `package.json` /
  `npm install` / `installDeps` för att se om den någonsin fanns och togs bort.

---

## ✋ Inget gjort ännu (men föreslaget)

Plan A från `fler_möjliga_buggar.txt` (DB-migration för thinking-persistens)
**inte påbörjad**. Eftersom thinking inte kunde testas live (var off i den här
sessionen) är det fortfarande pappers-bugg. Värt att verifiera nästa session
efter att thinking-default nu är på.

---

*Slut på sammanfattning. Filen kan användas som agenda för nästa session.*
