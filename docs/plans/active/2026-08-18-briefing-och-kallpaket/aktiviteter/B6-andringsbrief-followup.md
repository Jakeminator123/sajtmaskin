# B6 — Ändringsbrief: mät först, sedan bevarande clear-refine bakom flagga

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)

Kräver ägarbeslut **N4**. N4 är inte «får vi bredda Ändringsbriefen till alla
redigerande uppföljningar?». Frågan är:

> Får vi mäta problemet och därefter prova en **bevarande** Ändringsbrief för
> `clear-refine` bakom feature flag?

Gällande beslut 2026-08-14 står kvar: **ingen delta-brief på varje follow-up**
([`docs/decisions/README.md`](../../../../decisions/README.md)). Det här är en
smalare experimentfråga, inte en omkörning.

**Förbjudet sätt att implementera:** bara byta
`followUpIntent === "clear-redesign"` mot en längre lista. Det ger
redesign-semantik på refine/capability och är den regression N4 ska förhindra.

## Verifierat nuläge

Skillnaden är **ny LLM-tolkning av ändringen** kontra **återanvänd tidigare
brief**. Inte «brief eller ingen brief».

| Uppföljningsläge | Aktiv brief | LLM? |
|---|---|---|
| `clear-redesign` | ny Deep Brief (`siteBriefSchema`) via `runClearRedesignDeltaBriefPhase`; vid fel den **avskalade** snapshot-reserven (capabilities, domain, titel, brand — utan stil) | ja, samma funktion som init (`tryGenerateServerAutoBrief`) |
| `clear-refine` | Snapshot-Brief (`buildFollowUpBriefFromSnapshot`) — rikare än redesign-reserven (stil, ton, quality, motion, CTA) | nej |
| `capability-add` / `capability-modify` | Snapshot-Brief + deterministisk dossier-signal (`requestedDossierCapabilities` / `capabilityModifyHint`) | nej |
| `neutral` | Snapshot-Brief + rå ändring | nej |
| `ambiguous-redesign` / `ambiguous-followup` | klargörande fråga först (`resolveFollowUpClarification`) | nej (rätt så) |

Källor:

- `src/lib/api/engine/chats/follow-up-orchestration-input.ts` —
  `resolveFollowUpActiveBrief` returnerar `parsedMeta.brief`, annars
  redesign-reserven, annars `buildFollowUpBriefFromSnapshot`. Defaulten är
  **inte** `null`.
- `src/lib/api/engine/chats/chat-message-stream/delta-brief-phase.ts` —
  hela LLM-fasen ligger bakom `if (followUpIntent === "clear-redesign" && hasFollowUpBase)`.
  `formatPriorDesignContext(summary, { intent: "clear-redesign" })` säger
  «prior site context for orientation only (clear-redesign may replace the
  visual style…)». Preserve-varianten av samma funktion finns redan (default
  när `intent` utelämnas) men anropas inte härifrån.
- `src/lib/builder/site-brief-generation.ts` — `siteBriefSchema` kräver sidor
  och sektioner, visuell riktning, färger, typsnitt, imagery, UI-komponenter,
  SEO och capabilities. Systemprompten: `Include every field in the schema.`
  Nuvarande delta-brief är alltså en **full sajtbrief**, inte en smal
  ändringsbrief.
- `src/lib/api/engine/chats/chat-message-stream/handler.ts` — lokal `metaBrief`
  startar som `null` och fylls bara av delta-fasen. Det är inte samma sak som
  `resolveFollowUpActiveBrief`. Kommentaren där är rätt: snapshot-briefen
  appliceras nedströms.
- Prepared-prompt-skip (`skipReason: "structured_prompt"`) finns; det finns
  **ingen** skip för «ren, kort textändring».
- Plan-läget kör redan `buildFollowUpOrchestrationInput` efter delta-fasen.
- `importedRepoMode` och `Scaffold: Av` filtreras **inte** i delta-fasen i dag.
  En `clear-redesign` på importerat repo får redan LLM-brief.

Tester som låser Snapshot-Brief för vanlig follow-up:
`src/lib/api/engine/chats/follow-up-contract.test.ts` (parity: snapshot-brief,
inte `null`) och `src/app/api/engine/chats/[chatId]/stream/route.test.ts`
(«keeps using the snapshot brief for a neutral follow-up»).

## Policy per läge

| Uppföljning | Rekommendation |
|---|---|
| `clear-redesign` | Behåll dagens LLM-brief och redesign-prior-context. |
| `clear-refine` | **Första experimentytan** — bara efter N4 + mätning. Bevarande prior context. Feature flag, default av. |
| `capability-add` | Behåll den deterministiska dossier-signalen. LLM bara om refine-experimentet var bra *och* ändringen är komplex. |
| `capability-modify` | Samma princip; undvik full sajtbrief för en liten funktionsändring. |
| `neutral` | Snapshot-Brief och rå ändring räcker. |
| `ambiguous-*` | Fortsätt fråga användaren. Ingen brief. |

## Uppgift

### Steg 1 — mät först (kräver inget beslut)

Använd B3:s källkvitto (och befintlig telemetri) och räkna **per
uppföljningsläge**:

- hur ofta Snapshot-Brief återanvänds kontra LLM-delta,
- hur ofta nästa tur är en korrigering av den förra,
- latens och kostnad för dagens `clear-redesign`-delta (~6 s enligt
  beslutet 2026-08-14 — mät aktuellt tal, kopiera det inte).

Utan det talet är ett experiment en gissning, och efteråt går det inte att
utvärdera. Steget får **inte** ändra runtime.

### Steg 2 — bevarande `clear-refine` bakom flagga (kräver OK på N4)

Bara om steg 1 visar att refine-turer ofta planeras om i kodgeneratorn.

- Ny opt-in-flagga i `config/env-policy.json` + `FEATURES`, default **av**.
  Samma mönster som `SAJTMASKIN_REFUSE_DOSSIER_STUBS`. Inför den **i
  implementerings-PR:n**, inte som declared-only yta i den här planen
  (ägarbeslut 2026-08-12).
- Kör LLM-delta **bara** för `clear-refine` när flaggan är på. Lämna
  `clear-redesign` orörd.
- Prior context: `formatPriorDesignContext(summary)` **utan**
  `{ intent: "clear-redesign" }`. Preserve-texten finns redan.
- Samma `brief_structured` / `tryGenerateServerAutoBrief`. Ingen ny workload.
  Första experimentet behåller `siteBriefSchema` — men det är en medveten
  risk, inte ett påstående att briefen är smal. Om utfallet återskapar stora
  delar av sajten: **stanna** och fråga ägaren om ett smalare schema. Bygg
  inte det i samma PR.
- Skip-villkor: behåll `structured_prompt`. Överväg hopp över korta rena
  textändringar; återanvänd `skipReason`, inför inget nytt fält i onödan.
- Misslyckat anrop faller öppet till Snapshot-Brief, precis som i dag.
- Dela ut en bevarande-gren ur `runClearRedesignDeltaBriefPhase` hellre än att
  döpa om och bredda. Rename av den redesign-specifika funktionen bara om
  anroparna fortfarande är få, i egen commit skild från beteendet.
- Telemetri ska kunna skilja `clear-redesign` från flaggad `clear-refine`
  (befintlig `comm.request.followup` / debugLog-skäl — inte en ny yta).

### Steg 3 — capability-* bara efter bra refine-utfall

Inte i samma PR som steg 2. `capability-add` / `capability-modify` har redan
dossier-signalen. En full sajtbrief för «lägg till inloggning» är fel verktyg.

### Steg 4 — låt kodgeneratorn bygga

När en Ändringsbrief *finns* (redesign i dag, ev. refine bakom flagga) ska
uppföljningsprompten presentera den som nivå 3 i auktoritetsordningen. Rör inte
kontraktet i övrigt.

## Vad som INTE ingår

- Ingen ny agentyta, chattyta, badge eller statusrad.
- Kör **inte** briefen på `ambiguous-*`.
- Bredda **inte** grinden till `neutral`, `capability-add` eller
  `capability-modify` i första experimentet.
- Återanvänd **inte** `{ intent: "clear-redesign" }` på refine.
- Slå inte på det för importerat repo-läge eller `Scaffold: Av` utan eget
  beslut. Dagens redesign-väg filtrerar dem inte — ändra inte det tyst.
- Rör inte credits-, frys- eller versionslogiken.
- Ingen omskrivning av användarens text. «Polish» hör till N3.

## Verifiering

- `npm run typecheck`
- `src/lib/api/engine/chats/follow-up-contract.test.ts`,
  `follow-up-orchestration-input.test.ts`,
  `src/lib/api/engine/chats/chat-message-stream/plan-mode-turn.test.ts`,
  `src/app/api/engine/chats/[chatId]/stream/route.test.ts`
- Nytt test: flagga av → `clear-refine` får Snapshot-Brief, ingen
  `tryGenerateServerAutoBrief`.
- Nytt test: flagga på → `clear-refine` får LLM-brief vars prior context
  **inte** innehåller «may replace the visual style»; `clear-redesign` gör
  det fortfarande.
- Nytt test: `capability-add` / `neutral` / `ambiguous-followup` anropar inte
  delta-LLM.
- Nytt test: misslyckat brief-anrop ger Snapshot-Brief — ingen krasch, ingen
  tom brief som räknas som träff.
- Steg 1-talen skrivs in i den här filen före steg 2 mergas.
- Samma PR måste uppdatera `docs/schemas/llm-role-matrix.md` och
  `docs/schemas/orchestration-signal-contract.md` så de skiljer redesign-delta
  från ev. flaggad refine-delta. Glossaryn äger orden Deep Brief /
  Snapshot-Brief.

## Klart när

Steg 1 har tal per läge. `clear-redesign` är oförändrad. Ett ev. refine-steg
ligger bakom flagga, default av, med bevarande prior context — och har inte
nått dit genom att bara bredda if-villkoret. `capability-*`, `neutral` och
`ambiguous-*` är orörda tills ägaren säger annat.
