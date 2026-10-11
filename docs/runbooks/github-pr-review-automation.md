# Buggpass före push

**Buggpass** (Bugbots-pass) är en oberoende granskningsprocedur. Cursor Bugbot,
Codex eller en annan lämplig granskare kan utföra den. Författaragenten startar
granskningen och hanterar resultatet; hooken kontrollerar bara att ett aktuellt
resultat finns. Ingen WSL-installation, versionslåst CLI eller extra API-nyckel
krävs av repots verktyg. Granskarens vanliga modellkvot gäller; besparing är inte mätt.

## Direktpreview: hela arbetsflödet

1. Hämta preview, frys dess fulla SHA och kör relevanta riktade kontroller enligt
   [PR-workflow](../../.agents/skills/pr-workflow/SKILL.md). Commit:a uppgiftens
   exakta paths. Granskning gäller rena, committade ändringar.
2. Kör `npm run bugpass -- --base <preview-SHA>`. Detta skapar **ett uppdrag**,
   prompt och JSON-schema, inte en godkänd review. Sökvägarna skrivs i terminalen.
3. Författaragenten startar en separat readonly-granskare med ny kontext i sin
   befintliga review-/subagentfunktion. Ge endast uppdraget, relevant kod och
   tidigare fynd/beslut från prompten; skicka inte föräldrachattens historik.
   Granskaren granskar alla ändrade filer och relevanta callers/tester mot
   exakta SHA:n och returnerar JSON enligt schemat.
4. Spara det faktiska svaret i en lokal, ignorerad JSON-fil och importera:

   ```text
   npm run bugpass -- --base <preview-SHA> --import <result.json> --reviewer <metadata.json>
   ```

   Metadata beskriver den verkliga granskaren, exempel:

   ```json
   { "provider": "Codex", "reference": "actual-review-chat-or-run-id", "model": "actual-model", "reasoning": "actual-effort", "independent": true }
   ```

   Fyll aldrig i ett eget tomt resultat eller påhittad referens. Ofullständiga
   resultat, fel uppdrags-id, ändrad HEAD/bas/kontrakt eller saknad metadata
   godtas inte. Import är inte en modellkörning. Det är författarens ansvar att
   metadata och råresultat motsvarar den verkliga oberoende granskningen.
5. Triagera enligt nedan. Efter fix: kör riktat, commit:a, kör samma
   `bugpass -- --base` igen. Föregående review och beslut länkas automatiskt;
   inget manuellt `--previous` behövs. Ett oförändrat resultat återanvänds.
6. `npm run preview:prepare` kräver godtagbar review/triage och kör den befintliga
   path-impactmotorn i **planläge** en gång. Den kör inga tester/modeller och
   påstår inte att tester är gjorda. Redovisa faktiskt körda kontroller separat.
7. `npm run preview:push -- --dry-run` kontrollerar aktuell fjärrbas, head,
   review/triage och plankvitto utan push. Fråga sedan Jakob **Är du säker på
   att du vill pusha?**, med exakt full SHA. Efter hans svar:

   ```text
   npm run preview:push -- --confirm <human-approved-full-SHA>
   ```

8. Wrappern och den lätta pre-push-hooken återkontrollerar samma kvitto. Ingen
   AI, tung testsvit eller nätverksprobe startas i hooken. En ren preview-push
   upprepar inte planen. Blandad push behåller befintlig plan för övriga refs.
   Saknad/inaktuell review, ohanterade fynd, ändrade beslut, rå preview-push,
   force eller delete stoppar även med CI-/skipflaggor.
9. Följ GitHub-CI och Vercel READY efter push. Inget nytt obligatoriskt modellpass
   startas för samma kod/bas. Misslyckad kvittoskrivning efter lyckad push betyder
   publicerad kod: kontrollera remote, pusha inte samma commit igen.

Granskaren använder värdens befintliga begränsade verktyg och godkännanden;
en readonly-prompt eller hook skapar inte en OS-sandbox. Granskaren får inte
ändra filer, köra repokod, läsa secrets eller publicera. Saknas en fungerande
granskningsväg används PR-vägen med oberoende review; inga behörigheter sänks.

## Fynd och uppföljning

Varje fynd har id, plats, kort scenario, `confidencePercent` (subjektiv säkerhet,
inte testtäckning) och `impactScore` 1–5: lokal småsak, begränsat besvär, trasigt
kärnflöde, bred säkerhets-/datarisk, kritiskt intrång/dataförlust/driftstopp.
Poängen ersätter inte CI. Smak och hypotetiska nits är inte blockers.

```text
npm run bugpass -- --base <base> --triage <head> F1 accept "Reproducerat med test X; behöver rättas."
npm run bugpass -- --base <base> --triage <head> F1 reject "Test X visar att scenariot inte kan inträffa."
npm run bugpass -- --base <base> --triage <head> F1 defer "Begränsad konsekvens, separat uppföljning beslutad." "issue/backlog-reference"
```

`accept` betyder needs-fix. Det finns ingen knapp som markerar buggen fixad:
en ny commit måste granskas. `reject` kräver belägg; `defer` tillåts endast för
P2/impact ≤2 med spårbar uppföljning. Alla fynd måste vara hanterade före push.

Uppföljningen granskar delta och integration och bär kvarvarande fynd vidare.
Ändrat granskningskontrakt (inklusive repo-/granskningsregler) kräver full diff igen. Högst tre länkade rundor;
därefter ägarbeslut, inte en tyst nollställning. Ändrad triage i en äldre runda
ogiltigförklarar beroende kvitton. Ett nytt uppdrag på aktuell head granskar då
hela diffen med samtliga tidigare fynd och aktuella beslut, utan att äldre commits
behöver checkas ut. Kedjan och gränsen på tre rundor behålls; ersatta resultat på
samma head bevaras som `supersededReview`.

Lokala underlag finns i `node_modules/.cache/sajtmaskin-bugpass/`; plan och
publiceringskvitton i `node_modules/.cache/sajtmaskin-preview/`. De är lokala
arbetsflödesskydd, inte signerade attesteringar. En annan dator behöver importera
verifierbart granskningsunderlag eller köra ett nytt pass. Låsfil per review-bas
stoppar samtidiga skrivningar; ta bara bort ett övergivet lås efter processkontroll.

## GitHub och PR-vägen

Direktpreview använder endast Jakobs befintliga adminundantag efter mänsklig
SHA-bekräftelse (ägarbeslut 2026-10-08). Kontrollera aktuell behörighet före push.
Ändra inte rulesets eller använd force/delete. `--admin`-merge ingår inte.
Master kräver fortsatt promote-PR, native checks och extra produktionsbekräftelse.
Lokala hooks ersätter inte GitHubs skydd och kan saknas i andra klienter.

Arbetsgrenar kan pushas för PR-review. Återanvänd en fungerande oberoende PR-review
för aktuell kod/bas; starta inte ett parallellt obligatoriskt Codex/API-pass.
Saknad, neutral eller skippad review är inte godkänd. Författaren följer upp fynd
och CI enligt [merge-regeln](../../.cursor/rules/pr-merge.mdc).

Det finns ingen ny automatisk moln-webhook. Befintlig agent behöver starta reviewn;
Git-hooken kan bara stoppa med instruktion om vad som saknas. Cursor-kontoautomationer
och abonnemang styrs utanför repot; att ta bort repoåtkomst säger inget om debitering.

Den tidigare API-workflowen `pr-ai-review.yml` är borttagen och dess runner
ovillkorligt spärrad. `workflow:contract` avvisar återinkoppling. Äldre moduler i
`scripts/pr-review/` bevarar historisk datakompatibilitet; de är ingen aktiv andra
granskare. Gamla GitHub-reviewer/state-kommentarer raderas inte som städning.
Den lokala CLI-/sandbox-proben och WSL-adaptern är ersatta av uppdrag/import;
gamla v2-reviewkvitton och v3-plankvitton kan inte godkänna det nya flödet.
