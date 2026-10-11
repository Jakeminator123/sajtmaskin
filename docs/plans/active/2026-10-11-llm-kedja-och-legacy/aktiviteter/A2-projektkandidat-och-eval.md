# A2 — samma projektkandidat i produktion och eval

Utförare: 1. Beroende: A1:s relevanta kontrakt klart; nytt skrivpaket.
Status: se [körbordet](../00-master-plan.md).

## Ändring

Ägare idag: `gen/stream/finalize-version/{fast-path,preflight-phase,verifier-phase}.ts`,
`gen/stream/finalize-merge.ts` och `gen/eval/runner.ts`.

1. Extrahera gemensam projektberedning som kan användas utan DB, preview-boot
   eller credits. Återanvänd befintliga funktioner; bygg inte en alternativ finalize.
2. Låt den semantiska verifieraren se den avsedda kompletta kandidaten inklusive
   rätt basfiler och beroenden. Behåll tidig syntaxkontroll av trasig råoutput.
3. Reparation skapar ändrad kandidat/revision och ogiltigförklarar berörda bevis.
   Dra nytta av befintlig RepairGate/ledger; inför ingen extra fixer.
4. Låt eval använda samma rena beredning. Modell/embedding-förutsättningar kan
   fortsatt vara olika och ska beskrivas som det.
5. Ta bort endast de stale-findings-/dubbelmerge-vägar som den nya ordningen
   faktiskt gör onödiga. Skydd som fortfarande har en annan uppgift behålls.

## Klart och verifiering

Använd samma små representativa fixtures genom båda konsumenterna: init,
följdändring med befintliga filer, dossier och importerad bas. Assertera relevanta
filer/beroenden och skydd, inte gigantiska fullsträngssnapshots. Ett regressionstest
ska täcka fel som tidigare blev inaktuellt först efter merge. Kör berörda
finalize/eval-tester + typecheck. Ingen betald evalmatris som standard.

## Resultat

A2.0 readonly-recon klar på `b5b7474e…`. Dubblerad parse → språkdefault →
merge finns två gånger i preflight och separat i eval; eval monterar dessutom
projekt före preflightens montering. Fast-path verifierar före merge och
stale-filter kompenserar efteråt. A2.1 ska dela den rena parse/merge-delen via
befintlig `finalize-merge.ts` och flytta rena versionsmerge-primitiver från den
DB-importerande `version-manager.ts` till en smal `version-file-merge.ts` med
re-exports. DB-bunden import/env-upplösning, package-overlay, stale-filter,
tidig syntax, RepairLedger och verifieringsordning lämnas till A2.2. Ingen kod
ändrades eller testades under recon.
