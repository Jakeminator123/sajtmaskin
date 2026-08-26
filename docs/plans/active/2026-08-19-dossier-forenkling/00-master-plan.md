# Dossier-förenkling steg 2–5 — styrdokument

Status: Active — produktflödet är manuellt accepterat; D2–D4 är kvarvarande kvalitets-/arkitekturarbete, inte produktblockerare
Startad: 2026-08-19
Ägarbeslut: **ja** för D2–D4 (2026-08-19, körs som cloud-arbete). **Nej ännu** för D5.

Steg 1 är levererat i [#1045](https://github.com/Jakeminator123/sajtmaskin/pull/1045)
(`4478f31f4`): datat i de kopplade (hard) dossiererna lagades så att kraven mot
användaren motsvarar vad koden läser, och `summary` inte lovar mer än dossiern
levererar. Den PR-bodyn listar resten under «Utanför scope (medvetet)». Den listan
är **inte** granskad — en av posterna strider mot ett redan fattat beslut, se
[Vad som inte ska göras](#vad-som-inte-ska-göras).

## Produktacceptans 2026-08-22

Ägaren har manuellt provat det levererade Byggblock-/integrationsflödet och
rapporterat att det fungerar. Det innebär att UX-saneringen från #1023 och
datakorrigeringen från #1045 kan användas som produktbas nu.

D2–D4 ska därför inte beskrivas som en ofärdig produktfix. De är en strikt
sekventiell förbättring av hur konfiguration, providersteg och kuraterade
instruktioner representeras och når byggmodellen:

```text
D2: strukturera konfigurationsvärden kontra providersteg
→ D3: samla hard-dossierns promptbidrag i en representation
→ D4: låt alla hard-dossiers skicka sina viktigaste do/don't-regler
```

Housekeeping får uppdatera dokumentation och kontraktstester, men ska inte
smygimplementera D2–D4, ändra schemafält eller radera aktiv kompatibilitetslogik.

## Varför det spelar roll i runtime

Sju aktiva hard-dossiers kör `promptInstructionMode: "compact"`. I det läget är
manifestets `summary`, `envVars[].purpose`, `dependencies` och `exposes` **det
enda** som når byggmodellen — `instructions.md` läses inte. Ett manifest som
överdriver är därför en instruktionsbugg, inte slarvig text. Det är premissen
hela spåret vilar på.

| Dossier | `promptInstructionMode` |
|---|---|
| `postgres-drizzle`, `calcom-booking` | `selected-sections` |
| `supabase-auth` | `selected-sections` |
| `clerk-auth`, `mailchimp-newsletter`, `openai-chat`, `resend-contact-form`, `sanity-cms`, `stripe-checkout`, `vercel-analytics` | `compact` |

## Läget

| Id | Vad | Läge |
|---|---|---|
| D1 | Laga datat i kopplade dossiers | **Klar.** #1045 |
| [D2](aktiviteter/D2-configinputs-providersetup.md) | `configInputs` + `providerSetup` i schemat | Inte startad. Kvalitetssteg; klar för cloud |
| [D3](aktiviteter/D3-harddossierintegration.md) | Slå ihop promptblocken till `HardDossierIntegration` | Inte startad. **Beror på D2** |
| [D4](aktiviteter/D4-selected-sections-alla-hard.md) | `selected-sections` för alla aktiva hard | Inte startad. **Beror på D3**; läs 480-beslutet först |
| [D5](aktiviteter/D5-backoffice-fri-add-remove.md) | Fri add/remove i Backoffice | **Väntar ägarbeslut.** Bygg inte |
| — | Ta bort knappen «Bygg integrationer» | **Avgjord mot.** Se nedan |

## D2, D3 och D4 i korthet

### D2 — `configInputs` och `providerSetup`

D2 skiljer två saker som i dag huvudsakligen ligger i `envVars` och prosa:

- `configInputs`: värden användaren fyller i hos Sajtmaskin;
- `providerSetup`: korta, verifierbara handgrepp hos leverantören.

Fälten ska vara valfria. `envVars` fortsätter vara enda sanning för
`configured`, readiness och enforcement tills en uttrycklig migration beslutas.
D2 får inte skapa två konkurrerande konfigurationssanningar.

### D3 — `HardDossierIntegration`

D3 är en beteendebevarande refaktor av prompt-renderingen. Den samlar det en
Kopplad dossier bidrar med — provider, env, setup, mock, dependencies, exports,
filer och instruktioner — i en intern representation innan rendering.

Det är **inte** en ny LLM-agent, ny orkestreringsfas eller ny signal. Golden-/
snapshottester ska bevisa att prompten är oförändrad utöver D2-fälten och att
soft-dossiers är oförändrade.

### D4 — `selected-sections` för alla hard

D4 sätter alla aktiva hard-dossiers till `selected-sections` och säkerställer att
varje `instructions.md` har extraherbara H1-rubriker:

```text
When to use
How to integrate
Avoid
```

Därmed når de viktigaste gör/gör-inte-reglerna byggmodellen. Det befintliga
taket `SELECTED_SECTION_CHAR_CAP = 480` lämnas orört och gäller per rubrik så
att `Avoid` inte svälts ut.

## Vad som inte ska göras

Två fattade beslut i [`docs/decisions/README.md`](../../../decisions/README.md)
begränsar spåret. Bryt dem inte, och «förbättra» dem inte i förbifarten.

**Knappen «Bygg integrationer» behålls** (2026-08-17, efter /818-runda med tre
verifierade vinklar). Den är enda `F3_REBUILD`-lyssnaren och äger kostnad plus
gating; materialisering auto-startas inte. #1045:s «utanför scope»-lista nämner
borttagning ändå — listan skrevs utan att beslutet lästes. Ta inte bort knappen.

**`SELECTED_SECTION_CHAR_CAP = 480` är ett skydd, inte en defekt** (2026-08-19).
Taket gäller **per rubrik** och inte som delad pott, just för att en lång «When to
use»/«How to integrate» annars svälter ut «Avoid» — do-not-reglerna (Codex #254
P2). Att ta bort taket «så att mer text når modellen» återinför starvation.
Om 480 är rätt siffra är en öppen avvägning som hör i
[`BUG-SWARM-BACKLOG.md`](../../../../BUG-SWARM-BACKLOG.md), inte en uppgift här.
Notera att flera **soft**-dossiers också kör `selected-sections` och träffar
samma tak, så en ändring av siffran har bredare yta än de aktiva hard-dossiererna.

## Hur spåret körs

Vågschemat 20 aug är avklarat. Spåret kan löpa parallellt med andra öppna
spår eftersom det äger `capability-map.json` och `docs/generated/` ensamt —
men internt gäller:

**En agent i taget, sekventiellt.** Inte tre parallella.

D2 → D3 → D4 i den ordningen. D3 kan inte börja före D2, eftersom
`HardDossierIntegration` formas av de fält D2 inför. Och alla tre skriver om
`data/dossiers/_index/capability-map.json` plus `docs/generated/*.md`, så
parallella agenter hamnar garanterat i konflikt i de genererade projektionerna —
samma konflikt som löstes för hand i #1038 och #1052 den 19 augusti.

**En PR per aktivitet, base `master`.** Cloud-agenter baserar på remote-branchen,
så starta först när föregående PR är mergad. Agenten mergar inte själv och sätter
inte `merge:ready` förrän buggkollen är triagerad — merge ägs av merge-agenten
enligt [`pr-merge.mdc`](../../../../.cursor/rules/pr-merge.mdc).

## Verifiering per ändring

Alla ska vara gröna innan PR:

```powershell
npm run dossiers:validate-all
npm run dossiers:capability-map:write
npm run docs:generate
npm run docs:check
npm run docs:links
npm run typecheck
npx vitest run src/lib/gen/dossiers
```

Manifests och runtime-registret äger capability-datat; den genererade
Backoffice-/tooling-vyn färskhetskontrolleras blockerande i CI, så
`capability-map:write` + `docs:generate` är inte valfria när ett manifest ändras.

Kör tester i en worktree med länkad `node_modules` med
`--pool=threads --no-file-parallelism` — se
[`git-worktree.md`](../../../runbooks/git-worktree.md).

## Checklista

- [ ] D2 — `configInputs` + `providerSetup` i schemat, validator uppdaterad bara om kontraktet kräver det
- [ ] D3 — promptblocken slagna ihop till `HardDossierIntegration` (efter D2)
- [ ] D4 — de sju `compact`-dossiererna får `selected-sections`, 480-taket orört
- [ ] Ägarbeslut på D5 innan något byggs där
- [ ] När spåret är klart: väv in en rad i [`avklarat/README.md`](../../avklarat/README.md), radera detaljfilerna, uppdatera [`active/README.md`](../README.md)
