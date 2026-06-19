# LLM-kedjan — flödesscheman och narrativ

**Senast uppdaterad:** 2026-04-21. **Källtruth:** koden. Den här mappen ritar upp hur LLM-kedjan **faktiskt** ser ut just nu, så att den kan jämföras visuellt mot ändringar.

## Innehåll

| Fil | Vad |
|-----|-----|
| [`llm-chain-flowchart.md`](./llm-chain-flowchart.md) | Översikt: prompt → orkestrering → codegen → finalize → preview. ASCII-schema + sektion per fas. |
| [`dossier-selection-flow.md`](./dossier-selection-flow.md) | När väljs vilken dossier? Capability-driven urval, hard/soft, verbatim/rewritable, prompt-injection. |
| [`../architecture/llm-callsite-matrix.md`](../architecture/llm-callsite-matrix.md) | **Kanonisk callsite-matris:** var varje LLM/embedding-anrop sker (fil:rad, fas, modellkälla, API-stil) + deterministiska steg + verifierade fynd. |

## Relaterade kanoniska källor

| Var | Vad |
|-----|-----|
| `docs/architecture/fas2-orchestration-and-build.md` | Komplett Fas 2-spec (orchestrate + build + finalize). |
| `docs/architecture/llm-flow-end-to-end.md` | "Vad händer när användaren skickar en prompt?" — Fas 1-fokus. |
| `docs/architecture/dossier-system.md` | Full dossier v2-spec (manifest, klasser, fideliteter). |
| `docs/architecture/mental-model-vs-actual-flow.md` | Skillnader mellan användarens mentala modell och kod. |
| `docs/operating/dossier-cheatsheet.md` | Operativ snabbreferens (curation-kommandon, verifiering). |
| `docs/schemas/strict/dossier.schema.json` | Hårt JSON Schema för dossier-manifest. |
| `.cursor/skills/sajtmaskin-context/SKILL.md` | Terminologi-guardrails. |

## När du ska uppdatera filerna här

Uppdatera flödesschemat **i samma leverans** när:

1. Faserna i finalize-pipelinen ändras (t.ex. en fas tas bort eller läggs till).
2. Nya LLM-anropssites tillkommer (t.ex. en ny verifier-fas).
3. Dossier-urvalsalgoritmen ändras.
4. SSE-events i `done`-handoffen ändras.

Kosmetiska prompt-ändringar kräver inte uppdatering här — bara strukturella förändringar i kedjan.
