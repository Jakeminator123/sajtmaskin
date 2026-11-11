---
status: archived
owner: unassigned
topic: Test- och kontrollförenkling. A0/A1/A6a och #1553–#1584 är levererade; A3/A4/A5/A6b/A7 är parkerade.
created: 2026-10-04
source: docs/plans/active/2026-10-04-test-och-kontrollforenkling/ (konsoliderad 2026-11-05, arkiverad 2026-11-11; git är arkiv).
---

> Status: Archived
> Not current architecture.
> Do not use as runtime guidance.
> Replaced by: [pr-workflow § 3](../../../.agents/skills/pr-workflow/SKILL.md)

# Test- och kontrollförenkling — parkerat koncentrat

Arkiverad 2026-11-11 på ägarens begäran. Testreglerna gäller i varje PR via
`npm run verify:pr -- --plan` och pr-workflow; ingen separat testkampanj är
beställd. Skydden och kraven nedan är underlag om spåret startas igen.

## Levererat, inte nya uppdrag

A0/A1, auditpiloten/A6a och delpaketen #1553/#1562/#1564/#1574/#1576/
#1580/#1582/#1584 är levererade enligt Git och tidigare kvitton.
Särskilt #1580 är **mergat**, inte draft: `6432e5eb2be2f97e1e6fcb906fb67e94c7759c57`.
Det körde seedad edit/PATCH, save, SQL, reload/exakt editor och negativ
gästisolering med exakta 404 utan skip/retry. Det är inte ett prov av
UI-skapad generation, follow-up, remove/replace eller full capture/promotion.

Historiska mätningar och CI-/deploymentkvitton finns i Git. De gamla
13 DB-paritetsavvikelserna var separat rött, inte grön post-CI eller flake.

## Parkerat arbete

| ID | Leverans | Klart när |
|---|---|---|
| A3 | Bedöm hela upptäckta test-/kontrollbeståndet områdesvis. | Varje grupp är behåll/skriv om/slå ihop/ta bort/utred med befintlig owner, verkligt krav, callerbevis, felrespons och mottagare. Discovery är inte full semantisk granskning. |
| A4 | UI-skapad generation, lokal ändring → follow-up, remove A, replace A→B och representativt fel/avbrott. | Spara/reload/återupptagning och nästa providerrequest bär rätt tidigare filer. Lokala ändringar/orelaterat innehåll består; äldre brief återinför inte A. Avbrott bevarar data och ger ärlig status. |
| A5 | Uppmätt miljö-/setup-/kritisk-väg-förenkling. | Oförändrad avsiktlig testidentitet, status och felrespons; flera jämförbara före/efterkörningar med synlig spridning. |
| A6b | Koppla bredare A4 till central körpolicy utan false-green. | Obligatoriskt failure/cancelled/missing/otillåten skip gör verklig aggregate röd. Okända/delade paths, dynamiska consumers, package/config och rename/delete ger bred fallback och inga orphan-tester. |
| A7 | Samlat avslut med oberoende review. | Bestånd/disposition, mutationer och återställt grönt, högriskskydd, faktiskt körda flöden, tidsjämförelse samt head/bas/check/deploymentbevis hör ihop. |

## Högriskskydd som består

- Pengar: durable admission, fresh access, debit/refund/retry och riktiga
  Postgresprov där `REQUIRE_POSTGRES_TESTS=1`.
- Auth/tenant/SSRF: cookieprecedens, dubbla cookies, guest-claim och negativa
  routes. Mappad IPv6, NAT64, Teredo, link-local, DNS-redirect och pinned
  transport är skilda felklasser, inte automatisk testdubblering.
- Migrationsledger: fil-/rollkontrakt och read-only-CI; checksum,
  pending-only och advisory-lock är separat skuld.
- Export/publish: downloadägare, env-redaction, binärdata, GitHub user-files,
  backup-CAS, atomic replace och rollback skyddar olika risker.
- Dossiers/scaffolds: faktisk paritet, force-pins, fallback, membership,
  addenda/UI och lokala scenario-/fixturekontrakt.
- Backoffice/curator/observability: SSRF, ZIP-bomb, publish, backup/CAS och
  redaction kvarstår.

## A4-harnessen

Owners: [scripts/e2e](../../../scripts/e2e/),
[Playwright-config](../../../playwright.project-persistence.config.ts) och
[persistensspec](../../../e2e/project-persistence.spec.ts).

Behåll digestpinnad disponibel Postgres, exakt container-ID/ägarlabel,
`network none`, inga publicerade portar/fallback, positiv env-allowlist och
ingen dotenv/livehemlighet. Nästa flöde använder ett disponibelt
oprivilegierat konto och riktig login; `TEST_USER_*` kan ge admin och duger
inte. Capture-grinden nekar privat/loopbacktrafik; preview-ready bevisar inte
capture/promotion.

## Körpolicy

Owners: [agent-workflow](../../../config/agent-workflow.json),
[path-impact](../../../scripts/workflow/path-impact.mjs),
[ci-scope](../../../scripts/workflow/ci-scope.mjs) och
[test-discovery](../../../scripts/workflow/test-discovery.mjs).

Behåll fyra fulla heavy/fallback-shards, blockerande stability exakt en gång,
scaffoldmaterialisering per relevant runner och riktade light-kontroller.
Ready-eventet behålls: samma head bevisar inte samma bas/merge-ref/profil.
Ingen ny manuell fillista eller extra verifieringsmotor.
