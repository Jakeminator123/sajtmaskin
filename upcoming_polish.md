# Upcoming Polish (icke-brådskande)

Dessa punkter identifierades i säkerhetsgranskningen men klassades som
**DEFER** — inga exploaterbara sårbarheter, utan förbättringar att ta
vid tillfälle. Ingen tidspress.

Ursprung: `bygglan_2/00-TRIAGE.md` (fullständig triagering med ordlista)

---

## Kodförbättringar

### DNS-resolution i SSRF-guard
**Insats:** Medel
SSRF-skyddet blockerar redan privata IP-adresser och validerar varje
redirect-hop. DNS rebinding (att en publik hostname resolvar till en
privat IP) kräver att angriparen kontrollerar en DNS-server — extremt
osannolikt för en liten svensk SaaS. Lägg till `dns.lookup()` om ni
börjar hantera högt värdefulla mål eller ser misstänkt trafik.
**Fil:** `src/lib/ssrf-guard.ts`

### CSRF-token för state-changing routes
**Insats:** Medel
`SameSite=Lax` cookies förhindrar redan CSRF för POST/PUT/DELETE.
Origin-check finns i backoffice. Lägg till double-submit CSRF-token
om ni lägger till cross-origin-formulär eller slappnar på SameSite.
**Filer:** Backoffice-routes, eventuellt proxy.ts

### JWT timing-safe signaturjämförelse
**Insats:** Liten
Använd `timingSafeEqual` i JWT-verifiering i `src/lib/auth/auth.ts`.
Teoretisk risk — timing-attacker kräver tusentals exakta mätningar som
nätverksjitter gör omöjliga. Gör vid nästa tillfälle ni rör auth.
**Fil:** `src/lib/auth/auth.ts`

### JWT token-revokering (tokenVersion)
**Insats:** Medel-Stor
Lägg till `token_version`-kolumn i users-tabellen, kontrollera vid
varje request, inkrementera vid lösenordsbyte. JWTs har redan expiry.
Gör när ni implementerar lösenordsåterställning eller kontosäkerhet.
**Filer:** `src/lib/db/schema.ts`, `src/lib/auth/auth.ts`, migration

### PII-redigering i promptloggar
**Insats:** Liten
Hasha eller trunkera prompt-innehåll i fil-logger innan ni aktiverar
filloggning i produktion. Risken är i era egna loggar, inte exponerad.
**Fil:** Fillogger (om den finns)

---

## Infrastruktur & drift

### Migrera från db-init.mjs till Drizzle-migrationer
**Insats:** Stor
Sätt upp `drizzle-kit` med migrationskatalog. Konvertera existerande
schema till migrationsfiler. Kör `npx drizzle-kit migrate` vid deploy.
Gör innan nästa schemaändring för att undvika manuell SQL.
**Filer:** `scripts/db-init.mjs` → `drizzle/` + `drizzle.config.ts`

### Backup- och återställningsdokumentation
**Insats:** Liten (bara dokumentation)
Dokumentera Supabase backup-inställningar, RPO/RTO-mål och
återställningsprocedur. Supabase har inbyggda backups.
**Plats:** Ops-dokumentation / README

### Node 22 → 24 uppgradering
**Insats:** Liten
Node 22 är Maintenance LTS (stöds till april 2027). Node 24 är Active
LTS. Uppgradera när Next.js officiellt stöder Node 24 och ni vill ha
senaste funktionerna. Ingen brådska.
**Filer:** `.node-version`, `package.json`

---

## CI & policy

### CodeQL / SAST i CI
**Insats:** Medel
Dependabot är redan konfigurerat. Lägg till CodeQL (GitHub Actions)
för automatisk sårbarhetsskanning av källkod. Gör när CI är stabilt.
**Fil:** `.github/workflows/codeql.yml` (ny)

### LICENSE och SECURITY.md
**Insats:** Liten
Saknad LICENSE gör juridisk användning osäker om repot är publikt.
SECURITY.md är en trovärdighetsmarkör. Lägg till om repot görs publikt.
**Filer:** `LICENSE`, `SECURITY.md` (nya)

### GDPR-register (art. 30)
**Insats:** Medel (juridisk/affärs-uppgift, inte kod)
Om ni hanterar e-post, kontaktärenden och betalning behöver ni
dokumentation om behandling av personuppgifter enligt GDPR.
**Plats:** Intern policy / compliance-katalog

---

## Redan implementerat (referens)

Dessa åtgärder slutfördes 2026-03-04 i två commits på `main`:

**Fas 1 — Kritiska fixar:**
- [x] M1: Dev-fallback JWT-hemlighet borttagen
- [x] M2: SSRF-skydd i webscraper
- [x] M3: TLS-verifiering för databas
- [x] M4: Auth på backoffice GET-endpoints
- [x] M5: Rate limit-identifiering kan inte spoofas
- [x] M6: Auth på domän- och nedladdnings-routes

**Fas 2 — Härdning:**
- [x] S1: SSRF redirect-kedja validerad (max 5 hopp)
- [x] S2: Redis-klient cachad, produktionsvarning
- [x] S3: Ägarskapsfilter på företagsprofiler
- [x] S4: CSP-rapporteringsendpoint
- [x] S5: `Vary: Origin` på CORS-svar
