# Handoff — Sajtmaskin: förenkling, cleanup & root-hygien

**Datum:** 2026-06-17 · **Status:** orientering för nästa agent · **Källa:** analys-/cleanup-session (multitask)

## 1. Syfte
Jake vill förenkla Sajtmaskin så det blir lättare att manövrera och mindre buggigt, utan att tappa kvalitet. Lärdom från sidoprojektet "Sitebyggaren": regression-tester gav mest bugg-minskning per rad (men de var för många). Denna handoff samlar en hel sessions analys + beslut + nästa steg så arbetet inte tappas.

## 2. Repo-state vid handoff
- `master` == `origin/master` == `3a40f0ca8` (i synk).
- **PR #130** (docs-only plans-konsolidering) MERGAD → `33dd83f`. `docs/plans/active/` är nu ett koncentrat (`README.md`), detalj i `docs/plans/archived/`, lifecycle-regeln slimmad till 3-mapp-modell (active/archived/avklarat).
- Commit `3a40f0ca8` (env-cleanup: gitignore .env-backups, env-cleanup inventory) gjordes av en ANNAN agent.
- Aktiva worktrees vid handoff: huvudcheckout (`master`), `sajtmaskin-review-gate` (`chore/pr-review-gate-rule`, annan agent).
- Ocommittat i huvudcheckouten (ej denna session): `M .gitignore`, `?? deep-research-report.md`.
- npm ci OK (1054 paket); 15 npm-audit-vulns (se §8).

## 3. Vad denna session gjorde
- Mergade PR #130 server-side (rörde aldrig lokal HEAD).
- FF-synkade lokal master 09b8d45f → 33dd83f.
- Producerade analysen nedan (fanns tidigare bara i chatt — nu persistad här).
- Inga kodändringar i `src/`.

## 4. Komplexitet & förenkling (huvudanalys)
Projektet fungerar; OMTAG-vågen har redan brutit ut `finalize-version/` + `system-prompt/`. "Svårmanövrerat" beror på: (a) halvfärdiga migrationer, (b) dubbel sanning (status, keyword-listor, init/follow-up-stream), (c) brus (backlog/planer/legacy-namn). Förenkling = slutför påbörjat + maskinellt skydd, inte omskrivning.

Topp-5 quickwins (störst lättnad, lägst risk):
1. **Event-bus UI-flip** — koppla in `useVersionStatus` i `VersionHistory.tsx` + `BuilderShellContent.tsx` (ersätt `resolveEngineVersionDisplayStatus`). Fixar "falskt Fel" under repair-pass. Störst värde.
2. Delad init/follow-up stream-handler (`create-chat-stream-post.ts` + `chat-message-stream-post.ts` ~80% identiska).
3. Slutför `src/lib/gen/orchestrate/`-paketet (flytta `resolveOrchestrationBase`/`finalizeOrchestrationPrompts` ur 981-raders rotfil).
4. Deduplicera motion/guidance-keywords (`guidance-resolvers.ts` ↔ `prompt-assist/motion-guidance.ts` — byte-identiska).
5. Städa stray-ytor (se §6).

Farligaste buggrisk-ytor: (1) samma `versionId` över repair-passes, (2) dubbel status-källa, (3) autofix null-render/dossier-stubbar, (4) F2 fail-open runtime/UI (Product Postcheck default-off), (5) klient-side post-check/repair-race.

## 5. Fas 0+1 implementation-plan (verifierad mot HEAD)
- **Fas 0 (ingen src-risk):** re-triage `BUG-SWARM-BACKLOG.md` (~50% arkiv; OBS får ej flyttas/döpas om — läses hårdkodat av `scripts/dev/check-bug-backlog.mjs`); markera `deep-research-report.md` stabil-SHA som historik; knip-pass (knip saknas i `package.json` → installera först).
- **Fas 1 (quickwins):** event-bus UI-flip, slutför `orchestrate/`, motion-dedup, stray-städ, + port: Vitest `test:core`-lane + `docs/testing.md` + `docs/delivery-bias.md`.
- Spar-modell efter #130: koncentrat-rad i `docs/plans/active/README.md` + detalj i `docs/plans/archived/`.

## 6. Root-hygien (verifierad mot git)
- **Kanonisk karta stale:** `docs/architecture/repo-tree.md` + `README.md` listar fantommappar (`research/`, `tests/`, `templates_v0/`) och saknar verkliga (`preview-host/`, `backoffice/`, `evals/`, `drizzle/`). Synka (ersätt, lägg inte lager).
- **Säkert (docs/config):** `git mv docs/arch/ → docs/architecture/`; `audit-reports/` + `RAPPORT-2026-05-02-*.md` → `docs/reports/`; genericisera `test_förslag_templates_blob/README.md:8` (enda hårdkodade Desktop-sökvägen — dokumentation, ofarlig; ingen körbar kod har userpath).
- **BEHÅLL (verifierat load-bearing):** `test_förslag_templates_blob/` (= `DEFAULT_SOURCE` för `npm run templates:blob:sync`), `config/dashboard/domain-map.json` (paritetstest), `BUG-SWARM-BACKLOG.md` i roten.
- **Kräver Jakes beslut:** radera tracked scratch (`blandat/`, `egna_kommandon.txt`, `generering.txt` → `git rm`); eval-namnskugga (`scripts/eval/` vs `scripts/evals/` vs `src/lib/gen/eval/cli.ts`, CI använder den tredje); töm `config/dashboard/`-legacy (`app.py`/`run.ps1`/`requirements.txt`/`shared_overhead.py` — dokumenterad, kräver doc-synk).
- `deep-research-report.md` (rot) är otrackad → kan tas bort lågrisk.

## 7. .gitignore / .cursorignore
- **Inga hemligheter tracked** (verifierat). `.env.local` korrekt ignorerad.
- `.cursorignore`: `#logs/**` är bortkommenterad → hela `logs/` indexeras (brus). Avkommentera så negationsblocket aktiveras.
- `.cursorignore` secret-spegel ofullständig (saknar `*.pem`, `client_secret*.json`, `.cursor/mcp.json`).
- `.gitignore` self-ignore-rad = latent (filen är tracked, döljer inget) → ta bort vid tillfälle.
- Stale `templates_v0/`-block i `.cursorignore` → ta bort.
- Arkiv: behåll tracked i git; cursorignore = öppen policy-fråga (repot håller medvetet `docs/plans/avklarat/` indexerbart).

## 8. Säkerhet (npm audit — 15 vulns)
Bara **`next`** biter på den deployade appen. `vitest` (critical) + `vite` (high) = dev/test-verktyg, skeppas ej. Övriga mest transitiva (hono, postcss, qs, uuid→svix→resend, ip-address, js-yaml, fast-uri, @babel/core). **Kör inte `npm audit fix`** rakt av (riskerar pins: Next 16, React 19, vite). Väg: riktad `next`-patch-bump (egen PR + `npm run build` + tester) + låt Dependabot (#122/#129) ta resten en i taget. `npm audit fix --force` = aldrig.

## 9. Sitebyggaren-portar (referensprojekt C:\Users\jakem\Desktop\sajtbyggaren)
Värt att porta (lättviktigt): deterministisk golden-path-eval-gate (nyckelfri, 4 cases), testlanes + `delivery-bias.md` (svar på "för många tester"), term-governance light (forbidden-dict + check-term-coverage). INTE: hela `governance/`-apparaten, 1500-raders allowlist, dubbel Python/Next-stack.

## 10. Dokumentbedömning
- `BUG-SWARM-BACKLOG.md`: ~50% avklarat arkiv; ~25–35% av öppna rader stale; P1/P2-teman stämmer mot kod. Re-triage en gång; arkivera `[x]`-rader.
- `deep-research-report.md`: rotorsaksmodell (5–6 defektfamiljer, "falskt grönt") håller; stabil-SHA `c0e0516` + CI-expansionsrekar överspelade → markera som historik.

## 11. Öppna beslut (väntar på Jake)
arkiv-cursorignore ja/nej · radera tracked scratch · eval-namnval · töm config/dashboard · next-bump-PR · när Fas 0+1 ska köras.

## 12. Rekommenderad ordning
Fas 0 (nollställ: backlog/knip) → Fas 1 (event-bus UI-flip + quickwins) → Fas 2 (bugg-hårdning: false-green-familjen) → Fas 3 (telemetri-styrt: verifier/partial-repair/autofix-merge).

## 13. Hur denna PR mergas
- **Lokalt utan att flytta HEAD i delat träd (säkrast):** `git fetch origin` → `git update-ref refs/heads/master origin/docs/handoff-cleanup-forenkling-2026-06-17` (endast om FF) → `git push origin refs/heads/master:refs/heads/master`.
- **Lokalt klassiskt (om du står på master):** `git fetch origin; git merge --ff-only origin/docs/handoff-cleanup-forenkling-2026-06-17`.
- **GitHub:** `gh pr merge <nr> --merge` eller via webb-UI.
- Efter merge: `git worktree remove C:\Users\jakem\dev\projects\sajtmaskin-handoff` och radera branchen.
