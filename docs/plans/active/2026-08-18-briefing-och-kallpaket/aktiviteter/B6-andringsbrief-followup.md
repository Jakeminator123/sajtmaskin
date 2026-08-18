# B6 — Ändringsbrief: låt uppföljningar byggas, inte planeras om

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)

Kräver ägarbeslut **N4**. Men frågan är omformulerad efter kodkoll: det är
**inte** ett nytt LLM-steg som ska byggas. Steget finns redan — det är grinden
framför det som är för smal. N4 handlar därför om kostnad och latens per
uppföljning, inte om en ny produktyta.

## Verifierat nuläge

Ändringsbriefen körs redan, men bara för ett av sju uppföljningslägen.

| Uppföljningsläge | Får strukturerad brief? | Vad kodgeneratorn får i stället |
|---|---|---|
| `clear-redesign` | **ja** — LLM-genererad Ändringsbrief | brief + snapshot-kontext |
| `clear-refine` | nej | bara follow-up-contract + snapshot |
| `capability-add` / `capability-modify` | nej | dito, plus dossier-signal |
| `neutral` | nej | dito |
| `ambiguous-redesign` / `ambiguous-followup` | nej (rätt så) | klargörande fråga först |

Källor:

- `src/lib/api/engine/chats/chat-message-stream/delta-brief-phase.ts` — hela
  fasen ligger bakom `if (followUpIntent === "clear-redesign" && hasFollowUpBase)`.
  Den anropar `tryGenerateServerAutoBrief` (**samma** workload som init:
  `brief_structured`), matar in `variantHints` + `priorDesignContext` och skriver
  tillbaka resultatet till `parsedMeta.brief`.
- `src/lib/api/engine/chats/follow-up-orchestration-input.ts:130-135` —
  `resolveFollowUpActiveBrief` returnerar `null` när `parsedMeta.brief` saknas och
  läget inte är `clear-redesign`. Ingen tyst reservbrief för de andra lägena.
- Samma fil `:103-123` — `clear-redesign` har dessutom en snapshot-baserad
  reservbrief när LLM-anropet misslyckas. De andra lägena har ingen.
- `delta-brief-phase.ts` (prepared-prompt fast lane) — LLM-anropet hoppas över när
  prompten redan **bär** briefstruktur (`isOpenClawPreparedPromptStructured`), och
  skippet loggas med skäl. Det är precedensen för «hoppa över när strukturen redan
  finns» — bygg inte en ny variant av den.
- `src/lib/api/engine/chats/chat-message-stream/plan-mode-turn.ts` — plan-läget kör
  redan `buildFollowUpOrchestrationInput`, alltså finns planerarrollen
  (`plan_mode_planner`) redan för uppföljningar.

Nettoläget: infrastrukturen är byggd. Det som saknas är grindens bredd, ett
kostnadsbeslut, och ett tal som visar om breddningen hjälper.

## Uppgift

### Steg 1 — mät först (kräver inget beslut)

Använd B3:s källkvitto och räkna, per uppföljningsläge: hur många turer som körs
utan brief, och hur ofta samma sak begärs två turer i rad (korrigerande
uppföljning). Utan det talet är breddningen en gissning, och efteråt går den inte
att utvärdera.

### Steg 2 — bredda grinden (kräver OK på N4)

- Låt fasen täcka `clear-refine`, `capability-add` och `capability-modify` utöver
  `clear-redesign`. Ändra villkoret, inte strukturen.
- Briefen ska vara **smal**: beskriv ändringen relativt snapshot, återskapa inte
  hela sajtbriefen. `priorDesignContext` finns redan för exakt det.
- Skip-villkor krävs, annars betalar varje trivial uppföljning ett LLM-anrop:
  hoppa över när prompten redan bär struktur (befintlig check) eller är en ren,
  kort textändring. Återanvänd `skipReason`-telemetrin — inför inget nytt fält.
- Misslyckat anrop ska **falla öppet** till dagens väg, precis som i dag.
- Registrera ingen ny workload om `brief_structured` räcker. Behövs egen
  modellrutt: lägg den under `briefing`-nyckeln som B2 etablerar i
  `config/ai_models/manifest.json`, inte som ny toppnyckel.
- Funktionsnamnet `runClearRedesignDeltaBriefPhase` blir missvisande. Byt bara om
  anroparna är 3 eller färre, och gör det i en egen commit skild från
  beteendeändringen.

### Steg 3 — låt kodgeneratorn bygga

När en Ändringsbrief finns ska uppföljningsprompten presentera den som nivå 3 i
auktoritetsordningen (strukturerad tolkning av avsikten) i stället för att låta
modellen resonera fram planen själv i samma pass. Rör inte kontraktet i övrigt.

## Vad som INTE ingår

- Ingen ny agentyta, ingen ny chattyta, ingen ny badge eller statusrad.
- Kör **inte** briefen på `ambiguous-*`. De ska fortsätta ställa den klargörande
  frågan (`src/lib/providers/own-engine/follow-up-clarification.ts`) — en brief
  ovanpå en oklar prompt gissar bara snyggare.
- Slå inte på det för importerat repo-läge eller `Scaffold: Av` utan eget beslut.
- Rör inte credits-, frys- eller versionslogiken i uppföljningsturen.
- Ingen omskrivning av användarens text. «Polish» hör till N3 (Refine, efter
  generering) och inte hit.

## Verifiering

- `npm run typecheck`
- `src/lib/api/engine/chats/follow-up-contract.test.ts`,
  `follow-up-orchestration-input.test.ts`,
  `src/lib/api/engine/chats/chat-message-stream/plan-mode-turn.test.ts`,
  `src/app/api/engine/chats/[chatId]/stream/route.test.ts`
- Nytt test: en `clear-refine`-uppföljning får en brief som skrivs tillbaka till
  `parsedMeta.brief`; en `ambiguous-followup` får ingen.
- Nytt test: misslyckat brief-anrop ger dagens väg — ingen krasch, ingen tom brief
  som råkar räknas som träff.
- Latens före/efter på en riktig uppföljning; skriv in talen här i filen.
- Samma PR måste uppdatera `docs/schemas/llm-role-matrix.md` och
  `docs/schemas/orchestration-signal-contract.md` — de äger vilka LLM-roller som
  finns och för vilka lägen de körs.

## Klart när

Alla **redigerande** uppföljningslägen får samma strukturerade avsiktstolkning som
en ny sajt får, mätningen från steg 1 visar om andelen korrigerande uppföljningar
gick ner, och ingen ny yta eller ny workload behövdes för att nå dit.