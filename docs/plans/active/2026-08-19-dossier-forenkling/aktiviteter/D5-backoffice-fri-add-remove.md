# D5 — fri add/remove av dossiers i Backoffice

Status: **väntar ägarbeslut.** Bygg inte förrän ägaren sagt ja i chatten.
Beror på: [D2](D2-configinputs-providersetup.md) om beslutet blir ja.

## Varför den ligger stilla

Två skäl, och båda är avsiktliga.

**Det är ny produktförmåga.** `mvp-scope-freeze.mdc` säger att en agent ska pausa
och varna innan ny produktyta byggs, och vänta på uttryckligt ja. Att kunna lägga
till och ta bort dossiers fritt i Backoffice är inte en härdning av ett befintligt
kontrakt — det är en ny administrativ förmåga, med en raderingsväg som inte finns
i dag.

**Radering är den farliga halvan.** Ett fattat beslut från 2026-07-28
([`docs/decisions/README.md`](../../../../decisions/README.md)) slår fast att det
**inte** finns automatisk radering när en dossier tar över en capability som en
LLM-byggd yta redan täcker — prompt-prevention och Advisory är slutläget, eftersom
en felaktig deklaration annars raderar användarfiler. Det beslutet handlar om
capability-övertagande, inte om Backoffice-CRUD, men det etablerar hållningen:
raderingsvägar i dossier-lagret kräver ett uttalat beslut, inte en bekväm knapp.

## Om beslutet blir ja — vad som måste avgöras först

Skriv inte kod förrän dessa har svar, annars byggs gissningar in i en admin-yta:

1. **Vad betyder «remove»?** Ta bort manifestet från repot, eller markera dossiern
 som inte valbar? Det första är en git-ändring från en Streamlit-yta, det andra är
 ett fält. De har helt olika riskprofil.
2. **Vad händer med projekt som redan valt dossiern?** Befintliga `engine_versions`
 och sparade projektEnvVars refererar den. En borttagning som gör lagrad data
 otolkbar är dataförlust enligt `project-phase-priorities.mdc`.
3. **Vem får göra det?** Backoffice är admin-yta, men «admin» och «får ändra
 runtime-kontrakt» är inte samma sak.
4. **Hur valideras ett tillagt manifest?** `npm run dossiers:validate-all` är ett
 CLI-steg. En add-väg som skriver ett manifest utan att köra validatorn kan lämna
 registret i ett läge CI sedan avvisar.

## Praktisk varning för cloud

Backoffice är Python. Enligt
[`cursor-cloud-agent.md`](../../../../runbooks/cursor-cloud-agent.md) ingår Python
**inte** i pod-baslinjen — vissa podar saknar `pip`/`venv`, och då kan agenten
varken köra `npm run backoffice:test` eller `npm run lint:py`. En cloud-agent kan
alltså inte verifiera sitt eget arbete på den här ytan utan att först installera
Python-deps. Kör D5 lokalt, eller räkna med det extra steget.

## Klart när

Ingenting är klart här förrän ägaren beslutat. Blir svaret nej: flytta raden till
`BUG-SWARM-BACKLOG.md` under `Väntar på ägarbeslut` med beslutsägare och deadline,
och radera den här filen — ett beslut utan ägare blir en permanent pseudobugg.
