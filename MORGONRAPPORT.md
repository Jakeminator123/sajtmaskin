# Morgonrapport — 2026-04-18 kvällsleverans

> **Hej!** Det här är en kort summering av vad jag fixade ikväll, vad du bör testa i morgon, och vad som *inte* ingick (och varför).
>
> **Status:** Allt committat, testerna gröna (utom 1 pre-existerande), typecheck ren, pushat till `master`.

---

## Vad jag faktiskt fixade

Två områden: **environment variables / F2 vs F3-gating** och **Fly.io VM-hygien**. Tre ENV-fixar + två VM-fixar.

### ENV-fixar (det du var orolig för)

#### ENV-1: F3-previews strippar nu tier3-stub-placeholders korrekt
**Vad var fel:** När en F3-preview ("Bygg integrationer") byggdes glömdes parametern `lifecycleStage` på vägen från chat-streamen till `buildPreviewEnvLocalContents`. Resultatet: tier3-stub-värdena (`STRIPE_SECRET_KEY=sk_test_PLACEHOLDER` osv) hängde kvar i F3-previews också ⇒ Stripe-anrop "fungerade tyst" tills första riktiga API-call. Hela poängen med `validateTier3Readiness`-gatet i `/finalize-design` var pulveriserad.

**Vad jag gjorde:**
- Lade till `lifecycleStage?: PreviewLifecycleStage` i `StartPreviewSessionOptions`.
- Trådade igenom från `chat-message-stream-post.ts` (via `generation-stream-post-finalize.ts`) och från `/preview-session`-routen (läser `versionRow.lifecycle_stage`).
- F2 fortsätter använda stub-värden (för att appen ska boota); F3 strippar dem ⇒ saknade riktiga nycklar krashar tydligt.

**Filer:** `preview-session.ts`, `generation-stream-post-finalize.ts`, `preview-session/route.ts`.

#### ENV-2: F2-init kan inte längre poppa upp env-var-frågor i chatten
**Vad var fel:** I `create-chat-stream-post.ts` var `includeIntegrationSignals: true` hårdkodat. Det betydde att LLM:n kunde kalla `requestEnvVar`/`suggestIntegration`-tools på första prompten i en chat och pusha env-prompts in i F2 — exakt det din regel säger inte ska hända.

**Vad jag gjorde:** Bytte till `false` med utförlig kommentar om varför.

**Fil:** `create-chat-stream-post.ts:760`.

#### ENV-3: F3 follow-up får tools, F2 follow-up inte
**Vad var fel:** `chat-message-stream-post.ts` hade `includeIntegrationSignals: false` hårdkodat — så LLM:n kunde aldrig signalera nyupptäckta env-behov i F3 heller. Om en F3-prompt sa *"lägg till Fortnox"* hade modellen ingen kanal att be om `FORTNOX_ACCESS_TOKEN` i chatten.

**Vad jag gjorde:** Gate på `parsedMeta.lifecycleStage === "integrations"`. Resultat: F2 init OFF, F2 follow-up OFF, F3 follow-up ON.

**Fil:** `chat-message-stream-post.ts:890`.

### VM-fixar (Fly-hygien)

#### VM-1: Sandboxar destrueras nu på Fly när vi rensar lokal state
**Vad var fel:** `clearPreviewSessionAsync` raderade bara den lokala Map-entryn + Redis-nyckeln. Den gamla VM:en på Fly fortsatte snurra tills (a) idle-TTL triggade eller (b) `/admin/cleanup` reapade den. Det är därför du har sett ENOSPC-mönstret återkomma — `triggerPreviewHostCleanup` är ett symptom, inte en lösning.

**Vad jag gjorde:** Ny helper `destroyAndClearPreviewSession(chatId)` i `preview-session.ts` som:
1. Läser current `sandboxId` från storen
2. Fire-and-forget kallar `destroyPreviewHostSession({ sandboxId })` — felen swallas men loggas
3. Sen kör vanlig `clearPreviewSessionAsync`

Anropas från:
- `forceRestart`-pathen (rad 145)
- Resume-failed-pathen (rad 174) — när vi resume:ar och Fly inte svarar

**Den vanliga `clearPreviewSessionAsync` är oförändrad** (för att inte skapa cirkulära imports från session-store). Sessionsstoren är fortfarande "dum" — destroy-orchestreringen lever i `preview-session.ts`.

#### VM-3: Användaren kan inte längre fastna pekande på en zombie-sandbox
**Vad var fel:** När `/preview-destroy`-routen fick ett retryable host-fel (5xx från Fly) returnerade den 502 *innan* lokal state hann rensas. Användaren hade kvar en lokal pointer mot en sandbox hen inte kunde destroya manuellt.

**Vad jag gjorde:** Ny semantik i `preview-destroy/route.ts`:

| Scenario | Status | Local clear |
|---|---|---|
| Host destroy OK | 200 | ✓ |
| Host destroy retryable fail (5xx) | 200 + `providerDestroyDeferred: true` | ✓ |
| Host destroy hard fail (4xx) | 400 | ✗ (för säkerhets skull) |

Nytt fält `providerDestroyDeferred` i `PreviewDestroyApiJson`-kontraktet. Schema och docs uppdaterade så de matchar runtime.

---

## Filer som ändrats

| Fil | Vad |
|---|---|
| `src/lib/gen/preview/preview-session.ts` | `lifecycleStage` option + `destroyAndClearPreviewSession`-helper + två force-destroy-callsites |
| `src/lib/providers/own-engine/generation-stream-post-finalize.ts` | Skickar `lifecycleStage` från `buildSpec.previewPolicy` |
| `src/app/api/engine/chats/[chatId]/preview-session/route.ts` | Skickar `lifecycleStage` från `versionRow.lifecycle_stage` |
| `src/app/api/engine/chats/[chatId]/preview-destroy/route.ts` | Ny semantik för retryable vs hard host-fail |
| `src/app/api/engine/chats/[chatId]/preview-destroy/route.test.ts` | Uppdaterat retryable-testet, lagt till hard-fail-test |
| `src/lib/api/engine/chats/create-chat-stream-post.ts` | F2-init integration tools = `false` |
| `src/lib/api/engine/chats/chat-message-stream-post.ts` | Integration tools gated på `lifecycleStage === "integrations"` |
| `src/lib/gen/preview/preview-contract.ts` | Nytt `providerDestroyDeferred?: boolean` på `PreviewDestroyApiJson` |
| `docs/schemas/strict/preview-session-contract.schema.json` | Schema-tillägg |
| `docs/schemas/preview-session-contract.md` | Sektion "host-failure semantics" |

---

## Vad du bör testa i morgon

### Manuell verifiering (ta 15 min)

| # | Steg | Förväntat |
|---|---|---|
| 1 | Starta ny chatt i F2 med prompt *"bygg en sajt med Stripe"* | Inga env-prompts dyker upp i chatten. Inga `requestEnvVar`-tool-calls i SSE-loggen. |
| 2 | Follow-up i F2: *"lägg till en kontaktformulär"* | Samma — inga env-prompts. |
| 3 | Klicka "destroy preview" i UI:n när allt är ok | 200 + `destroyed: true` + lokal state tom + Fly-sandbox borta |
| 4 | Stoppa preview-host (lokalt: `docker stop preview-host`) → klicka destroy | 200 + `providerDestroyDeferred: true` + lokal state tom (skulle ha krashat med 502 förr) |
| 5 | `forceRestart: true` på en aktiv session | Ny sandbox startas. Gamla `sandboxId` ska INTE finnas på Fly längre (`fly machines list -a <app>`). |
| 6 | Klicka "Bygg integrationer" på en F2-version (om knappen finns — se nedan) | `/finalize-design` → 412 med `missingByIntegration` om Stripe inte är konfat |
| 7 | Fyll i `STRIPE_SECRET_KEY` via `ProjectEnvVarsPanel`, klicka igen | 200 + `ready: true` |
| 8 | F3-stream startar | I `.env.local` på preview-host SAKNAS `STRIPE_SECRET_KEY=sk_test_xxx` (stub-värdet). Bara harmless-placeholders + dina riktiga värden. |

### Automatiserad verifiering

```bash
npm test -- src/lib/gen/preview src/lib/api/engine/chats src/app/api/engine/chats
```

Bör ge **all green** utom EN pre-existerande failure i `preview-status/route.test.ts > "returns stopped + provider_not_running_or_unreachable when resume fails"` — testet använder `createdAt: Date.now()` vilket placerar sessionen inom 90s boot-grace ⇒ status blir alltid `"starting"` snarare än `"stopped"`. Pre-existerande fel, inte mitt. Värt att fixa testet separat (ändra `createdAt: Date.now() - 100_000`).

---

## Kvar att göra (medvetna bortval — flagga från min sida)

Det här lämnade jag eftersom det är större eller behöver design-beslut från dig:

### F3-knappen (ENV-4 från analysen) — STORT
**Vad:** `PreviewPanelF3Trigger` finns som komponent i `src/components/builder/preview-panel/PreviewPanelF3Trigger.tsx` men **importeras inte från någon annan fil i hela kodbasen**. Det finns alltså ingen "Bygg integrationer"-knapp i UV1 just nu — du *måste* trigga F3 manuellt via API.

**Varför inte fixat:** UI-placering är ett designbeslut (var i `PreviewPanelChrome`? `PreviewPanel`-aktionsraden? bredvid tier-2-indikatorn?). Vill inte gissa. Snabbt fix när du säger var.

**Förslag:** Mounta i `PreviewPanelChrome.tsx` bredvid status-indikatorn, gatad på att aktuell version är F2 (`buildSpec?.previewPolicy !== "fidelity3"`). `onMissingEnv`-callbacken bör öppna `ProjectEnvVarsPanel` med tab "env" + `preferredKeys` förvalt.

### `ProjectEnvVarsPanel` är alltid synlig (ENV-5)
**Vad:** Panelen renderas ovillkorligt i `BuilderShellContent.tsx:794`. Du sa att den bara ska finnas i F3.

**Varför inte fixat:** Hänger ihop med F3-knappen — vill inte gömma panelen innan vi har en knapp som öppnar den. Risk: användare kan inte hitta env-input om vi gömmer för aggressivt.

**Förslag:** Kollapsa som default i F2 (visa minst en "Konfigurera env vars (F3)"-knapp), expandera vid F3-trigger.

### VM-2: Status-fetch swallar 5xx
**Vad:** `fetchPreviewHostStatus` returnerar `null` på alla failures ⇒ tillfälliga 502:or från Fly markerar sessions som "stopped" ⇒ onödig recreate. Pre-existerande testfel (se ovan) hänger ihop med det här.

**Varför inte fixat:** Kontraktsändring (returntyp blir diskriminerad union) som spillar in i flera filer. Vill ha en separat commit för att hålla diff:en granskbar.

### VM-4: Idle-TTL 90 min räknas på heartbeat
**Vad:** Långa F3-builds utan att iframe är fokuserad → session expirerar mitt under arbetet.

**Varför inte fixat:** Behöver thread igenom touch-anrop från `validate-and-fix` / `runVerifierPass` callbacks. Inte ett city-block men inte heller en one-liner.

### VM-7: Resume utan files-hash
**Vad:** Vid resume kollar vi inte att filerna i sandbox matchar nya generationens output — kan visa stale content.

**Varför inte fixat:** Behöver ny `filesHash`-kolumn i `PreviewSessionEntry` + Redis-migration. Större grej.

---

## Persistent disk / volume — svar på din fråga

> *"Jag kollar också på en så kallad persistent disk, eller om det bara heter volume."*

På Fly heter det **volumes** (`fly volumes`). Just nu använder preview-host inte volumes (såvitt jag kan se från klient-koden) — varje sandbox är ephemeral. Det är därför disk-fullt händer på *värd-VM:en* själv (inte på en delad volym): många ephemeral sandboxar ackumulerar tills idle-TTL eller cleanup tar dem.

> *"Om de körs så att de är lätta att starta upp. Men om användaren klickar ner sin session på något sätt, ska innehållet raderas smidigt."*

Det är exakt det jag fixade ikväll med VM-1 + VM-3. Tidigare beteende: "klicka ner" ⇒ lokal pointer borta, men sandbox lever vidare. Nytt beteende: "klicka ner" ⇒ destroy fired på Fly + lokal pointer borta. Warm pool-effekten finns kvar genom resume-pathen (samma chat+version + match → resume samma sandbox).

**Om du vill ha en riktig pool-modell** (warm sandboxar som inte är bundna till en specifik chat och kan tilldelas snabbt), så är det ett större arbete:
1. preview-host måste stödja "anonymous warm pool"-koncept
2. App-sidan behöver tilldela en warm sandbox och ompeka filer
3. Pool-storlek + min/max policy

Värt att designa separat. Idag har du **per-chat warm runtime** (resume-baserat) vilket är 80% av effekten utan komplexiteten.

---

## Vad jag medvetet INTE rörde

- **`backoffice/`** — inga ändringar berörde admin-flödena. `backoffice/shared.py` orörd.
- **`sajtmaskin_backoffice.py`** — orörd. Drift-/adminflöden påverkades inte.
- **Pre-existerande testfel i `preview-status/route.test.ts`** — det är en bugg i testdatat (`createdAt: Date.now()` hamnar inom boot-grace), inte i runtime. Vill inte ändra det utan att vara säker på att det är vad testförfattaren avsåg.
- **`ProjectEnvVarsPanel`-gating** — väntar på F3-knapp-design.

---

## Glossary-disciplin

Inga nya termer introducerades. Alla ändringar använder existerande namn: `lifecycleStage`, `previewPolicy`, `fidelity2`/`fidelity3`, `sandboxId`, `previewSessionId`, `chatId`. `providerDestroyDeferred` är ett nytt fältnamn men följer befintliga prefix-konventioner (`provider…`, `…Deferred`).

---

## Snabb-recap för morgonkaffet

1. **F2 har inga env-prompts längre.** Test med "bygg sajt med Stripe" ⇒ inga frågor.
2. **F3 strippar verkligen tier3-stubs nu** ⇒ kraschar om STRIPE_SECRET_KEY saknas (det är vad du vill).
3. **Destroy fungerar både för Fly och lokalt.** Användare kan inte fastna i zombie-state.
4. **Det finns fortfarande ingen knapp i UV1** för "Bygg integrationer" — säg åt mig var du vill ha den så lägger jag in den (5 min).
5. **En pre-existerande test-bugg** i preview-status — orelaterad till mig.

God morgon!

— assistenten, 2026-04-18 kväll
