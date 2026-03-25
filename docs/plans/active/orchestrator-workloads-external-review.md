# Orchestrator workloads — external review remediation

**Syfte:** Dela ut arbete till nya agenter utan att dela samma konversationskontext. Varje workload är tänkt som **en agent i taget** per fil-yta där merge-konflikter annars uppstår.

**Sanning i repo:** `docs/plans/active/external-review-remediation-progress.md` (procentsiffror, commit-rutin, Next-steg).

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
- **Status (forts.):** Borttagna oanvända `STREAM_RESOLVE_*` i båda stream-routes; `createOwnEnginePlanModeResponse` utan redundant `modelId`-param; **`generation-pipeline.ts`** kanon + `fallback.ts` re-export; **delad pre-generation contract-gate SSE** (`pre-generation-contract-gate.ts`); **finalize:** assistant-rad efter preflight + `deleteEngineMessage` om draft-version misslyckas; **Vitest golden** för contract-gate-SSE; **`src/lib/own-engine/session/own-engine-build-session.ts`** med `buildOwnEngineGenerationStreamMeta` (delad SSE-meta för generation-stream). **Kvar:** utöka sessionen (plan-mode / contract-gate / pipeline i samma lager), DB-transaktion / fler stream-golden tests / felhantering efter lyckad version om ni vill gå längre.

## W4 — Scripts / naming hygiene

- **Scope:** `.j_to_agent/3.txt` avsnitt 5 + `Next` i progress (hamta_sidor*, lab-mappar, README-drift).
- **Acceptance:** Package.json-referenser konsistenta; README-paths korrekta; inget borttaget utan referensgrep.

## W5 — Kritik-mapp (valfritt, worktree-rapporter)

- **Path:** `.j_to_agent/structure_bugs_and_parralells/kritik/`
- **Användning:** Läs som **regressions- och copy-checklista**; SQLite-setup i `detect-integrations.ts` är **verifierad korrekt svenska** på `master` (tidigare rapport kan vara inaktuell).

---

## Kort brief till ny agent (copy-paste)

```
Läs docs/plans/active/external-review-remediation-progress.md och docs/plans/active/orchestrator-workloads-external-review.md.
Implementera workload W1 (eller det nummer du fått). Kör npm run typecheck, uppdatera progress-md, commit med helhets-% i subject (t.ex. chore: remediation ~32pct — …).
```
