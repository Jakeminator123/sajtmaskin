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

A2.1/A2.2 lokalt klara och granskade utan kvarvarande fynd. Preflight,
partial-repair och eval delar `prepareGeneratedProjectCandidate`; rena
mergefunktioner ligger i `version-file-merge.ts` med kompatibla re-exports.
Komplett preflight-kandidat verifieras och reparerade kandidater bereds igen
före bekräftelse. Samma kandidat går till persist. Original modell-emission
skiljs från monterade filer; redigerad env-vy ersätter aldrig lagrade env-bytes.
Eval använder `sources.canonicalRuntimeFiles`. Extra eval-montering,
package-overlay och fast-paths efter-merge-stale-block är raderade, medan
manifestkontroll/importbekräftelse behåller sina egna skydd. A2.2 produktkod
netto −73 rader mot snapshot `1c12697d…`.

Node 22.23.1: A2.1 184 tester; A2.2 339 tester i åtta filer PASS (331 oförändrade
resultat återanvända, åtta slutligt omkörda). Typecheck, diff-check,
verifieringsplan och canvas-kontroll PASS. Slutreview band 14 stabila scopehashar
och stängde env-/skip-regressionerna. Provider, DB och genererad syntaxkontroll
mockas i kandidatfixturen. Ingen live-runtime, betald eval eller mätt
kostnads-/latensvinst påstås.
