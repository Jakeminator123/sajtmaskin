# B10 — Prompt-assist-knapp bredvid Plan

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)
Status: öppen PR #1038.
Ägarbeslut: **2026-08-19** (glossaryn äger ordet). Inte N1.

## Vad det är

En knapp **bredvid Plan** i chattinputens verktygsrad. Den skickar inte
meddelandet. Den tar det användaren redan skrivit, kör en billig modell, och
skriver tillbaka i samma ruta.

| Gör | Gör inte |
|---|---|
| Rättstava | Skicka prompten |
| Lätt struktur (radbrytning, punktlista om det redan finns punkter) | Göra `siteBriefSchema` / spec / sajtbrief |
| Fylla ut eller tunna så texten blir tydligare för en LLM | Byta röst till «systemprompt» |
| Bevara naturligt språk | Polish / «Skriv om» / «Förbättra prompt» (död 2026-04-21) |
| Eget modellsteg i manifest + Backoffice | Återanvända Deep Brief-slotten `SAJTMASKIN_ASSIST_MODEL` |

Default: `openai/gpt-5.6-terra` på **ny** workload-post — inte via
`promptAssist.allowed` (det är Deep Briefs lista).

## Verifierad yta (2026-08-19)

| Beslut | Varför |
|---|---|
| Knapp **efter Plan**, före `previewModes`, samma `className` | `ChatInterface.tsx` ~741–750. Inte footer. |
| Writeback: `setInput(rewritten)` | Samma mönster som VoiceRecorder. **Inte** `handlePlanRequest` (den skickar). |
| Ny route `/api/ai/prompt-assist` | `/api/ai/brief` ger `siteBriefSchema`. `/api/ai/chat` är borta. |
| Ny lib `src/lib/builder/prompt-assist-pre-send.ts` | Inte `runner.ts` (B1 raderar) och inte `formatPrompt` (MÅL/TILLGÄNGLIGHET-spec). |
| Workload-id `prompt_rewrite` | Inte `prompt_assist` (för nära legacy `promptAssist`). |
| Env `SAJTMASKIN_PROMPT_REWRITE_MODEL` | Inte `SAJTMASKIN_ASSIST_MODEL` / `SAJTMASKIN_BRIEF_MODEL`. |
| Backoffice: `_render_other_route_models` | Inte `_render_assist_brief` («Assist / brief / polish» = Deep Brief). |

### Filer att röra

1. `ChatInterface.tsx` — knapp + handler
2. `ChatInterface.preview-modes.test.tsx` + ny `ChatInterface.prompt-assist.test.tsx` (utkast uppdateras, send anropas inte)
3. `src/app/api/ai/prompt-assist/route.ts` — `generateText` + fritext-JSON
4. `src/lib/builder/prompt-assist-pre-send.ts`
5. `config/ai_models/manifest.json` — `workloads[]`-post `prompt_rewrite`
6. `backoffice/pages/ai_models.py` — rad i `route_specs`
7. `config/env-policy.json` + `src/lib/env.ts` + `src/lib/gen/defaults.ts` (`getWorkloadDefaultModelFromManifest("prompt_rewrite")`)
8. `manifest-parity.test.ts` + `npm run docs:generate`
9. `docs/schemas/llm-role-matrix.md` — meningen «ingen rewrite» måste rättas; återinför inte `/api/ai/chat`

### Får inte ändras

`promptAssist.*`, `briefing.*`, `brief_structured`, `useInitBrief`, `SAJTMASKIN_ASSIST_MODEL`, `SAJTMASKIN_BRIEF_MODEL`, `isPromptAssistModelAllowed`, `post_generation_polish` (låst `false`), OpenClaw, `runner.ts` / addendum-syskon.

## Klart när

Knappen sitter bredvid Plan, utkastet uppdateras i rutan, modellvalet syns i
Backoffice som övriga steg, och glossaryn + runtime säger samma sak.
