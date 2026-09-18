# Filkarta — publik `/analys`

Ägartabell. Kod vinner. Detaljerad SEO-routing:
[`02-seo-routing.md`](02-seo-routing.md). Aktiviteter äger *ändringen*.

## Orörd motor (läs, ändra inte)

| Yta | Ägare | Symboler |
|---|---|---|
| POST-yta | [`src/app/api/audit/route.ts`](../../../../src/app/api/audit/route.ts) | `POST`, `maxDuration` |
| Handler | [`src/app/api/audit/modules/handler.ts`](../../../../src/app/api/audit/modules/handler.ts) | `POST` |
| Schema / modeller | [`src/app/api/audit/modules/schema.ts`](../../../../src/app/api/audit/modules/schema.ts) | `AUDIT_AI_SCHEMA` (publik + Avancerad), `AUDIT_AI_SCHEMA_BASIC` (betald Vanlig) |
| Nivåsemantik | [`src/lib/audit/audit-tier.ts`](../../../../src/lib/audit/audit-tier.ts) | `resolveAuditRun` — publik tvingas till Luna/4 sidor/fullt schema |
| Validering / fallback | [`src/app/api/audit/modules/analysis.ts`](../../../../src/app/api/audit/modules/analysis.ts) | `validateAuditResult` |
| Prompt | [`src/lib/audit-prompts.ts`](../../../../src/lib/audit-prompts.ts) | `buildPublicAnalysPrompt`, `buildAuditPrompt` |
| Typer | [`src/types/audit.ts`](../../../../src/types/audit.ts) | `AuditResult`, `AuditMode` |
| Scrape + URL | [`src/lib/webscraper.ts`](../../../../src/lib/webscraper.ts) | `scrapeWebsite(url, { maxPages })`, `validateAndNormalizeUrl`, `getCanonicalUrlKey` |
| SSRF | [`src/lib/ssrf-guard.ts`](../../../../src/lib/ssrf-guard.ts) | `validateSsrfTarget` |
| Källkods-SEO (annan sak) | [`src/lib/seo/audit.ts`](../../../../src/lib/seo/audit.ts) | — |

## Rörs i det här spåret

| Yta | Ägare | Aktivitet | Symboler / vad |
|---|---|---|---|
| Publik route | `src/app/analys/page.tsx`, `analys-content.tsx` | A1 | metadata, H1 |
| Publik API | `src/app/api/analys/route.ts` | A1, A2 | `POST`, `maxDuration` |
| Motor | `src/lib/audit/run-website-audit.ts` | A1 | `runWebsiteAudit` |
| Rapport-UI | `src/components/analys/analys-tool.tsx`, `analys-report.tsx` | A1 | egen yta, inte AuditModal |
| PDF | `src/components/audit/AuditPdfReport.tsx` | A1 (återanvänd) | `AuditPdfReport` |
| Prompt | `src/lib/audit-prompts.ts` | A1 | `buildPublicAnalysPrompt` |
| Credits | oförändrad `prepareCredits` för `/api/audit` | A2 | publik väg tar inte credits |
| Rate limit | `src/lib/rate-limit.ts` | A2/A3 | `analys:public` 1/24h |
| In-flight | [`src/app/api/audit/modules/in-flight.ts`](../../../../src/app/api/audit/modules/in-flight.ts) | A3 | `inFlightAudits` |
| Entry-copy | [`src/components/modals/entry-modal.tsx`](../../../../src/components/modals/entry-modal.tsx) | A4 | `ENTRY_MODES.audit` |
| Handoff | [`src/lib/builder/audit-handoff.ts`](../../../../src/lib/builder/audit-handoff.ts), [`src/app/page.tsx`](../../../../src/app/page.tsx) | A4 | `extractAuditHandoffPayload` |
| Spara | [`src/lib/db/services/audits.ts`](../../../../src/lib/db/services/audits.ts), [`src/app/api/audits/route.ts`](../../../../src/app/api/audits/route.ts) | A4 | `saveUserAudit` (fortsatt auth) |
| Sitemap | [`src/app/sitemap.ts`](../../../../src/app/sitemap.ts) | A1, efter B2 | `STATIC_SITEMAP_REL_PATHS` |
| Robots | [`src/app/robots.ts`](../../../../src/app/robots.ts) | A1 bara om disallow behövs | default `allow: /` |
| Nav/footer | [`landing-v2/navbar.tsx`](../../../../src/components/landing-v2/navbar.tsx), [`landing-footer.tsx`](../../../../src/components/landing-v2/landing-footer.tsx) | A1/A4 efter B3 | intern väg in |

## Grannytor — rör inte semantik

| Yta | Ägare | Varför den är granne |
|---|---|---|
| Wizard-alias | [`src/lib/entry/use-entry-params.ts`](../../../../src/lib/entry/use-entry-params.ts) | `analyserad` → wizard |
| Landing-kategori | [`landing-chat-data.ts`](../../../../src/components/landing-v2/landing-chat-data.ts), [`route-target.ts`](../../../../src/components/landing-v2/route-target.ts) | `analyserad` ≠ `audit` |
| Sparade rapporter | `src/app/audits/` | Inloggad lista, inte lead magnet |
| SEO-landningar | [`src/lib/seo-landing-pages/registry.ts`](../../../../src/lib/seo-landing-pages/registry.ts) | Inte registret; ev. Relaterat-länk ut |
| Kampanj | `src/app/kostnadsfri/` | `noindex`-inbjudan, annan produkt |

## Tester som typiskt följer med

| När | Fil |
|---|---|
| Handler / 401 / 409 | [`src/app/api/audit/route.test.ts`](../../../../src/app/api/audit/route.test.ts) |
| Widget-auth/credits | [`site-audit-section.test.tsx`](../../../../src/components/layout/site-audit-section.test.tsx) |
| Sitemap | [`src/app/sitemap.test.ts`](../../../../src/app/sitemap.test.ts) |
| Credits 401/402 | [`src/lib/credits/server.test.ts`](../../../../src/lib/credits/server.test.ts) |
| Spara | [`src/app/api/audits/route.test.ts`](../../../../src/app/api/audits/route.test.ts) |
| Handoff | [`src/lib/builder/audit-handoff.test.ts`](../../../../src/lib/builder/audit-handoff.test.ts) |
| Landing-länkar | [`navbar-footer-links.test.tsx`](../../../../src/components/landing-v2/navbar-footer-links.test.tsx) |
