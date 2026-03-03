# Slutrapport: Validering av extern kritik

## Om denna rapport

Två externa granskningsdokument har analyserats mot den faktiska kodbasen:

- **Rapport 1** (`1.txt`) — 10 prioriterade åtgärder, skriven av någon med insyn i koden.
- **Rapport 2** (`2.md`) — 25 åtgärder, skriven utan tillgång till repot (baserad på publika produkttexter och generella säkerhetsrekommendationer).

Varje punkt har verifierats mot faktisk implementation. Rapporten avslutas med en rekommendation om vilka åtgärder som bör prioriteras samt en uppskattning av insats.

---

## Del 1: Validering av Rapport 1 (1.txt)

Rapport 1 är träffsäker. Alla 10 punkter är bekräftade mot kodbasen.

### 1. localStorage-token i backoffice

**Befogad: JA**

`src/lib/backoffice/template-generator.ts` lagrar autentiseringstoken via `localStorage.setItem("backoffice-token", data.token)`. Alla XSS-vektorer kan exfiltrera token direkt.

**Viktig nyans:** Backoffice-koden genereras som en ZIP som laddas ned av slutanvändare — den körs inte i sajtmaskin-appen själv. Det minskar inte risken (den genererade koden når produktion hos kunder), men avgränsar var fixen behöver ske.

### 2. Rate limiting på backoffice-auth

**Befogad: JA**

Ingen rate limiting finns på den genererade `/api/backoffice/auth`-routen. Huvud-appens `/api/auth/login` har `withRateLimit`, men den genererade backoffice-koden saknar det helt.

### 3. HMAC vs plain SHA-256 för token-signering

**Befogad: JA**

Backoffice-koden använder `createHash("sha256").update(token + expiry + password)`. Huvud-appen använder korrekt HMAC (`createHmac("sha256", secret)`) i `src/lib/auth/auth.ts`. Inkonsekvensen är bekräftad.

### 4. Filsystemskrivning i serverless

**Befogad: JA, med nyans**

De genererade backoffice-routes (`content/route.ts`, `colors/route.ts`) skriver till `process.cwd()/data/*.json` via `fs.writeFileSync`. Detta fungerar inte på Vercel/serverless. Dessutom skriver sajtmaskins egna loggmoduler (`devLog.ts`, `file-logger.ts`) till `process.cwd()/logs/` — men bara i dev-läge.

### 5. Promptloggning utan redaktion

**Befogad: JA**

`logFinalPrompt()` i `src/lib/utils/debug.ts` loggar hela prompten till konsolen. `logV0()` skriver de första 200 tecknen till fil. `sanitizeDetails()` i `file-logger.ts` hanterar tokens/nycklar men inte promptinnehåll, som kan innehålla PII.

### 6. SSRF-risk vid URL-hantering

**Befogad: JA, delvis**

- Attachments valideras med `z.array(z.any()).max(24)` — ingen URL-validering.
- `/api/media/upload-from-url` gör `fetch(url)` utan SSRF-skydd, trots att `src/lib/ssrf-guard.ts` existerar och används i andra routes.
- `next.config.ts` remotePatterns har explicita hostnamn (inte wildcards) — den delen är OK.

### 7. Feature toggles (streaming)

**Befogad: JA**

`isV0StreamingEnabled()` returnerar hårdkodat `true`. Ingen env-/flagg-styrning.

### 8. Node 25.4.0 (icke-LTS)

**Befogad: JA**

Volta pinnar Node 25.4.0 i `package.json`. Inget `engines`-fält definierat. Node 25 är inte LTS.

### 9. rejectUnauthorized: false i DB-init

**Befogad: JA**

`scripts/db-init.mjs` rad 31: `ssl: { rejectUnauthorized: false }` utan miljövillkor.

### 10. Heuristisk "already expanded"-detektion

**Befogad: JA**

`v0-generator.ts` rad 434–443 använder `prompt.includes("hero section")` etc. för att avgöra om prompten redan är expanderad. Skör och icke-deterministisk.

---

## Del 2: Validering av Rapport 2 (2.md)

Rapport 2 har 25 punkter. Eftersom författaren inte hade kodåtkomst är många formulerade som generella rekommendationer. Nedan valideras de mot faktisk implementation — överlappande punkter med Rapport 1 sammanfattas kort.

| # | Påstående | Befogad? | Kommentar |
|---|-----------|----------|-----------|
| 1 | localStorage för auth | **JA** | Bekräftat (se Rapport 1, punkt 1). Gäller backoffice, inte huvud-appen. |
| 2 | Svaga cookie-attribut | **NEJ** (huvudapp) | Huvud-appen sätter HttpOnly, Secure, SameSite=Lax korrekt i `auth.ts` och `session.ts`. Backoffice använder inte cookies alls. |
| 3 | CSRF-skydd saknas | **DELVIS** | Ingen generell CSRF-mekanism. Dock: backoffice använder token-i-header (ej cookies), så CSRF-vektorn är begränsad där. Huvud-appens sessions-cookie är `SameSite=Lax`, vilket reducerar men inte eliminerar risken. |
| 4 | Otillräcklig inputvalidering | **DELVIS** | Huvud-appen använder Zod-scheman i flertalet API-routes. Den genererade backoffice-koden saknar validering helt. |
| 5 | SSRF-risk | **JA** | Bekräftat (se Rapport 1, punkt 6). `ssrf-guard.ts` finns men används inte överallt. |
| 6 | Rate limiting saknas | **DELVIS** | Huvud-appen har rate limiting på `/api/auth/login`. Saknas på backoffice och generering. |
| 7 | Secrets i repo/loggar | **DELVIS** | Inga hemligheter hittades i repot. Loggredaktion finns men täcker inte promptinnehåll. |
| 8 | Sensitive env vars | **EJ VERIFIERBAR** | Hanteras via Vercels env-var-system. Inget direkt problem upptäckt i koden. |
| 9 | Miljöstyrning (dev/preview/prod) | **DELVIS** | `src/lib/config.ts` har separat logik per miljö. Vissa saker (DB SSL, Node-version) saknar miljödifferentiering. |
| 10 | DB TLS (rejectUnauthorized) | **JA** | Bekräftat (se Rapport 1, punkt 9). |
| 11 | Ad-hoc DB-init vs migrations | **JA** | `db-init.mjs` är ett manuellt skript. Drizzle ORM finns men ingen formell migrationspipeline syns i CI. |
| 12 | Backup/restore | **EJ VERIFIERBAR** | Ingen dokumentation hittas. Hanteras troligen på Neon/Supabase-nivå men bör dokumenteras. |
| 13 | Observability (OTel) | **DELVIS** | `instrumentation.ts` existerar (Next.js-hook). Strukturerade loggar finns i `file-logger.ts`. Saknar OTel-integration och dashboards. |
| 14 | Logg-redaktion | **DELVIS** | `sanitizeDetails()` finns men täcker inte promptinnehåll (se Rapport 1, punkt 5). |
| 15 | Audit log för backoffice | **JA** | Ingen audit-logging hittades. |
| 16 | Feature flags / kill switch | **JA** | Bekräftat (se Rapport 1, punkt 7). `FEATURES` i config.ts finns men täcker inte allt. |
| 17 | Node LTS | **JA** | Bekräftat (se Rapport 1, punkt 8). |
| 18 | engines i package.json | **JA** | Saknas. |
| 19 | Dependency management | **DELVIS** | `package-lock.json` finns. Ingen Renovate/Dependabot eller `npm audit` i CI. |
| 20 | CI/CD quality gates | **DELVIS** | CI kör typecheck + lint + build. Testerna körs inte i CI trots att `test:ci` finns som script. |
| 21 | Serverless filsystem | **JA** | Bekräftat (se Rapport 1, punkt 4). |
| 22 | SSR/SSG/ISR-strategi | **DELVIS** | Några routes har explicit `revalidate`. Ingen övergripande policy. |
| 23 | CSP/security headers | **DELVIS** | `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` sätts i `proxy.ts`. CSP och HSTS saknas. |
| 24 | XSS via AI-genererat innehåll | **DELVIS** | AI-genererad kod renderas i iframe (v0 demoUrl) — isolerat. Men om genererad HTML visas direkt i appen finns risken. |
| 25 | Licens/SBOM | **JA** | Ingen `LICENSE`-fil eller SBOM-generering. |

---

## Del 3: Sammanfattande bedömning

### Rapport 1 — Hög träffsäkerhet

Alla 10 punkter är korrekta och baserade på faktisk kod. Författaren har tydligt läst implementationen. Kritiken är saklig och konkret.

### Rapport 2 — Blandat

Rapport 2 har rätt i den övergripande riskbilden men gör flera antaganden som inte stämmer med den faktiska koden:

- **Felaktig:** Påståendet om svaga cookie-attribut (punkt 2) — huvud-appen har korrekt cookie-hantering.
- **Överdrivet:** Det generella betyget 4/10 väger in osäkerhet som beror på att författaren inte hade kodåtkomst, inte på faktiska brister.
- **Redundant:** Många punkter (8, 9, 12) är operationella rekommendationer snarare än kodkritik.
- **Korrekt:** Punkterna om CSRF, CSP, audit log, feature flags, tests och licensfil stämmer.

---

## Del 4: Rekommendation — vad bör åtgärdas?

Punkterna delas in i tre kategorier: **måste åtgärdas**, **bör åtgärdas**, och **kan vänta**.

### Måste åtgärdas (innan produktion med betalande kunder)

| Punkt | Beskrivning | Insats | Motivering |
|-------|-------------|--------|------------|
| R1-1 | Byt backoffice-auth från localStorage till HttpOnly-cookie | **Medel** (1–2 dagar) | Direkt XSS-sårbarhet i genererad kundkod. |
| R1-3 | HMAC för token-signering i backoffice | **Liten** (timmar) | Enkel fix — byt `createHash` till `createHmac`. |
| R1-9 | rejectUnauthorized: false → miljöstyrd | **Liten** (timmar) | En rad att ändra med env-villkor. |
| R1-6 | SSRF-skydd i upload-from-url + attachments | **Medel** (1 dag) | `ssrf-guard.ts` finns redan — behöver bara appliceras konsekvent. |
| R1-2 | Rate limiting på backoffice-auth | **Liten** (timmar) | `rateLimit.ts` finns redan — lägg till i genererad kod. |
| R2-23 | CSP-header (åtminstone basic) | **Medel** (1–2 dagar) | Saknas helt; Next.js har bra stöd för nonce-baserad CSP. |

### Bör åtgärdas (viktigt men inte akut)

| Punkt | Beskrivning | Insats | Motivering |
|-------|-------------|--------|------------|
| R1-8 | Node LTS + engines-fält | **Liten** (timmar) | Byt Volta-pin till 22.x, lägg `engines`. |
| R1-5 | Promptloggning — begränsa i prod | **Liten** (timmar) | Villkora `logFinalPrompt()` till dev-läge. |
| R1-7 | Feature toggle för streaming | **Liten** (timmar) | Byt hårdkodad `true` till env-var. |
| R1-10 | Prompt-heuristik → metadata-flagga | **Medel** (1 dag) | Kräver ändring i orchestrator + generator. |
| R1-4 | Filsystemskrivning → KV/Blob i genererad kod | **Medel** (1–2 dagar) | Påverkar genererad mall, inte sajtmaskin själv. |
| R2-20 | Kör tester i CI | **Liten** (timmar) | `test:ci`-script finns redan — lägg till i `ci.yml`. |
| R2-19 | Dependabot/Renovate | **Liten** (timmar) | Skapa config-fil. |
| R2-15 | Audit log för backoffice | **Medel** (1–2 dagar) | Kräver ny tabell + logging-lager. |

### Kan vänta (bra att ha, låg risk just nu)

| Punkt | Beskrivning | Insats | Motivering |
|-------|-------------|--------|------------|
| R2-3 | CSRF-tokens | **Medel** | SameSite=Lax + token-i-header ger redan visst skydd. |
| R2-11 | Formell migrationspipeline | **Medel** | Drizzle ORM stödjer migrations — vettigt vid nästa schema-ändring. |
| R2-13 | OTel-integration | **Stor** (3–5 dagar) | Bra för drift men inte kritiskt i beta. |
| R2-22 | SSR/ISR-policy | **Medel** | Prestandarelaterat, inte säkerhetskritiskt. |
| R2-25 | LICENSE + SBOM | **Liten** | Compliance; prioritera om koden ska vara publik. |
| R2-12 | Dokumenterad backup/restore | **Medel** | Viktig vid tillväxt men Neon/Supabase hanterar backup by default. |
| R2-17 | Engines + Volta (utöver Node-version) | **Liten** | Ingår naturligt i Node LTS-bytet. |

---

## Del 5: Insatsuppskattning sammanfattad

| Kategori | Antal punkter | Uppskattad total insats |
|----------|---------------|------------------------|
| Måste åtgärdas | 6 | ~4–7 arbetsdagar |
| Bör åtgärdas | 8 | ~5–9 arbetsdagar |
| Kan vänta | 7 | ~8–14 arbetsdagar |

**De sex "måste"-punkterna kan rimligen åtgärdas inom en sprint** (1–2 veckor) eftersom mycket infrastruktur redan finns (rate limiting, SSRF-guard, HMAC-mönster i huvud-appen). De flesta fixar handlar om att tillämpa befintliga mönster konsekvent.

---

## Del 6: Slutord

Rapport 1 är en **utmärkt och korrekt** kodgranskning — alla punkter bör tas på allvar.

Rapport 2 tillför värde i det bredare perspektivet (ops, compliance, observability) men dess **generella betyg 4/10 är för lågt** givet att huvudappens auth, cookie-hantering och inputvalidering redan följer etablerade mönster. Ett mer rättvisande betyg med kodåtkomst vore **5.5–6/10** — projektet har genomtänkt arkitektur men saknar härdning på periferin (genererad backoffice-kod, CSP, feature flags, konsekvent SSRF-skydd).

De kritiska åtgärderna (localStorage, HMAC, SSRF, rate limiting, CSP) har **låg till medel svårighetsgrad** tack vare att byggstenar redan finns i kodbasen. Den största insatsen blir att migrera den genererade backoffice-koden från localStorage-tokens till HttpOnly-cookies, vilket kräver en mer genomgripande omskrivning av `template-generator.ts`.

---

## Del 7: Implementationsstatus

Följande åtgärder har implementerats och validerats (typecheck + lint + test passerar):

### Fas 1: Backoffice Auth Hardening — KLAR

| Ändring | Fil | Status |
|---------|-----|--------|
| localStorage -> HttpOnly cookie med Secure/SameSite=Strict | `src/lib/backoffice/template-generator.ts` | Implementerad |
| SHA-256 hash -> HMAC-SHA256 + `timingSafeEqual` | `src/lib/backoffice/template-generator.ts` | Implementerad |
| Rate limiting (5 försök / 15 min per IP) | `src/lib/backoffice/template-generator.ts` | Implementerad |
| Origin-validering på alla PUT-routes (CSRF-skydd) | `src/lib/backoffice/template-generator.ts` | Implementerad |
| Logout via DELETE /api/backoffice/auth | `src/lib/backoffice/template-generator.ts` | Implementerad |
| Auth-verifiering via GET /api/backoffice/auth | `src/lib/backoffice/template-generator.ts` | Implementerad |

Alla `localStorage`-anrop för auth borttagna (0 kvar). Alla klientsidor (dashboard, content, images, colors) migrerade till cookie-baserad auth. Authorization-header borttagen ur alla fetch-anrop.

### Fas 2: SSRF-skydd — KLAR

| Ändring | Fil | Status |
|---------|-----|--------|
| `validateSsrfTarget` + `safeFetch` i upload-from-url | `src/app/api/media/upload-from-url/route.ts` | Implementerad |
| Attachment-schema: `z.any()` -> `z.object({ url: z.string().url() })` | `src/lib/validations/chatSchemas.ts` | Implementerad |

### Fas 3: Security Headers + Infrastruktur — KLAR

| Ändring | Fil | Status |
|---------|-----|--------|
| CSP-Report-Only + HSTS-header | `src/proxy.ts` | Implementerad |
| `rejectUnauthorized` default `true`, styrbar via env | `scripts/db-init.mjs` | Implementerad |
| Node 22.14.0 (LTS) + `engines`-fält | `package.json`, `.node-version` | Implementerad |

### Fas 4: Feature Flags + Loggning — KLAR

| Ändring | Fil | Status |
|---------|-----|--------|
| `isV0StreamingEnabled()` -> env-driven (`V0_STREAMING_ENABLED`) | `src/lib/v0/v0-generator.ts` | Implementerad |
| `logFinalPrompt` blockerad i prod (unless `LOG_PROMPTS=true`) | `src/lib/utils/debug.ts` | Implementerad |
| Prompt-heuristik: `isExpanded`-flagga i options + reducerad fallback | `src/lib/v0/v0-generator.ts` | Implementerad |

### Fas 5: CI/DX — KLAR

| Ändring | Fil | Status |
|---------|-----|--------|
| `npm run test:ci` tillagt i CI-pipeline | `.github/workflows/ci.yml` | Implementerad |
| Dependabot-config (npm + GitHub Actions) | `.github/dependabot.yml` | Skapad |
| Konfigurerbar `DATA_DIR` i genererad backoffice-kod | `src/lib/backoffice/template-generator.ts` | Implementerad |
| Uppdaterade setup-instruktioner med Vercel-guide | `src/lib/backoffice/template-generator.ts` | Implementerad |

### Kvarvarande punkter (ej implementerade)

Dessa bedöms som "bör åtgärdas" eller "kan vänta":

- **Audit log för backoffice** — kräver ny databastabell
- **CSRF double-submit tokens** — aktuellt först om Origin-check visar sig otillräcklig
- **Formell migrationspipeline** — Drizzle ORM stödjer detta redan
- **OTel-integration** — stor insats, inte kritiskt i beta
- **SSR/ISR-policy** — prestandaoptimering
- **LICENSE + SBOM** — compliance
- **Dokumenterad backup/restore** — ops
