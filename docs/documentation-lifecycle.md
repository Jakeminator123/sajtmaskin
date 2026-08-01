# Dokumentationslivscykel

Den här filen är innehållspolicy för `docs/`. Projektregler i `.cursor/rules/`
ska länka hit, inte återberätta policyn.

## Canonical owner per faktatyp

Det finns ingen blind global ordning där all TypeScript-kod alltid står över
manifest, registries, schemas och policies. Identifiera i stället ägaren för
det konkreta beslutet:

1. canonical executable eller deklarativ owner,
2. runtime-konsument och validator,
3. genererad projektion,
4. handskriven mental modell,
5. historik, planer och arkiv.

Exempel: modellval och `qualityGateTiers` kan ägas av modellmanifestet;
env-klassificering av `config/env-policy.json`; runtime-Zod kan validera ett
manifest; strict schemas kan spegla runtime-typer; ett registry kan äga
tillgängliga identiteter.

Genererad Markdown är alltid projektion, aldrig en ny owner. Handskrivna docs
beskriver ansvar och stabil semantik. De ska inte kopiera implementation eller
bli en parallell runtime-owner.

## Ytor

| Område                              | Här hör                                                       | Hit hör inte                                       |
| ----------------------------------- | ------------------------------------------------------------- | -------------------------------------------------- |
| `docs/architecture/`                | Tunna systemöversikter, gränser, körflöde och kodkarta        | Inventarier, fil:rad-matriser och ändringshistorik |
| `docs/concepts/`                    | Pedagogiska mentala modeller och stabil terminologi           | Runtimefält, fulla enumlistor och callsites        |
| `docs/contracts/`                   | Kod- och schemanära policies och invariants                   | En andra arkitekturberättelse                      |
| `docs/generated/`                   | Deterministisk referens från registries, schemas och policies | Handskriven prosa och manuella korrigeringar       |
| `docs/schemas/`                     | Mänskliga schemaförklaringar och `strict/` JSON schemas       | Osäkra utkast                                      |
| `docs/runbooks/`, `docs/operating/` | Felsökning, drift och incidenter                              | Arkitekturindex och planarbete                     |
| `docs/plans/active/`                | Planer som styr arbete nu                                     | Färdiga planer                                     |
| `docs/plans/avklarat/`              | Avklarade beslut med fortsatt referensvärde                   | Aktiv status                                       |
| `docs/plans/archived/`              | Parkerade, ersatta eller skrotade planer                      | Runtime-vägledning                                 |

`docs/README.md` är dokumentationsroutern. Root `README.md`, `AGENTS.md` och
`.cursor/README.md` ska peka vidare, inte kopiera fulla inventarier.

## Genererade filer

Genererade referenser ska ha denna header och får inte redigeras manuellt:

```text
GENERATED FILE — DO NOT EDIT MANUALLY
Source: <canonical path>
Generator: <script path>
```

Generatorn får återge identiteter, enumvärden, relationer och policyfält. Den
ska inte kopiera implementationstext ur TypeScript. Generator och check ska
använda samma renderingsfunktion så att driftkontrollen är deterministisk.

När genererade referenser finns ska `docs/README.md` länka deras router.
`docs:check` ska upptäcka missing, stale och unexpected/orphan output; en fil
som generatorn slutat äga får inte ligga kvar och se canonical ut.

`docs:links` ska verifiera relativa fil- och kataloglänkar i aktiva Markdown-
ytor. Bara arkiverade och avklarade planer plus `_parkering/` ligger utanför den
blockerande mängden; de ska städas eller märkas i separata historik-PR:er. Nya
historikytor ska inte läggas till i undantaget — daterade revisioner och
ögonblicksstatus hör i git, inte i en egen docs-katalog.

## Terminologi

`docs/architecture/glossary.md` är den enda kanoniska glossary-ytan.
`config/naming-dictionary.json` är en valideringsseed och får inte bli ett
parallellt runtime-registry eller en andra ordlista. `check:terms:contract`
blockerar strukturell drift; `check:terms` rapporterar bredare legacyträffar
rådgivande eftersom kodidentifierare kan behöva behålla äldre namn.

## Planer och historik

| Status             | Plats                  | Regel                              |
| ------------------ | ---------------------- | ---------------------------------- |
| Aktiv              | `docs/plans/active/`   | Styr pågående arbete               |
| Avklarad           | `docs/plans/avklarat/` | Behåll bara fortsatt referensvärde |
| Arkiverad          | `docs/plans/archived/` | Inte aktuell arkitektur            |
| Icke-plan-historik | git                    | Ingen docs-yta; git är arkivet     |

Arkiverade dokument som ligger kvar ska ange:

```text
Status: Archived
Not current architecture
Do not use as runtime guidance
Replaced by: <canonical doc>
```

`npm run plans:history:check` blockerar statusar som `active`, `ready`, `scope`
och `in-progress` när filens plats redan säger arkiverad eller avklarad. Det
ersätter inte arkivheadern; kontrollen hindrar bara den mest vilseledande
statusdriften medan header-/deletion-long-tail städas separat.

Rena agentprompter, genomförda checklistor och ögonblicksstatus kan tas bort när
git-historiken ger tillräckligt bevis. Externa caller-risker och produktbeslut
ska dokumenteras i stället för att döljas som docs-cleanup.

## Stoppunkter för städning

Städning får inte smyga in ett produktbeslut. Dessa punkter gäller oavsett hur
gammal en fil eller yta ser ut:

1. Ingen route- eller featureradering utan bevis på att externa callers saknas.
2. Ingen sammanslagning av owners med olika semantik.
3. Ingen generator som gör runtime-koden mer indirekt.
4. Ingen docs-PR som samtidigt ändrar produktbeteende.

Att repot är publikt gör git-historik och callergranskning reproducerbara, men
ersätter inte produktionstrafik. En yta som är aktiv och kan ha externa eller
sällsynta callers kräver därför minst 30 dagars aggregerad
route-/featuretelemetri — request count, last seen, mätperiod och caller-risk —
plus ett produktägarbeslut KEEP / DEPRECATE / DELETE. Issue #538 äger det
underlaget; payloads, `.env`-filer, tokens och secrets hör varken i issuen eller
i docs. Ytorna som väntar på beslutet är `src/components/audit/`,
`src/app/api/figma/`, `src/app/api/wizard/`,
`src/app/api/integrations/marketplace/`, `src/app/api/integrations/mcp/` och
410-tombstonen `src/app/api/v0/projects/instructions`. De är KEEP tills beslutet
finns, aldrig DELETE.

## Ändringsregel

1. Ändra runtime-owner först när beteendet ändras.
2. Regenerera referensdocs när en strukturerad källa ändras.
3. Uppdatera en mental modell bara när den stabila modellen ändras.
4. Ersätt stale text i stället för att lägga till en parallell sanning.
5. Uppdatera router, länkar och planstatus i samma ändring.

Äldre borttaget arkitekturmaterial återfinns med `git log` och `git show`; skapa
inte en ny aktiv kopia för att bevara historik.
