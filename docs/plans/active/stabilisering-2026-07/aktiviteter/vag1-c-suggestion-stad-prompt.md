# Agent-prompt — Våg 1-C: Suggestion-städ + fredning av inline-frågor (B3+B4, smarthet 5/10)

Kopieras rakt in i en builder-agent. Reserverar `src/lib/providers/own-engine/generation-stream-tools.ts`, `src/lib/hooks/chat/helpers.ts`, `src/components/builder/BuilderMessageTooling.tsx` (+ tester). Rör INTE autofix/verify (Våg 1-A) eller dossiers (Våg 1-B).

---

Du är builder-agent i repot Jakeminator123/sajtmaskin (Next.js/TypeScript). Utgå från senaste `origin/master`, skapa branch `fix/stabilisering-vag1-suggestion-stad`, leverera EN PR mot master. Litet, avgränsat paket.

MISSION (två delar):

**Del 1 — malformad integration-suggestion.** I prod-sessionen 2026-07-03 (chat `cc10e7de`, F3-fasen) visade builder-chatten en integration-rad med literal text `Integration: Integration`, status "Kräver konfiguration", inga env-vars — bredvid en korrekt Stripe-rad. Rotorsak (kodverifierad): när modellen anropar `suggestIntegration` utan `name`/`provider`/`envVars` faller `generation-stream-tools.ts` (~rad 60–79) tillbaka till `name: "Integration"`, och UI-raden i `BuilderMessageTooling.tsx` (~rad 611–624) prefixar `Integration: {name}` → `Integration: Integration`. Samma fallback finns i `helpers.ts` (`buildIntegrationSteps`, ~rad 667–671) och `BuilderMessageTooling.tsx` ~rad 1336. Dessutom kan en dubblett läcka om tool-signalens provider-nyckel inte matchar post-finalize-detektionens `item.key` (`shared-own-engine-helpers.ts`, `getUnsignaledDetectedIntegrations`, ~rad 53).

**Del 2 — freda inline-frågorna.** Ägaren gillar att integrations-/env-/godkännande-frågor dyker upp som smidiga inline-kort i chattflödet (`CompactToolParts` med knappar "Godkänn förslag"/"Avvisa förslag") — INTE som den stora dialog-popupen ("Svar krävs") som planläget använder. Lås beteendet med regressionstester så framtida ändringar inte flyttar integration-frågor in i dialogen.

LÄS FÖRST: `AGENTS.md`, `docs/architecture/code-map.md`. Nyckelfiler: `src/lib/gen/agent-tools.ts` (suggestIntegration-schemat), `src/lib/providers/own-engine/generation-stream-tools.ts`, `src/lib/providers/own-engine/shared-own-engine-helpers.ts`, `src/lib/hooks/chat/helpers.ts`, `src/components/builder/BuilderMessageTooling.tsx` (`CompactToolParts`, `isActionableToolPart` ~rad 1254, `getActionPrompt` ~rad 1103), `src/components/builder/MessageList.tsx` (compact-rendering ~rad 292–306; dialogen "Svar krävs" ~rad 420–463).

UPPGIFTER:

1. Validera tool-args vid källan (`generation-stream-tools.ts`).
   - Om `suggestIntegration`-anropet saknar både `provider` och `name`, eller saknar `envVars` helt OCH namnet är tomt/generiskt: droppa signalen (logga med befintlig warnLog-kanal, samma mönster som F2-mute-lager 2 "Dropped F2 env/integration tool-call") i stället för att emitta en tom envelope.
   - Om `provider` finns men `name` saknas: härlett visningsnamn från provider-nyckeln (t.ex. `stripe` → `Stripe`) i stället för fallback `"Integration"`.

2. Ta bort dubbleringen i UI:t.
   - `Integration: {name}`-raden ska aldrig kunna rendera `Integration: Integration`: när namnet saknas/är generiskt, visa bara providern eller utelämna raden. Justera fallbackarna i `helpers.ts` och `BuilderMessageTooling.tsx` konsekvent (en sanning — undvik tre olika fallback-strängar).

3. Dedupe tool-signal vs post-finalize-detektion.
   - `getUnsignaledDetectedIntegrations`: säkerställ att jämförelsen sker på normaliserad provider-nyckel så samma integration inte visas två gånger (en från tool-callen, en från detektionen). Skriv test som reproducerar dubbletten.

4. Fredningstest för inline-frågorna (ingen produktionskodändring om inget är trasigt).
   - Test A: en `suggestIntegration`-tool-part i standardläget (`showStructuredChat=false`) renderas via `CompactToolParts` inline med approval-knappar — och triggar INTE `pendingReply`-dialogen.
   - Test B: `isActionableToolPart` klassar integration-/env-parts som actionable (lås nuvarande beteende).
   - Kommentera testen med varför (ägarbeslut 2026-07-03: inline-UX bevaras).

STOPPREGLER:
- Ändra INTE `suggestIntegration`-schemat i `agent-tools.ts` (modellkontraktet ligger fast; validering sker på mottagarsidan).
- Ändra inte planlägets dialog eller `showStructuredChat`-beteendet.
- Inga ändringar i F2-mute-lagren utöver ev. återanvänd logg-kanal.
- Unicode-regex-regeln gäller om du rör regex.

TESTER & VERIFIERING:
- Nya/utökade tester i `generation-stream-tools`-ytan (droppad tom signal, härlett namn), `helpers`-testerna, `BuilderMessageTooling`/`MessageList`-tester (fredningen), dedupe-test.
- `npm run typecheck` → 0 fel · `npm run lint` → 0 fel · `npx vitest run` på berörda ytor → grönt.

PR-KRAV:
- Titel: `fix(builder): stabilisering våg 1 — validera integration-suggestions + freda inline-frågorna`
- Body: rotorsak till `Integration: Integration`, vad som droppas vs härleds, dedupe-beteendet, fredningstestens kontrakt, bug-postcheck dokumenterad med triage.
- Committa aldrig `.env*`, `.vercel/` eller secrets. Skapa inga filer under `docs/plans/`.

DEFINITION OF DONE:
- [ ] Tomma/malformade suggestIntegration-anrop droppas eller normaliseras vid källan
- [ ] `Integration: Integration` kan inte renderas; en fallback-sanning
- [ ] Dubblett tool-signal/detektion dedupas (test bevisar)
- [ ] Fredningstester för inline-frågorna gröna och kommenterade
- [ ] typecheck/lint/vitest gröna; bug-postcheck dokumenterad i PR
