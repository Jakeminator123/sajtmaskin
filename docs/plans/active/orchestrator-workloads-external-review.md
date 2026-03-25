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
- **Status (2026-03-25):** `track-w1-landing-followups.md` — **in-view + reduce** för hero `ParticleOrb`; **IntegrationCard** + feature-modal partiklar utan float vid `prefers-reduced-motion`. **Kvar (produkt):** footer-sidor / copy.

## W2 — Integrations + deploy (efter W1 eller separat agent, ej samma PR som W1 om risk för konflikt)

- **Scope:** Utöka `integrationRegistry` + ev. manifest-modell; tunna deploy-steg enligt `1.txt` steg 6–7.
- **Acceptance:** En källa för provider-metadata som UI/detektion/deploy kan dela; dokumenterat i progress.
- **Status (2026-03-25 ff.):** Registry + detektion (ovan) + **`sajtmaskin.integration-manifest.json`** i sparad version + `deployReadiness` i deploy-flödet + **409 `DEPLOY_MISSING_ENV`** på deploy-API om env saknas + valfri **`precheckOnly`** (se `docs/architecture/deploy-precheck.md`, `track-w2-deploy-hardening.md`). **Kvar (valfritt):** auto-fix opt-in.

## W3 — Own-engine remediation

- **Scope:** Följ discovery + ev. `scripts/own-engine-remediation.mjs` i `.j_to_agent/2.txt`; isolera legacy v0-provider; transactional finalize / SSE-golden tests när kodbasen matchar.
- **Acceptance:** Inga orphan assistant messages i nya flöden; typecheck + relevanta tester gröna.
- **Status (2026-03-25):** **Track komplett** (se `track-w3-own-engine.md`, Fas A W3 i MASTER-ROADMAP). Levererat: pipeline/plan-mode/session-hjälpare, transaktionell finalize, contract-gate + generation golden tests, orphan-regression i `finalize-version.test.ts`, **`own-engine-v0-boundary.test.ts`**, notis i `v0-soft-deprecation.md`. **Progress-doc:** own-engine-segment **~78%** (track klar; kvar = ev. arbete utanför track). **W4** scripts-spår **klart**.

## W4 — Scripts / naming hygiene

- **Scope:** `.j_to_agent/3.txt` avsnitt 5 + `Next` i progress (hamta_sidor*, lab-mappar, README-drift).
- **Acceptance:** Package.json-referenser konsistenta; README-paths korrekta; inget borttaget utan referensgrep.
- **Status (2026-03-25 ff.):** Kanon `hamta_sidor_branch_emil.py` + `--legacy-wide-use-cases`; wrapper `hamta_sidor.py` borttagen; labb flyttat till `scripts/labs/testning_scarf/` med uppdaterade npm-scripts. Se `track-w4-scripts.md` för W4-exit.

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
