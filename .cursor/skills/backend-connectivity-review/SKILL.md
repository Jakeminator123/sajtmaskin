# Backend Connectivity Review

Granskning av frontend ↔ backend-kopplingar: API-routes, dataflöden, saknade UI-kopplingar och redigeringsfunktioner.

**Trigger:** Användaren säger "Granska backend-koppling", "review connectivity", "skill 8" eller liknande.

## Instruktion

Starta **8 parallella subagenter** (`subagent_type: "explore"`, `readonly: true`). Varje agent granskar SIN specifika yta, läser alla relevanta filer, och skriver EN .txt-rapport till `reviews/`.

**REGLER:**
- READ-ONLY — inga kodändringar
- Varje rapport: max 40 rader, prioriterad lista (viktigast först), betyg 1–5 per punkt
- Perspektiv: "Alla backend-funktioner måste vara åtkomliga via en ren, minimalistisk frontend. Ingen funktion får vara 'gömd'."
- Fokus: saknade frontend-kopplingar, brutna flöden, oanvända API:er, redigeringsmöjligheter

## Subagenter

### Agent 1 — API Routes Audit
- **Fil:** `reviews/backend-01-api-audit.txt`
- **Scope:** `src/app/api/` (alla routes)
- **Fokus:** KRITISKT — lista ALLA API-routes. För varje: (1) vad gör den, (2) finns det frontend-UI som anropar den, (3) är den oanvänd/orphaned? Fokus på routes som saknar frontend-koppling.

### Agent 2 — Redigering av Befintlig Sajt
- **Fil:** `reviews/backend-02-editing.txt`
- **Scope:** Builder-komponenter, chat-hooks, API-routes för update/edit
- **Fokus:** KRITISKT — hur redigerar man en redan byggd sajt? Kan man: ändra text? Byta bild? Lägga till sida? Ändra layout? Ändra färger? Lista varje redigeringskapacitet och om den fungerar end-to-end.

### Agent 3 — Spara & Versioner
- **Fil:** `reviews/backend-03-save.txt`
- **Scope:** API-routes för spara/versioner, frontend save-UI
- **Fokus:** Sparas ändringar automatiskt? Kan man ångra? Finns det versionering? Kan man gå tillbaka till en tidigare version? Är save-state tydlig (sparad/osparad)?

### Agent 4 — Publicering & Deploy
- **Fil:** `reviews/backend-04-deploy.txt`
- **Scope:** `src/lib/deploy/`, deploy-routes, frontend publish-UI
- **Fokus:** Publiceringsflödet: knapp → API → deploy. Är det klart var man publicerar? Finns det preview vs production? Domänkoppling? Jämför med Vercel deploy-flow.

### Agent 5 — Projekt & Sessioner
- **Fil:** `reviews/backend-05-projects.txt`
- **Scope:** `src/app/api/projects/`, projekt-hantering, dashboard
- **Fokus:** Kan man se alla sina projekt? Öppna ett gammalt? Ta bort? Duplicera? Finns det en dashboard/backoffice? Är projekt-listan tillgänglig och tydlig?

### Agent 6 — Loading States & Optimistiska Uppdateringar
- **Fil:** `reviews/backend-06-loading.txt`
- **Scope:** Alla ställen med fetch/API-anrop i builder
- **Fokus:** Var finns loading-spinners? Var saknas de? Finns det optimistiska uppdateringar? Blockas UI under API-anrop? Jämför med Notion — snabb, aldrig blockerad.

### Agent 7 — Error Handling End-to-End
- **Fil:** `reviews/backend-07-errors.txt`
- **Scope:** API-routes (felrespons), frontend error boundaries
- **Fokus:** Vad returnerar API:er vid fel? Fångas det i frontend? Visas det för användaren? Finns det error boundaries? Kraschar hela appen vid ett API-fel?

### Agent 8 — Saknade Redigeringsfunktioner
- **Fil:** `reviews/backend-08-missing.txt`
- **Scope:** Backend-kapabiliteter vs frontend-UI
- **Fokus:** KRITISKT — lista funktioner som en sajt-redigerare förväntar sig men som saknas eller inte är kopplade. Tänk: SEO-inställningar, favicon, social preview (OG-tags), analytics, forms/submissions, custom CSS, 301-redirects. Prioritera efter användarnytta.
