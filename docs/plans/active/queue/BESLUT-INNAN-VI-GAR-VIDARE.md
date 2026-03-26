# Beslut innan vi går vidare

**Syfte:** Produkt- och arkitekturfrågor som bör vara **besvarade** (eller medvetet **nedprioriterade med motivering**) innan nästa större kodfas eller orchestrator-körning planeras som «klar».

**Relaterat:** [`COMPLETION-ROADMAP.md`](./COMPLETION-ROADMAP.md) (Fas A) · [`../MASTER-ALLT-KVAR.md`](../MASTER-ALLT-KVAR.md) · [`FRAGOR-SVAR-FAQ.md`](./FRAGOR-SVAR-FAQ.md)

**Senast beslut inkörda:** 2026-03-26 (ägarens marginalanteckningar: oförändrat / bästa rimliga / självständig prioritering / rimliga antaganden / status quo för Plan 17).

---

## 1. K-007 — Deploy före publicering (auto-fix / validering)

- Ska **auto-fix** eller **strammare validering** före deploy vara **strammare**, **oförändrat**, eller **tydligare opt-in/opt-out** för användaren?
- Vad räknas som **acceptans** när en deploy **blockeras** (meddelande, återförsök, manuell override)?

**Beslut / motivering (fyll i): oförändrat**

- **Policy:** **Oförändrat** mot nuvarande `master` — befintlig deploy-pipeline, `deployReadiness` / `version-file-integrity`, preflight och dokumenterade undantag i [`deploy-precheck.md`](../../../architecture/deploy-precheck.md) gäller tills vidare.
- **Ingen** generell skärpning av auto-fix eller obligatorisk «hårdare» validering i detta steg; framtida **opt-in/opt-out** i UI kan tas som **egen** produktstory med separat acceptans.
- **När deploy blockeras:** Acceptans = användaren får **tydlig orsak** (befintliga meddelanden / `invalidFiles` m.m.), kan **justera kod** eller **försöka igen** efter fix; **manuell override** endast om/ när produkt uttryckligen bygger det — inte krav i detta beslut.

---

## 2. K-009 — Own-engine SSE utanför avslutad W3-track

- Vilken **produkt-scope** gäller för **SSE / own-engine** *utanför* det som redan levererats i W3-spåret?
- Vad är **«klart»** för K-009 i tabellen (FAQ på Sajtmaskin-sajten är **sekundärt** per tidigare beslut)?

**Beslut / motivering (fyll i): Gör det som är bäst**

- **Scope för K-009-raden:** Fokus är **byggarens egen motor** — strömning och uppföljning som påverkar **användarens genereringsloop** (t.ex. chat/stream, finalize, närliggande egna motor-endpoints som samma produkt upplever som «ett spår»). **Marknads-FAQ / landning** förblir **utanför** (redan sekundärt).
- **Utanför K-009:** Ren **intern** telemetry, framtida **nya** SSE-ytor (admin, experiment) som **inte** är del av samma slutanvändarflow — hanteras som **vanliga features** eller teknisk skuld, inte som blocker för att tolka K-009.
- **«Klart» i kritik-tabellen:** Raden förblir **`[ ]`** tills vi antingen levererar uttryckligen kvarvarande **egen-motor**-SSE-arbete **eller** sätter **[N/A]** med datum efter en **medveten** genomgång («inget kvarstående gap»). Detta beslut **spikar bara tolkning**, stänger inte raden automatiskt.

---

## 3. K-018 — Preview och `iframe`-paritet

- Hur **mäter** vi **preview/`iframe`-paritet** mot `**npm run dev`** i genererad sajt (manuell checklist, automatiserad snapshot, intern demo)?
- **Prioritering** mellan: **VM/session-återanvändning**, **Fas 3 adapters** i genererad kod, **produkt** (shim ↔ sandbox-ordning, felmeddelanden) — vad levereras **först**?

**Beslut / motivering (fyll i): Lös detta själv på ett rimligt sätt**

- **Mätning:** Primärt **[`preview-fidelity-tiers.md`](../../../architecture/preview-fidelity-tiers.md)** + **manuell** sanity (byggare → preview → representativa mallar). **Vitest** där vi redan har stabila enhets-/integrationsgränser; **ingen** hård snapshot av hel iframe mot `npm run dev` som gate i detta skede.
- **Prioriteringsordning (leverans):**
  1. **Produkt / UX** — tydlig **shim ↔ sandbox ↔ build**-signal, befintliga toasts/loggar; minimera «två sanningar» för användaren.
  2. **Session / VM-återanvändning** — i den mån **plattform + SDK** medger det; bygg vidare på `sandbox-session-store` / befintliga hooks.
  3. **Fas 3 adapters** — **inkrementellt** per integration som **bevisligen** bryter preview utan adapter (undvik att spika alla adapters innan UX och session känns stabila).

---

## 4. K-019 — Orchestration snapshot / promptkedja

- Var ska **kanonisk förberedd kontext** (snapshot) **leva** (minne, DB, blob per chat, annat)?
- När ska en snapshot **ersätta** respektive **mergas** med inkommande follow-up?
- Vilka **sekretess-/storleksgränser** gäller (trimning, redaktion av secrets)?

**Beslut / motivering (fyll i): Gör rimliga antaganden**

- **Lagring:** **DB** som primär sanning — befintlig **`engine_chats.orchestration_snapshot`** (JSON) efter lyckad `finalizeAndSaveVersion`; ingen **blob**- eller separat fillagring för samma syfte i detta skede.
- **Merge vs ersätt:** **Follow-up** använder **prepend** av kontinuitet + **sammanslagning** enligt [`PLAN-K019-PROMPT-SNAPSHOT.md`](./PLAN-K019-PROMPT-SNAPSHOT.md) och kod i `orchestration-snapshot.ts` — **full ersättning** endast när en ny **komplett** orchestration beräknas för samma chat och produkt bedömer att gammal snapshot är irrelevant (följ befintlig kodväg).
- **Storlek & sekretess:** Ingen obegränsad rådump — **trimma** till fält som orchestration faktiskt behöver; **inga** råa hemligheter i snapshot (endast struktur/metadata som redan är säker att logga i chat-kontext). Vid behov: **framtida** hård teckengräns i samma lager som sparar JSON.

Implementationsspår: [`PLAN-K019-PROMPT-SNAPSHOT.md`](./PLAN-K019-PROMPT-SNAPSHOT.md).

---

## 5. Plan 17 — WS-4 (ENV/policy) och WS-5 (städ)

- **WS-6:** **Klart 2026-03-26** — arkiverad snapshot: [`avklarat/2026-03-plan17-ws6-product-decisions.md`](../../avklarat/2026-03-plan17-ws6-product-decisions.md); kanon i `17-repo-separation-and-independence.md` § WS-6.
- **WS-4:** När ska `ENV.md` / `config/env-policy.json` (eller motsvarande) **bindas hårdare** till kod — nu, eller efter K-018/K-019?
- **WS-5:** Ordning för `.gitignore`-scan och `research/`-policy; **`docs/old` städad genom flytt** till `avklarat/2026-03-docs-old-archive/` (2026-03-26).

**Beslut / motivering (fyll i): det ska vara som det är**

- **WS-4:** **Efter** att **K-018** (preview stabil) och **K-019** (snapshot-merge m.m.) landat bättre — **inte** hård bindning / schemarensning **nu**. **Första steg** förblir **dokumentera sanning** (G1b): `ENV.md` + `env-policy` i linje med verklig användning när någon tar städpasset.
- **WS-5 (rester):**
  - **`.gitignore` / stora JSON:** **Vid behov** när nya **> relevant storlek** filer tillkommer (scan är redan gjord 2026-03-19 för `src/**/*.json` >1 MB — ingen åtgärd tills något ändras).
  - **`research/`:** Behåll nuvarande policy (**H1c**) — [`research/README.md`](../../../../research/README.md); **inte** hårdkrav för `npm run dev`.
  - **`docs/old`:** Redan **flyttad** — ingen ytterligare åtgärd i detta beslut.

---

## Checklista


| ID             | Beslut taget? | Datum      | Uppdatera                                                                                                                                              |
| -------------- | ------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| K-007          | [x]           | 2026-03-26 | `kritik-consolidated-open-items.md`, `COMPLETION-ROADMAP`                                                                                              |
| K-009          | [x]           | 2026-03-26 | samma                                                                                                                                                  |
| K-018          | [x]           | 2026-03-26 | samma + `PLAN-PREVIEW-SANDBOX` vid behov                                                                                                               |
| K-019          | [x]           | 2026-03-26 | samma + `PLAN-K019-PROMPT-SNAPSHOT`                                                                                                                    |
| Plan 17 WS-6   | [x]           | 2026-03-26 | `17-repo-separation-and-independence.md`, [`avklarat/2026-03-plan17-ws6-product-decisions.md`](../../avklarat/2026-03-plan17-ws6-product-decisions.md) |
| Plan 17 WS-4/5 | [x]           | 2026-03-26 | `17-repo-separation-and-independence.md`, denna fil §5                                                                                                  |


När en rad är **nedprioriterad** i stället för besvarad: skriv **motivering** i denna fil och bocka «taget» med datum = *deferred*.
