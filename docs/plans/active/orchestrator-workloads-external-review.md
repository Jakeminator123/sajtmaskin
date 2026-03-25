# Orchestrator workloads — external review remediation

**Syfte:** Dela ut arbete till nya agenter utan att dela samma konversationskontext. Varje workload är tänkt som **en agent i taget** per fil-yta där merge-konflikter annars uppstår.

**Sanning i repo:** `docs/plans/active/external-review-remediation-progress.md` (procentsiffror, commit-rutin, Next-steg).

**Checkbox-roadmap + spår (nytt):** `docs/plans/active/external-review-execution/` — [README.md](./external-review-execution/README.md), [CONTINUATION.md](./external-review-execution/CONTINUATION.md), [MASTER-ROADMAP.md](./external-review-execution/MASTER-ROADMAP.md). Workers bockar av i `track-w*.md` enligt instruktion där.

**Källplaner (städade kopior):** `.j_to_agent/1.txt` (landning + integrationer), `.j_to_agent/2.txt` (own-engine pack), `.j_to_agent/3.txt` (scaffolds, scripts, orchestrator-frågor).

**Parallellisering:** OK när **olika filträd** (t.ex. `scripts/` + `src/lib/integrations/`). **Ej** parallellt: flera agenter i `chat-area.tsx` / samma landing-fil — en ägare tills `LandingBackground` (och ev. följande slice) är klar.

**Verifiering (varje workload):** `npm run typecheck`; uppdatera progress-tabellen om leverans ändrar **Whole vision**-%; commit enligt samma fil.

---

## W1 — Landing background slice (sequential owner)

- **Scope:** Bryt ut `LandingBackground` (shader / grid / noise) från `chat-area.tsx`; semantik per läge (fritext / template / audit / analyserad); `prefers-reduced-motion` och in-view för tunga 3D-delar där det saknas.
- **Acceptance:** Färre överlappande lager i hero utan att sänka läsbarhet; typecheck grön; progress uppdaterad.
- **Refs:** `.j_to_agent/1.txt` steg 3–4; Vercel React best practices (`rerender-*`, `rendering-*`) vid behov.

## W2 — Integrations + deploy (efter W1 eller separat agent, ej samma PR som W1 om risk för konflikt)

- **Scope:** Utöka `integrationRegistry` + ev. manifest-modell; tunna deploy-steg enligt `1.txt` steg 6–7.
- **Acceptance:** En källa för provider-metadata som UI/detektion/deploy kan dela; dokumenterat i progress.
- **Status (2026-03-25 ff.):** Registry + detektion (ovan) + **`sajtmaskin.integration-manifest.json`** i sparad version + `deployReadiness` i deploy-flödet. **Kvar (valfritt):** minska pre-deploy auto-fixar; hård valideringsfas före deploy.

## W3 — Own-engine remediation

- **Scope:** Följ discovery + ev. `scripts/own-engine-remediation.mjs` i `.j_to_agent/2.txt`; isolera legacy v0-provider; transactional finalize / SSE-golden tests när kodbasen matchar.
- **Acceptance:** Inga orphan assistant messages i nya flöden; typecheck + relevanta tester gröna.
- **Status (forts.):** Borttagna oanvända `STREAM_RESOLVE_*`; `createOwnEnginePlanModeResponse` utan redundant `modelId`; **`generation-pipeline.ts`** kanon + `fallback.ts` re-export; delad contract-gate SSE; **`addAssistantMessageAndCreateDraftVersion`** (transaktionell assistant + draft); finalize JSDoc (best-effort steg efter persist); Vitest golden contract-gate + **`generation-stream.golden.test.ts`**; **`own-engine-build-session.ts`:** `buildOwnEngineGenerationStreamMeta`, **`buildPreGenerationContractGateParams`**; **`own-engine-pipeline-generation.ts`:** **`createOwnEnginePipelineAndGenerationStream`**; **`own-engine-plan-mode.ts`**. **Kvar:** orphan-regression / v0-adapter-gräns / valfritt fler generation-stream-scenarier.

## W4 — Scripts / naming hygiene

- **Scope:** `.j_to_agent/3.txt` avsnitt 5 + `Next` i progress (hamta_sidor*, lab-mappar, README-drift).
- **Acceptance:** Package.json-referenser konsistenta; README-paths korrekta; inget borttaget utan referensgrep.
- **Status (forts.):** Kanon `hamta_sidor_branch_emil` + path-drift; **lab:** `scripts/README` § `testning_scarf` + inventory-rad (flytt av mapp = uppdatera `package.json`-scripts).

## W5 — Kritik-mapp (valfritt, worktree-rapporter)

- **Path:** `.j_to_agent/structure_bugs_and_parralells/kritik/`
- **Användning:** Läs som **regressions- och copy-checklista**; SQLite-setup i `detect-integrations.ts` är **verifierad korrekt svenska** på `master` (tidigare rapport kan vara inaktuell).

---

## Kort brief till ny agent (copy-paste)

```
Läs docs/plans/active/external-review-execution/README.md, CONTINUATION.md och MASTER-ROADMAP.md.
Arbeta i docs/plans/active/external-review-execution/track-w<N>-<namn>.md — bocka av [x]; fortsätt nästa öppna punkt utan ny ping tills halt i CONTINUATION.md.
Läsgärna external-review-remediation-progress.md för % och commit-rutin (~4–5 Whole vision per commit när det går).
Kör npm run typecheck && npx vitest run, uppdatera progress-md, commit + push med helhets-% i subject.
```
