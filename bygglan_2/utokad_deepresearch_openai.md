# Djupgranskning av kodbasen sajtmaskin

## Sammanfattning

Projektet framstår som en ambitiös, produktorienterad entity["company","GitHub","code hosting platform"]-hostad Next.js-applikation med tydligt fokus på AI-driven webbplats- och templategenerering, samt ett genererat “backoffice” för redigering och drift. Den senaste säkerhetshärdningen på branchen **tva22** (14 commits framför `main`; senaste commit **bea34ab4024730a17f65df9dc1d4d60438893fd6**, 2026‑03‑03) är substantiell: rate limiting har spridits till många högrisk‑routes, SSRF-guard och tester har tillkommit, CSP har kompletterats med nonce och kan köras i enforce-läge, Node har pinats till LTS och CI har utökats med tester och Dependabot. Detta är exakt den typ av “riskreduktion per arbetstimme” som normalt ger stor effekt i tidig produktfas.

**Fjärde, unbiased helhetsrating (1–10): 7/10.**  
Motivering: säkerhetsbaslinjen och driftsförutsättningarna har förbättrats markant i tva22 (CSP‑noncearmatur, utökad rate limiting, SSRF-skydd, Node‑pinning, tester/CI). Samtidigt finns några kvarvarande design- och implementeringsrisker som fortfarande kan ge allvarliga incidenter i produktion (främst SSRF‑hårdhet vid redirectkedjor/DNS, auth-inkonsekvenser och att vissa backoffice‑endpoints riskerar att vara mindre strikt skyddade än förväntat). För att nå 8–9/10 behövs främst “tightening” och standardisering, inte stora omskrivningar.

Källor för ramverk och säkerhetsprinciper: Next.js 16:s proxy-konvention och runtimebeteende citeturn0search0turn0search2turn0search1, OWASP om säkra cookie-attribut citeturn1search0, OWASP om SSRF (inkl. DNS‑kontroller och att stänga av redirects i klienten) citeturn1search5, OWASP om CSP och nonce/hashes citeturn4search0, OWASP om CSRF‑mitigeringar och origin/referrer-check citeturn4search8, samt entity["company","Vercel","cloud platform"] Blob-dokumentation (public vs private, access‑modell) citeturn4search3turn4search1 och Node releasestatus citeturn1search2.

## Metod och begränsningar

Granskningen genomfördes genom att använda den enda aktiverade connectorn (**GitHub**) för att:
- Inventera repo och läsa relevanta filer via GitHub-connectorn.
- Jämföra `main` mot `tva22` (branchen ligger **14 commits ahead**, behind 0).
- Inspektera de uttryckligen nämnda filerna och de nya säkerhetsrelaterade filerna på `tva22` (bl.a. `rateLimit.ts`, `ssrf-guard.ts`, `proxy.ts`, backoffice‑generatorn och tillhörande tester).
- Kontrollera commit‑metadata för **bea34ab…** och att deployment‑checks från entity["company","Vercel","cloud platform"] rapporterar “success” för committen (GitHub “combined status” visade Vercel‑checks som gröna).

Begränsningar:
- Jag körde **inte** `npm run build/lint/typecheck/test` i en lokal klon eftersom exekveringsmiljön här saknar nätverksåtkomst för att klona repo och installera beroenden. Därför är resultatet en **statisk kodinspektion** + metadata från repo/CI-konfiguration. Jag utgår från att era egna lokala körningar och CI är facit för exekverbarhet (och lyfter explicit där designen ser ut att kunna bete sig annorlunda i olika runtime‑miljöer, t.ex. serverless).
- Deploytarget, SLA, teamstorlek, driftbudget och hotmodell är **okända**; rekommendationer prioriteras därför efter “vanliga SaaS-risker” och kostnadseffektiv riskreduktion.

## Nuläge efter tva22

Den här sektionen sammanfattar det mest relevanta som faktiskt förändrats och varför det spelar roll.

### Proxy som nätverksgräns i Next.js 16

Ni använder `src/proxy.ts` för att injicera säkerhetsheaders, göra auth‑gating på vissa paths och hantera CORS. Detta ligger i linje med Next.js 16:s rekommenderade konvention: filen **`proxy.ts` ersätter (depricerar) `middleware.ts`**, kör på Node.js runtime och kan ligga i projektroten eller under `src/` på samma nivå som `app/`. citeturn0search0turn0search2turn0search1

Det är en viktig arkitekturell byggsten eftersom CSP, HSTS och auth‑gating annars lätt blir fragmenterat över enskilda routes.

### Cookie-säkerhet och sessionsmönster

I huvudappen används HttpOnly‑cookies för session/tokenhantering (t.ex. `sajtmaskin_auth` och en separat anonym “session id”-cookie), vilket följer OWASP:s rekommendationer om att minska risken för att XSS läcker session‑identifierare (HttpOnly), att kräva HTTPS i produktion (Secure) och att använda SameSite som CSRF‑mitigering. citeturn1search0

Backoffice‑auth på tva22 har dessutom flyttats bort från localStorage‑mönster och använder signerade HttpOnly‑cookies, med timing‑safe jämförelse och en “session version” för global revocation (forced logout). Detta matchar en rimlig “small‑team secure enough”-nivå.

### SSRF-guard och fil-/URL‑uppladdning

Att ni har fått in en central `ssrf-guard` och använder den när ni hämtar externa URL:er (t.ex. “upload-from-url”) är en tydlig riskreduktion: SSRF är en av de mest typiska vägarna till metadata‑läckage (cloud metadata endpoints), intern portscanning och åtkomst till interna tjänster. OWASP rekommenderar flera lager: schema‑allowlist, IP‑blocklist och **DNS‑baserad kontroll** (inkl. DNS pinning‑skydd) samt att **inte följa redirects okontrollerat**. citeturn1search5

### Rate limiting som standardkomponent

Ni har infört en gemensam `withRateLimit` och applicerat den på många högrisk‑routes. Detta är i praktiken en “incident-prevention primitive” som minskar blast radius för både abuse och oavsiktliga kostnadssmällar (AI‑calls, scraping, upload). Samtidigt finns viktiga serverless‑realiteter: “in‑memory fallback” är bra i dev men ofta otillräcklig i produktion, där en distribuerad backend (t.ex. Redis/Upstash) krävs för konsekvent beteende. Upstash beskriver även tradeoffs med fixed window (burst vid fönstergränser), vilket är relevant om ni ser flödestoppar. citeturn4search6turn4search5

### Node-version och hållbarhet

Att gå från Node 25 (current) till Node 22 LTS är ett stabilitetslyft, men det är också värt att notera att Node 22 vid tidpunkten i Node:s officiella tabell ligger i **Maintenance LTS** medan Node 24 är **Active LTS**. För produktionsdrift brukar det vara en fördel att ligga på Active LTS om man vill maximera “support runway”. citeturn1search2

## Risker och rekommenderade åtgärder

Nedan är en prioriterad lista med **25 konkreta åtgärder**. Varje punkt är formulerad som *kritik + mitigation* och är avsedd att vara direkt handlingsbar. För transparens: flera punkter gäller “tightening” av redan införda mönster (ni har gjort jobbet att bygga primitives; nu handlar det om att göra dem konsekventa).

### Prioriterade åtgärder

1) **Skydda även “GET”-endpoints i backoffice som returnerar redigeringsdata.** Om `/api/backoffice/content` och `/api/backoffice/colors` kan läsas utan auth läcker det backoffice‑ytans datamodell och ev. icke‑publika fält; kräv session-cookie även för GET eller separera “public read” från “admin read”. (High, M)

2) **Hårdgör `safeFetch` så att redirects hanteras säkert över hela kedjan.** OWASP nämner explicit att man bör stänga av redirect-stöd eller validera redirectmål; i praktiken behövs “manual redirect loop” med max hops och validering per hop. citeturn1search5 (High, M)

3) **Lägg till DNS‑resolution i SSRF-skyddet för hostname‑inputs.** En blocklist av “kända interna hostnames + IP‑range‑check” är inte tillräckligt om en publik hostname resolverar till privat IP (DNS rebinding/pinning); OWASP rekommenderar att resolution görs och att alla A/AAAA‑adresser valideras. citeturn1search5 (High, M)

4) **Eliminera alla “dev-secret” fallback‑secrets i produktion – gör dem fatal.** OWASP‑mässigt är en default‑secret en klassisk “footgun”; använd central `SECRETS.jwtSecret` konsekvent och gör `proxy.ts`/edge‑auth oförmögen att starta i prod utan korrekt secret. citeturn1search0 (High, S)

5) **Gör rate limit‑identifiering svår att spoofa i produktion.** `x-forwarded-for` kan i vissa miljöer manipuleras; använd plattformsstöd (t.ex. `request.ip` där det är tillförlitligt) eller en signerad header från er ingress. (Med, M)

6) **Cache:a Upstash/Redis‑klient och limiter-instans per process.** Att skapa klient/limiter per request ger onödigt latency och risk för resursläckage; initiera lazily men återanvänd. (Med, S)

7) **Säkerställ att “in-memory rate limiting” aldrig är enda skyddet i serverless production.** Dokumentera och validera (vid boot) att Redis/Upstash‑env finns i prod för endpoints med ekonomisk risk (AI, uploads). citeturn4search6 (Med, S)

8) **Strama åt CSP ytterligare: minimera `unsafe-inline` och lägg till rapportering.** OWASP rekommenderar nonce/hashes för inline och att man använder rapporteringsmekanismer (report-uri/report-to) för att iterera policyn säkert. citeturn4search0 (Med, M)

9) **Lägg `Vary: Origin` på CORS-svar där `Access-Control-Allow-Origin` är dynamiskt.** Utan `Vary` kan caching ge fel origin‑policy till andra klienter. (Low, S)

10) **Komplettera Origin-check med CSRF‑token för de mest känsliga cookie-auth routes.** OWASP listar origin/referrer-check som en stateless mitigation men noterar att det är en referensmodell och att en full mitigation ofta kombineras med token/double-submit. citeturn4search8 (Med, M)

11) **Gör JWT‑signature compare konstant-tid (`timingSafeEqual`).** Låg sannolikhet i praktiken, men enkel förbättring när ni redan använder timing-safe i backoffice; det ger konsistens och minskar teoretiska sidechannels. (Low, S)

12) **Inför token‑revocation/versionering även för huvudappens JWT om hotmodell kräver det.** Idag är JWT stateless; vid exfiltration finns risk att token gäller till `exp`. En enkel “user.tokenVersion” i DB kan invalidisera alla tokens vid t.ex. password reset. (Med, M)

13) **Begränsa promptloggning och prompt‑snippets i fil‑logger så de inte kan innehålla PII.** Även om fil‑logger är opt-in via env kan “promptSnippet” innehålla kunddata; inför explicit redaction/opt-out eller logga bara längd + hash. (Med, S)

14) **Hårdgör hanteringen av OIDC/refresh‑token i `scripts/refresh-token.mjs`.** Att automatiskt skriva tokens till `.env.local` är praktiskt men riskerar sekretsspridning via logs/backup; dokumentera “do not share” och säkerställ `.gitignore` + filpermissions. (Low, S)

15) **Verifiera att `proxy.ts` inte introducerar oönskad latency eller blockerar CDN‑optimeringar.** Next.js 16 anger att `proxy` kör Node.js runtime; vissa “edge-first” optimeringar blir då annorlunda. citeturn0search2turn0search0 (Low, M)

16) **Revidera Blob‑strategin för backoffice-data: public vs private.** Public blobs är publikt läsbara (även om skriv kräver token); om backoffice-data kan innehålla känsligt bör ni gå mot private stores. citeturn4search3turn4search1 (Med, M)

17) **Om ni går mot private Blob: uppdatera läslogik så den autentiserar reads.** Vercel beskriver att privata blobs kräver auth även för läsning; det påverkar “fetch(match.url)”‑mönster och cachingstrategin (Function cache vs browser cache). citeturn1search4turn4search1 (Med, M)

18) **Ersätt `scripts/db-init.mjs` som “schema source of truth” med migrations.** Idempotent init är bra i dev men blir snabbt riskabelt i prod; använd t.ex. Drizzle migrations eller annan migrationsmotor, och kör migrations i CI/CD eller release‑pipeline. (Med, L)

19) **Säkerställ schema‑paritet mellan DB‑init och applikationskod.** Annars får ni “works locally” men driftfel vid ny environment; lägg in en schema‑check (t.ex. migreringsstatus) i startup eller healthcheck. (Low, M)

20) **Inför backup- och restore‑runbook för DB och Blob.** För engineering leadership är detta ofta skillnaden mellan “incident” och “katastrof”; definiera RPO/RTO och teknisk procedur. (Med, M)

21) **Höj observability: korrelations‑ID, strukturerade logs och tydliga error‑koder.** Det ger snabbare felsökning, bättre support och underlag för produktbeslut; proxy‑lagret är en bra plats att injicera request id. (Low, M)

22) **Lägg till säkerhetsautomation i CI: CodeQL / dependency review / secret scanning.** Dependabot är bra, men komplettera med regelbunden SAST och policy‑gate på high severity. (Low, M)

23) **Planera Node‑uppgradering till Active LTS inom rimlig tid.** Node 22 är Maintenance LTS i Node:s officiella tabell; Node 24 är Active LTS och ger längre “active support runway”. citeturn1search2 (Low, M)

24) **Lägg till LICENSE och grundläggande policyfiler (SECURITY.md, ev. NOTICE).** Avsaknad av LICENSE gör juridisk användning osäker (särskilt om repo är publikt); för SaaS med kunddata är SECURITY.md dessutom en trovärdighetsmarkör. (Med, S)

25) **Förbered compliance för personuppgifter: register över behandling och tydliga policies.** Om ni hanterar e‑post, kontaktärenden och ev. betalning/analytics behöver ni dokumentation; IMY beskriver skyldigheten att föra register över behandlingar enligt GDPR art. 30. citeturn5search2turn5search0 (Med, M)

### Översiktstabell

| Issue | Severity | File(s)/Location | Suggested Fix | Estimated Effort |
|---|---|---|---|---|
| Backoffice GET endpoints utan auth kan läcka data | High | `src/lib/backoffice/template-generator.ts` (genererade `content/route.ts`, `colors/route.ts`) | Kräv cookie‑session även för GET eller separera “public read” | M |
| SSRF: osäker redirectkedja / redirect follow | High | `src/lib/ssrf-guard.ts` | Manual redirect loop + validera varje hop + max hops | M |
| SSRF: ingen DNS‑resolution för hostname → rebinding/pinning risk | High | `src/lib/ssrf-guard.ts` | `dns.lookup` (A/AAAA) + validera alla IPs | M |
| Dev fallback secret i prod (inkonsekvent usage) | High | `src/proxy.ts` + secret‑hantering | Importera central secret och fail fast i prod | S |
| Rate limit: IP‑identifiering kan kringgås | Med | `src/lib/rateLimit.ts` | Använd tillförlitlig client IP‑källa / signerad ingress‑header | M |
| Rate limit: init per request | Med | `src/lib/rateLimit.ts` | Cache:a limiter/redis client per process | S |
| Serverless: in-memory rate limiting räcker ej | Med | `src/lib/rateLimit.ts` + env | Validera Redis/Upstash i prod, dokumentera krav | S |
| CSP: förbättra policy och inför rapportering | Med | `src/proxy.ts` | Ta bort onödiga källor, minska `unsafe-inline`, använd report-to/report-uri | M |
| CORS: saknar `Vary: Origin` | Low | `src/proxy.ts` | Sätt `Vary: Origin` när ACAO är dynamisk | S |
| CSRF: komplettera Origin-check med token på high risk | Med | backoffice state‑changing routes, ev. user‑cookies | CSRF token (double submit / server token) | M |
| JWT compare ej timing-safe | Low | `src/lib/auth/auth.ts` | `timingSafeEqual` för signature compare | S |
| JWT revocation saknas | Med | `src/lib/auth/*`, DB | TokenVersion/jti‑store för invalidation | M |
| PromptSnippet kan innehålla PII i fil‑logger | Med | `src/lib/logging/file-logger.ts` | Redaction/hashing eller disable i prod | S |
| Refresh-token script skriver tokens lokalt | Low | `scripts/refresh-token.mjs` | Dokumentera, minimera loggar, säkra filhantering | S |
| Proxy runtime tradeoff (Node, ej Edge) | Low | Next.js proxy‑konvention | Mät latency, överväg matcher-scope | M |
| Backoffice JSON‑Blob public read | Med | genererad `app/api/backoffice/_lib/storage.ts` | Överväg private store + auth reads | M |
| Private Blob: kräver auth även för read | Med | Blob-läsning i storage | Skicka Authorization mot private blob eller proxya via API | M |
| DB-init som schema‑sanning | Med | `scripts/db-init.mjs` | Inför migrations och versionskontroll | L |
| Schema‑paritet/healthcheck | Low | DB‑startup | Lägg schema‑version check i health | M |
| Backup/restore runbook saknas | Med | Ops-dokumentation | Definiera RPO/RTO + procedur | M |
| Observability/correlation IDs | Low | `src/proxy.ts` + logging | Injekt request-id, structured logs | M |
| SAST/CodeQL i CI | Low | GitHub Actions | Aktivera CodeQL + dependency review | M |
| Node LTS strategi (22→24) | Low | `.node-version`, `package.json` | Planerad uppgradering till Active LTS | M |
| LICENSE/SECURITY policy saknas | Med | repo root | Lägg LICENSE + SECURITY.md | S |
| GDPR register/policyarbete | Med | Product/compliance | Upprätta art.30‑register + policydokument | M |

## Definition of Done för sex måsten

Du nämnde (och tva22 verkar bygga på) sex “måste”-områden. Nedan är en tydlig **DoD (acceptanskriterier)** som går att använda för PR‑review och release‑gate. Jag formulerar kriterierna så att de funkar oavsett om ni deployar på entity["company","Vercel","cloud platform"], annan serverless eller VM.

### Cookie-baserad auth i backoffice

Kravbild: Sessionshantering ska vara cookie‑baserad med säkra attribut för att minska XSS‑exfiltration och CSRF‑yta. citeturn1search0  
**DoD:**
- Inga auth‑tokens i `localStorage`/`sessionStorage`.
- Cookie har **HttpOnly**, **Secure** i prod och lämplig **SameSite** (minst Lax, gärna Strict för ren admin‑yta).
- Login, verify och logout har tydliga endpoints och konsekvent 401/403‑beteende.
- Negativa tester: utan cookie → 401; manipulerad cookie → 401; expired → 401.

### HMAC-signering och konstant-tid jämförelse

Kravbild: Signering ska vara HMAC-baserad och verifiering ska inte använda naiv strängjämförelse.  
**DoD:**
- Cookiepayload signeras med `createHmac("sha256", secret)` och verifieras med `timingSafeEqual`.
- Secrets roteras utan att “dev fallback” kan råka hamna i prod.
- Tester: signaturtampering ska alltid avvisas.

### TLS/SSL och `rejectUnauthorized`

Kravbild: Databaskopplingar ska ha TLS som default och inte tumma på certvalidering i prod.  
**DoD:**
- `rejectUnauthorized` ska vara **true som default**.
- Om override finns ska den vara tydligt dokumenterad och **blockerad i production** (eller kräva explicit “dangerous override”).
- Drift-test: prod deploy ska fail fast om TLS‑krav inte uppfylls.

### SSRF-skydd

Kravbild: All user-controlled URL fetch ska skyddas mot interna mål och redirect‑tricks. OWASP rekommenderar DNS‑kontroll (inkl. DNS pinning-skydd) och att redirects inte ska följas okontrollerat. citeturn1search5  
**DoD:**
- Endast `http/https` tillåts.
- IP‑range blocklist för privata/metadata-range + hostname‑blocklist.
- DNS resolution: alla A/AAAA måste valideras som publika.
- Redirects hanteras “manual”, valideras per hop, max hops (t.ex. 5), och total timeout gäller hela kedjan.
- Tester inkluderar: 169.254.169.254, localhost, redirect till intern, redirectkedja, DNS‑rebinding-simulering (så gott det går i unit/integration).

### Rate limiting

Kravbild: Högrisk‑routes ska ha konsekvent rate limiting med korrekt client‑identifiering och 429‑svar med headers.  
**DoD:**
- Alla kostsamma/abuse‑känsliga routes går via `withRateLimit`.
- Identiteten kan inte kringgås via spoofade headers i prod (plattformens IP‑källa eller verifierad header).
- I prod kräver ni distribuerad backend (Redis/Upstash) för konsistens. citeturn4search6  
- Tester: 429, Retry‑After och remaining/reset headers stämmer.

### CSP och security headers

Kravbild: CSP ska kunna köras i Report‑Only under införande och i enforce‑läge med nonce när det är stabilt. OWASP beskriver nonce/hashes som rekommenderat alternativ till `unsafe-inline` och lyfter rapportering som iterativ metod. citeturn4search0  
**DoD:**
- CSP‑Report‑Only i staging/test med fungerande rapportering (report-uri/report-to).
- Enforce i prod när violation‑nivå är acceptabel.
- Nonce genereras per request och används konsekvent i de script-taggar som behöver inline.
- Inga `unsafe-eval` om det inte är absolut nödvändigt, och i så fall tydligt motiverat.

## Kritiska kodskisser och “diff-liknande” förbättringar

Här är tre konkreta patches/snippets – dels för att visa “vad bra ser ut”, dels för att täppa de mest riskfyllda luckorna.

### Exempel: HttpOnly cookie auth och OWASP-attribut

OWASP betonar HttpOnly/Secure/SameSite som centrala attribut för sessioncookies. citeturn1search0

```ts
// Exempel (mönster): sätt cookie säkert
cookieStore.set("sajtmaskin_auth", token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",        // eller "strict" för ren admin-yta
  path: "/",
  maxAge: 7 * 24 * 60 * 60,
});
```

### Exempel: HMAC-signering + timing-safe compare

```ts
import { createHmac, timingSafeEqual } from "crypto";

function sign(data: string, secret: string) {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
```

### Förslag: robust SSRF-safeFetch med redirect loop och total timeout

OWASP rekommenderar bl.a. att redirects inte ska följas utan kontroll. citeturn1search5

```ts
export async function safeFetchStrict(
  input: string,
  opts: RequestInit & { timeoutMs?: number; maxRedirects?: number } = {},
) {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const maxRedirects = opts.maxRedirects ?? 5;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let url = new URL(input);

    for (let hop = 0; hop <= maxRedirects; hop++) {
      // validateSsrfTarget(url) här (inkl. DNS om möjligt)

      const res = await fetch(url.toString(), {
        ...opts,
        redirect: "manual",
        signal: controller.signal,
      });

      const isRedirect = res.status >= 300 && res.status < 400;
      const location = res.headers.get("location");

      if (!isRedirect || !location) return res;

      url = new URL(location, url);
    }

    return new Response("Too many redirects", { status: 400 });
  } finally {
    clearTimeout(timeout);
  }
}
```

## Flödesdiagram

### Backoffice auth-flöde

```mermaid
sequenceDiagram
  participant B as Browser
  participant P as Proxy (proxy.ts)
  participant A as Backoffice Auth API
  participant C as Backoffice Content/Colors API

  B->>A: POST /api/backoffice/auth (password)
  A-->>B: Set-Cookie: backoffice_session=...; HttpOnly; Secure; SameSite=Strict
  B->>A: GET /api/backoffice/auth (verify)
  A-->>B: 200 { authenticated: true }

  B->>C: PUT /api/backoffice/content (updates) + Cookie
  C->>A: verifySessionCookie + origin check
  C-->>B: 200 { success: true }
```

### Deploy- och requestflöde

```mermaid
flowchart TD
  Dev[Developer pushes to main/tva22] --> CI[GitHub Actions: typecheck/lint/test/build]
  CI --> Deploy[Vercel deployment]
  Deploy --> Req[Incoming request]
  Req --> Proxy[Next.js proxy.ts (Node runtime)]
  Proxy -->|inject headers, CSP nonce, auth gating| App[Next.js Routes + App Router]
  App --> APIs[API routes]
  APIs --> DB[(Postgres)]
  APIs --> Blob[(Vercel Blob / storage)]
```

## Nästa fokusområden och avvägningar

Det som återstår är mindre “bygg mer” och mer “gör det robust i skarpa miljöer”. För engineering/product leadership är det ofta rätt att välja 2–3 huvudspår per sprint:

Först: **Säkerhetskonsistens och serverless-realism.** Ni har primitives (proxy, SSRF guard, rate limit), men de behöver bli deterministiska i prod: korrekt client IP‑modell, SSRF med DNS+redirectkedja, och att inga endpoints råkar “glömma auth”.

Sedan: **Driftbarhet och datarisk (DB/Blob).** Bestäm om backoffice‑data är publik eller inte. Om den inte är det, gå mot private Blob store (och justera läsning), vilket stöds av Vercels nya private storage‑modell. citeturn4search1turn4search4 Samtidigt bör DB‑migrations och backup/runbook prioriteras tidigt för att slippa smärtsam retrofitting.

Till sist: **Compliance och trust.** Saknad LICENSE och svag policy‑yta är en onödig friktion för ett publikt repo. För ett svenskt bolag som hanterar e‑post och kundärenden är det låg kostnad att samtidigt etablera GDPR‑basdokumentation (t.ex. register över behandlingar) som IMY beskriver. citeturn5search2