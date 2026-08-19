# Dossier-förenkling steg 2–5 — styrdokument

Status: Active
Startad: 2026-08-19
Ägarbeslut: **ja** för D2–D4 (2026-08-19, körs som cloud-arbete). **Nej ännu** för D5.

Steg 1 är levererat i [#1045](https://github.com/Jakeminator123/sajtmaskin/pull/1045)
(`4478f31f4`): datat i de kopplade (hard) dossiererna lagades så att kraven mot
användaren motsvarar vad koden läser, och `summary` inte lovar mer än dossiern
levererar. Den PR-bodyn listar resten under «Utanför scope (medvetet)». Den listan
är **inte** granskad — en av posterna strider mot ett redan fattat beslut, se
[Vad som inte ska göras](#vad-som-inte-ska-göras).

## Varför det spelar roll i runtime

Sju av nio hard-dossiers kör `promptInstructionMode: "compact"`. I det läget är
manifestets `summary`, `envVars[].purpose`, `dependencies` och `exposes` **det
enda** som når byggmodellen — `instructions.md` läses inte. Ett manifest som
överdriver är därför en instruktionsbugg, inte slarvig text. Det är premissen
hela spåret vilar på.

| Dossier | `promptInstructionMode` |
|---|---|
| `postgres-drizzle` | `selected-sections` |
| `supabase-auth` | `selected-sections` |
| `clerk-auth`, `mailchimp-newsletter`, `openai-chat`, `resend-contact-form`, `sanity-cms`, `stripe-checkout`, `vercel-analytics` | `compact` |

## Läget

| Id | Vad | Läge |
|---|---|---|
| D1 | Laga datat i kopplade dossiers | **Klar.** #1045 |
| [D2](aktiviteter/D2-configinputs-providersetup.md) | `configInputs` + `providerSetup` i schemat | Inte startad. Klar för cloud |
| [D3](aktiviteter/D3-harddossierintegration.md) | Slå ihop promptblocken till `HardDossierIntegration` | Inte startad. **Beror på D2** |
| [D4](aktiviteter/D4-selected-sections-alla-hard.md) | `selected-sections` för alla nio hard | Inte startad. Läs 480-beslutet först |
| [D5](aktiviteter/D5-backoffice-fri-add-remove.md) | Fri add/remove i Backoffice | **Väntar ägarbeslut.** Bygg inte |
| — | Ta bort knappen «Bygg integrationer» | **Avgjord mot.** Se nedan |

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
samma tak, så en ändring av siffran har bredare yta än de nio hard.

## Hur spåret körs

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
