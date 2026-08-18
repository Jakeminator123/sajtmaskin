# B8 — Brief-paritet mellan website och app

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)

Status: **implementerad** (samma PR som det här dokumentet).
Kräver beslut: nej — ägarbeslut 2026-08-18 i chatt.
Ordning: körs **före** [B7](B7-variantens-auktoritetsordning.md). De löser olika
saker och ska inte blandas i samma diff.

## Problemet

Appar och hemsidor fick olika mycket underlag för samma sorts fritextprompt.
Appar blev ofta bra; korta hemsidor blev tunna. Skillnaden var inte
byggmodellen — det var vad den fick se.

| Nytt bygge | Väg före B8 |
|---|---|
| App | Snabbspåret avvisade alltid `buildIntent: "app"` → Auto Brief → scaffold-embeddings → UI Recipes → dossiers → byggmodell |
| Kort hemsida (≤ 420 tecken) | Snabbspåret godkände → **ingen** brief, **inga** scaffold-embeddings, **inga** UI Recipes, **ingen** dossier-selektion → byggmodell |
| Template ur katalogen | Verbatim-import, ingen vanlig init — orörd av B8 |

Gränsen var 420 **tecken**, inte ord
(`MAX_SIMPLE_PROMPT_CHARS`, borttagen `simple-website-path.ts:38`).

Snabbspåret hade exakt fyra runtime-effekter, alla avstängningar:

| # | Plats före B8 | Vad som stängdes av |
|---|---|---|
| 1 | `create-chat-stream-post.ts:353-354` | Server Auto-Brief |
| 2 | `create-chat-stream-post.ts:920` | `embeddingScaffoldMatch: false` → keyword-only scaffoldval |
| 3 | `orchestrate/resolve-base.ts:225-231` | UI Recipes (`uiRecipes = []`) |
| 4 | `orchestrate/resolve-base.ts:682` | Hela dossier-pipelinen |

Konsekvensen var självförstärkande: ingen brief → inga `requestedCapabilities`
→ inget dossier-underlag → tunnare prompt → tunnare sajt. Och eftersom
`briefSummary` aldrig persisterades, saknade även **följande** rundor på samma
chatt sitt brief-golv.

## Vad som gjordes

Snabbspåret är borttaget, inte flaggat av. Ett fritextbygge får samma
berikning oavsett promptlängd och oavsett `buildIntent`.

| Fil | Ändring |
|---|---|
| `src/lib/api/engine/chats/simple-website-path.ts` | **Raderad** (klassificeraren, 420-taket, scaffold-allowlisten, alla 16 `reason`-koder) |
| `src/lib/api/engine/chats/simple-website-path.test.ts` | **Raderad** med sitt SUT |
| `create-chat-stream-post.ts` | Klassificeringsanropet, devLog-eventet `orchestration.simple_website_path` och de två avstängningsfälten borta |
| `orchestrate/types.ts` | `OrchestrationInput.simpleWebsitePath` borta |
| `orchestrate/resolve-base.ts` | UI Recipes resolveras alltid; dossier-grinden är åter enbart `FEATURES.useDossierPipeline` |
| `orchestrate-simple-website-path.test.ts` | Omdöpt till `orchestrate-scaffold-intent-clamp.test.ts` — testerna handlade hela tiden om scaffold-/intent-klampning och satte flaggan bara för att slippa IO |
| `followup-freeze.stability.test.ts` | Mockar `resolveShadcnUiRecipes` i stället för att stänga IO via flaggan |
| `stream/route.test.ts` | Assertar att init aldrig sätter `embeddingScaffoldMatch: false` |
| `website-app-brief-parity.test.ts` | **Ny** — låser invarianten |

`embeddingScaffoldMatch` finns kvar som knopp: eval-riggen och enhetstester
stänger fortfarande av embeddings avsiktligt. Det som togs bort är att
*produktionsvägen* stängde av dem.

## Vad B8 INTE ändrar

- **Verbatim-import.** `POST /api/template` importerar ZIP/GitHub-repo och
  markerar versionen `imported_repo`. Den vägen har aldrig gått genom
  snabbspåret och rörs inte. `importedRepoMode` stänger fortfarande av
  scaffold, variant och mall-inspiration.
- **Plan-läget.** Klassificeraren returnerade alltid `plan_mode` där.
- **Follow-ups.** Flaggan sattes aldrig på follow-up-vägen.
- **Variantens auktoritetsordning.** Det är B7. Förmatchningspinnen är
  oförändrad här — medvetet, så kvalitetsförändringen från B8 går att mäta
  isolerat.
- **Dossier-selektionens determinism.** Oförändrad: capability → default per
  capability, inga embeddings.

## Risker och rollback

| Risk | Bedömning | Åtgärd |
|---|---|---|
| **Latens per ny hemsida** | Störst posten. Auto Brief är ett `generateObject`-anrop; därtill en scaffold-embedding och en shadcn-HTTP-hämtning som korta hemsidor slapp | Mät `briefQuality` + `durationMs` i prod före/efter |
| **Kostnad** | Ett brief-anrop till per kort hemsida, loggat som `brief_structured` i `llm_usage` → debiteras | Följ `/admin/genereringar` |
| **Fler dossiers än önskat** | Korta prompter kan nu dra in capabilities som snabbspåret dolde | F2-muten gäller fortfarande: hard-integrationer skjuts upp, inte byggs |
| **shadcn-fel blir synligare** | Resolvern anropas oftare | `.catch(() => [])` är oförändrad; B5 äger mätningen |

**Rollback utan kodändring** — ingen ny flagga infördes:

| Spak | Effekt |
|---|---|
| `SAJTMASKIN_DISABLE_SERVER_AUTO_BRIEF=1` | Stänger Auto Brief (dokumenterad i `docs/ENV.md` som del av B8) |
| `SAJTMASKIN_DOSSIER_PIPELINE=false` | Stänger dossier-selektionen |
| `SAJTMASKIN_SCAFFOLD_KEYWORD_MATCH=off` | Rör scaffold-matchningens keyword-lager |

Att återinföra en teckengräns är **inte** rollback-vägen. Gränsen var
godtycklig och skar mitt i den population B8 finns för.

## Verifiering

- `npm run typecheck` — grön (två förbefintliga fel om `postprocessing` beror på
  en lokal `node_modules` som släpar efter `package.json`, inte på B8).
- `npx vitest run src/lib/gen/website-app-brief-parity.test.ts src/lib/gen/orchestrate-scaffold-intent-clamp.test.ts` — 16 gröna.
- `npx vitest run -c vitest.stability.config.ts src/lib/gen/followup-freeze.stability.test.ts` — 31 gröna.
- `npx vitest run src/app/api/engine/chats/stream/route.test.ts src/lib/gen/orchestrate-*.test.ts src/lib/gen/orchestrate/generation-package.test.ts` — 33 gröna.

## Klart när

Mätning i prod visar hur kvalitet, latens och kostnad rörde sig för korta
hemsideprompter. **Först därefter** är det meningsfullt att diskutera en mindre
Snabbrief som kostnadsoptimering — att bygga en svagare modell innan den
fungerande vägen är mätt är fel ordning.
