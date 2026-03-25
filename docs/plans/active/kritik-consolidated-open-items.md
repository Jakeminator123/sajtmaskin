# Kritik — konsoliderade öppna punkter (alla `NNpct-*.md` genomlästa)

**Syfte:** En **enda** levande lista över buggar / förbättringar som återstår efter att `.j_to_agent/structure_bugs_and_parralells/kritik/*.md` (utom nedan) **arkiverats** under [`../../../.j_to_agent/archive/kritik-addressed/`](../../../.j_to_agent/archive/kritik-addressed/README.md). Dubbletter mellan filer är sammanslagna till **en rad per tema**.

**Sanning om framsteg:** [`external-review-remediation-progress.md`](./external-review-remediation-progress.md) + `git log origin/master`.

**Relaterat:** [`external-review-execution/buglista-del-3.md`](./external-review-execution/buglista-del-3.md) (`.j_to_agent/3.txt`), [`kritik-derived-backlog.md`](./kritik-derived-backlog.md) (kort pekare hit).

**Aktiv kritikfil kvar i mappen (tills vidare):** [`42pct-v.md`](../../../.j_to_agent/structure_bugs_and_parralells/kritik/42pct-v.md) — manifest/deploy-readiness; unika **test-** och **kontrakts**punkter nedan (C-101ff).

---

## Låst / hög konfliktrisk (slutspurt integration + deploy)

- `src/lib/integrations/registry.ts`, `src/lib/gen/detect-integrations.ts`, `config/env-policy.json`
- Deploy-API, `useBuilderDeployActions`, builder copy kopplad till env/409
- Större utökning av `integration-manifest.test.ts` utan ägarskap

---

## Öppna punkter (master-tabell)

| ID | Källor (konsoliderade) | Beskrivning | Typ | Risk | Status |
|----|-------------------------|-------------|-----|------|--------|
| K-007 | `78pct-r`, `64pct-s`, progress | W2-rester: deploy auto-fix / hårdare valideringsfas före deploy (valfritt produktbeslut) | kod / produkt | hög | [ ] |
| K-008 | `78pct-r`, `34pct-n` §5 (historisk) | Landningspolish / W1-rester: ev. mer in-view 3D; delar redan levererat (`79pct-l` m.fl. — nu arkiverat) | mixed | medel | [ ] |
| K-009 | `78pct-r`, `64pct-s` | Own-engine **utanför** avslutad W3-track (SSE, produkt) | kod | hög | [ ] |
| K-014 | `18pct-k` (arkiverad sammanfattning) | Footer / juridik / cookies — produktcopy och eventuella sidor | copy | medel | [ ] |
| K-015 | `31pct-t`, `27pct-w`, `34pct-n` | `extract-landing-chat-data.mjs`: robust parse (minimera radbundna markörer); vakt finns | scripts | medel | [ ] |
| K-016 | `27pct-w`, `31pct-t` | `chat-area.tsx` fortfarande **stor** fil — fortsatt modulär uppdelning vid behov | refaktor | låg–medel | [ ] |
| K-017 | `31pct-t` | `REGISTRY_BY_PROVIDER`: flera rader med samma `provider` skulle kollidera — inget akut | data | låg | [ ] |
| C-101 | `42pct-v` §2.1 | Progress **Last code touch** kan drifta vs senaste stora ändring — håll intro i sync med tabell | doc | låg | [ ] |
| C-102 | `42pct-v` §2.2 | Fler **Vitest** för manifest: ogiltig manifest → fallback, tomma filer, idempotens `injectIntegrationManifestIntoFilesJson`, merge + custom-env | test | medel | [ ] |
| C-103 | `42pct-v` §2.3 | `buildDeployReadiness.invalidFiles` alltid `[]` — ev. framtida utfyllnad | kod | låg | [ ] |
| C-104 | `42pct-v` §2.4–2.5 | Övriga kodvägar `detectIntegrations`/`resolveEnvRequirements` vs “sparad version” som sanning — dubbelkolla över tid | arkitektur | medel | [ ] |

---

## Stängda / införlivade (tidigare spread över många `NNpct-*.md`)

Följande teman behandlas som **stängda** mot nuvarande `master` (implementation eller doc). Detaljer fanns i arkiverade filer som `18pct-k`, `27pct-w`, `31pct-t`, `34pct-n`, `78–84pct-*`, `vercel-templates-path-verification-note.md`.

| Tema | Var det löst / dokumenterat |
|------|------------------------------|
| Fritext-bakgrund, reduced-motion landning (marquee, wf-spin, m.m.) | `landing-v2.css`, `landing-v2-page`, tidigare commits |
| `landingBackgroundSemanticMode` edge cases | `landing-background.test.ts` |
| `.j_to_agent`-hygien, worktree, pre-merge typecheck/vitest | `agent-workflows.md`, progress-doc |
| Tech stack vs `package.json` (marknadsföring) | JSDoc vid `techStack` + spot-check |
| Vercel templates kanonisk path + ignore | `e2e/vercel-templates/`, `.gitignore` — verifierat |
| IntegrationCard / ParticleOrb reduced motion | `79pct-l`-linjen (arkiverad) + senare CSS |
| Svensk copy, Mer-meny, deploy 409 UX, CMS/sök registry-kedja | Commit-kedja 80–84pct (arkiverad som historik) |
| Tilt utan `setState`, reduced-motion i `use3DTilt` | `landing-hooks.ts` |

---

## Underhåll

- När en rad stängs: uppdatera denna fil + ev. `integration-manifest.test.ts` / progress-intro.
- När `42pct-v` är helt uttömd: flytta den till `kritik-addressed` och ta bort C-101–C-104 här (eller markera [x]).
- Nya milstolpar: antingen kort notis här **eller** ny fil i `kritik/` + en rad i [`KRITIK-OVERVIEW.md`](../../../.j_to_agent/structure_bugs_and_parralells/kritik/KRITIK-OVERVIEW.md).

**Batch:** 2026-03-26 — konsolidering + massarkivering av handoff-/historikfiler.
