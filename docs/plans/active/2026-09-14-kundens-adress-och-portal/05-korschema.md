# 05 — Körschema

Körschemat styr implementationsordning. Det ratificerar inte nya produktförslag
i [masterplanen](00-master-plan.md).

## Genomförandestatus 2026-09-15

Etapp 1–2 är kodmässigt inne på `preview` för C1, C3e1, A2, B1, C2 och A3.
Aktivering är av. A1:s två testhosts, A4-pilot, D2/D3-livscykel och C3e2
återstår. Samlad tabell: [masterplanen](00-master-plan.md).

Kvarvarande körordning mot preview: #1385 (D2/D3 + C3e2, separat
produkt-PR) → A1 HTTPS-bevis → A4 pilot. #1380 stängs; den ska inte styra
mergeordning. Ingen promote i detta körschema.

## Etapper

| Etapp | Arbete | Vad som kan levereras |
|---|---|---|
| 0 | D3:s policy, A1:s DNS-underlag, enkel kostnadskalkyl | Klara val och förberedda driftsteg. Inget väntetvång på PSL eller partnerbrev. |
| 1 | C1 och A2; D1 levererades policyneutralt | Sajtvy, pilotgrind och datamodell. D1 ratificerar inte D3:s förslag. A2 och C1 serialiseras om båda rör `src/proxy.ts`. |
| 2 | A3 efter A2; C2 efter C1 och A3:s adresskontrakt; B1 efter C1 | Korrekt adress, domänkoppling och export. C2 och B1 integreras sekventiellt i sajtvyn. |
| 3 | D2 efter D1, därefter D3:s driftimplementation; C3 etapp 2 | Testbar abonnemangslivscykel och kontohantering. |
| 4 | A4:s begränsade pilot, därefter äldre sajter i små satser | Branded publicering och dokumenterad rollback. Full betalstart kräver D2/D3 klara. |

C3 etapp 1 (konto, credits, historik) kan göras direkt efter C1. A4:s frivilliga
adresspilot på egna testprojekt behöver inte invänta faktureringsarbetet.
Före en extern kundpilot bedöms tillämpliga konto-/ordervillkor enligt
masterplanen, även om kunden inte betalar. Ett DNS-problem blockerar
bara berörda adresssteg, inte portal, export eller testfakturering.

## Filägarskap och beroenden

| Yta | Berörda paket | Ordning |
|---|---|---|
| Deployroute och dess publiceringsgrind | A2, A3, D2, D3 | Integrera i följd; D2/D3 utgår från senaste A3 |
| `src/proxy.ts`, authkonsumenter | A2, C1, C3 | Kontrollera faktisk diff; dela inte filskrivning |
| Sajtvy `/projects/[id]` | C1, C2, B1 | C1 först; integration av C2 och B1 i följd |
| `src/lib/db/schema.ts`, migrationsordning | D1 och ev. A2:s pilotpersistens | En migrationsägare åt gången; räkna inte på förhand med disjunkta filer |
| Migration av branded adresser och URL-policy | A2, A4 | A2 inkluderar migreringsvägen; A4 använder samma policy |
| Stripewebhook och driftavstämning | D2, D3 | D2 före D3:s implementation |

Paket-ID:n är avgränsningar, inte ett krav på exakt en PR vardera. Dela större
paket så att kodgranskning och beroenden är begripliga. Ingen aktivitet får
antas konfliktfri enbart för att den har ett annat namn.

## Agenter och verifiering

Följ [PR-workflow](../../../../.agents/skills/pr-workflow/SKILL.md) och
[modellregeln](../../../../.cursor/rules/subagent-models.mdc). Modelltillgång
kontrolleras i den session som faktiskt utför arbetet; ingen gammal sessionslista
eller Grok-slug kopieras hit. Vid ChatGPT-arbete följs regeln om oberoende
GPT-5.6 Sol med `high` inför draft → ready.

Parallella agenter används när uppdrag och faktiskt disjunkta filer tillåter
det; högst tre samtidiga skrivande uppdrag i detta initiativ. Drift kan utföras
av behörig operatör eller agent med befintligt mandat. Det finns inget generellt
tekniskt krav på att Jakob själv skriver kommandona. Separata
implementationsuppdrag gäller `preview`, inte produktion, kundmeddelanden
eller dataradering.

Före push: `npm run verify:pr -- --plan --base origin/preview` och berörda
riktade kontroller. Runtime: typecheck och tester för ändrat beteende. A3/A4
kräver verklig HTTPS-kontroll; D2/D3 kräver Stripe-testläge och driftåterförsök.
Inga breda testsviter krävs bara för att denna dokumentationsplan skrivs.

Additiva DB-migrationer följer [db-env-parity](../../../../.cursor/rules/db-env-parity.mdc)
och [migrationsrunbooken](../../../runbooks/db-migrations.md). Preview använder
delad prod-databas: miljönamnet är inte en isoleringsgaranti.

## Klart och vidare

Kod, test och kundtext ska beskriva samma levererade funktion. Faktiska
produktionssteg och utfall hör i [adressrunbooken](../../../runbooks/branded-user-urls.md),
inte i en kopierad checklista. När ett paket är klart tas dess arbetsinstruktion
bort och bestående beslut/länkar flyttas enligt
[dokumentationslivscykeln](../../../documentation-lifecycle.md).
