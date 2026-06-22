# Cursor-konfiguration i detta repo

## Agent: var börja?

Se [`docs/README.md`](../docs/README.md) — enda fulla navtabellen. Snabb ordning: `docs/README.md` → `docs/architecture/repo-tree.md` → `docs/plans/README.md` → `rules/terminology.mdc`.

## Workspace (en rot, samma verktygsinställningar)

- Öppna projektet med **`sajtmaskin.code-workspace`** i repots rot (en mapp: `.`), eller öppna själva **`sajtmaskin`**-mappen. Workspace-filen är **gitignorerad** (lokala inställningar). Om repot har en mall **`sajtmaskin.code-workspace.example`**, kopiera den till **`sajtmaskin.code-workspace`**; annars räcker det att öppna mappen eller skapa en enkel workspace-fil som pekar på **`.`**. Lägg inte till globala Cursor-sökvägar (t.ex. `%USERPROFILE%\.cursor\plans`, worktrees) som extra workspace-mappar om du vill undvika brus i Problems (markdownlint, sökning, m.m.).
- **Standard nu:** öppna huvudcheckouten `…\sajtmaskin` på `master` i ett eget fönster. Om du **medvetet** skapar ett separat worktree för isolering, öppna bara den checkouten i sitt eget fönster och ta bort worktreet när det inte längre bär unikt arbete.
- **VS Code / Cursor-delade** inställningar: **`.vscode/settings.json`**. **`sajtmaskin.code-workspace`** innehåller samma `settings`-block så att beteendet matchar oavsett om du öppnar mappen eller workspace-filen.
- **Endast Cursor**: **`.cursor/settings.json`** (t.ex. Vercel-plugin). Den ersätter inte `.vscode` för vanliga tillägg; håll verktygsignorer synkade mellan **`.vscode/settings.json`** och **`sajtmaskin.code-workspace`**.
- Markdown-projektkonfiguration: **`.markdownlint.json`**, **`.markdownlintignore`**. Filer *utanför* repot kräver i regel **User Settings** (`markdownlint.ignore`) eller att de inte ingår i workspace.

## Prioriteringsordning

1. **Slash-kommandon** överstyr generella regler när de körs.
2. **Generella regler** (`alwaysApply: true`) gäller i alla sessioner.
3. **Glob-triggrade regler** gäller automatiskt vid relevanta filändringar.
4. **Manuellt bifogade regler** gäller när användaren lägger till dem med `@`.
5. "Ta inte bort om du är osäker" gäller alltid — men enkelhet är ett självständigt mål (se `workflow.mdc § Städning och scope`).

## Projektregler (`.cursor/rules/*.mdc`)

### Generella (alwaysApply: true)

| Regel | Syfte |
|-------|-------|
| [agent-worktree.mdc](rules/agent-worktree.mdc) | Flera agenter delar working tree — använd `git worktree`, inte `git checkout`, så HEAD inte driver under användarens session |
| [auto-merge-automation.mdc](rules/auto-merge-automation.mdc) | En Cursor-side automation kan auto-merga gröna PR:er — håll risk-/runtime-PR:er som draft tills granskade |
| [repo-router.mdc](rules/repo-router.mdc) | Snabb repo-router + env/indexering |
| [response-format.mdc](rules/response-format.mdc) | Hur agenten svarar — kort, matris/flöde, svenska vid behov |
| [terminology.mdc](rules/terminology.mdc) | Snabb förväxlingstabell + signal-ownership; pekar till glossaryn |
| [workflow.mdc](rules/workflow.mdc) | Git, filstruktur, städning, verifiering — hur ändringar utförs |

### Glob-triggrade (aktiveras vid relevanta filer)

| Regel | Trigger | Syfte |
|-------|---------|-------|
| [env-flow-f2-mute.mdc](rules/env-flow-f2-mute.mdc) | engine/chats, own-engine, gen/preview, ProjectEnvVarsPanel | F2 får aldrig generera env-frågor — all env-trafik gates till F3 |
| [openclaw-bridge.mdc](rules/openclaw-bridge.mdc) | `.cursor/openclaw-bridge/**` | OpenClaw inbox/outbox (opt-in) |
| [pipeline-rules.mdc](rules/pipeline-rules.mdc) | backoffice, config/codegen, prompt-core, ai_models, scaffold-variants | Pipeline-enkelhet + docs/schemas/backoffice-sync vid LLM-flödesändringar |
| [plan-lifecycle.mdc](rules/plan-lifecycle.mdc) | `docs/plans/**`, `.cursor/bugs/**` | När planer ska skapas, parkas, avklaras och raderas |
| [scaffold-rules.mdc](rules/scaffold-rules.mdc) | gen/scaffolds, gen/orchestrate, gen/system-prompt, gen/build-spec, scripts/scaffolds | Agentregler vid scaffold-ändringar |

### Manuellt bifogade (alwaysApply: false, ingen glob)

| Regel | Syfte |
|-------|-------|
| [agent-observatory.mdc](rules/agent-observatory.mdc) | Var agenter hittar per-körning- och per-chat-loggar |
| [git.mdc](rules/git.mdc) | Inga PRs; commit/push/merge bara på explicit begäran |
| [platform-quirks.mdc](rules/platform-quirks.mdc) | Windows/PowerShell och repo-specifika fallgropar |
| [unicode-regex.mdc](rules/unicode-regex.mdc) | Regex för mänsklig text — alltid Unicode-medveten, aldrig ASCII `\b` |
| [useful-commands.mdc](rules/useful-commands.mdc) | Snabb kommandoöversikt; `package.json` är kanonisk källa |

I chat: bifoga en regel med `@` + sökväg, t.ex. `@.cursor/rules/terminology.mdc`.

## Terminologi

**Kanonisk ordlista:** [`docs/architecture/glossary.md`](../docs/architecture/glossary.md) — alla ~100 begrepp med livscykelstatus, namnskuggor, fasindelning.

**Snabb förväxlingstabell:** [rules/terminology.mdc](rules/terminology.mdc) — kort version med de vanligaste felen.

I chat: `@terminology` eller `@.cursor/rules/terminology.mdc`.

## Schemas

**Human-readable:** [`docs/schemas/`](../docs/schemas/) — kontrakt och fältformer för människor.

**Strict (machine-readable):** [`docs/schemas/strict/`](../docs/schemas/strict/) — JSON schemas för tooling och validering.

Kod är source of truth; strict schemas speglar kod, ersätter den inte.

## Slash-kommandon (`.cursor/commands/*.md`)

- `/818` = **en** fråga, **åtta** parallella read-only Composer-agenter (korta röster, gärna %), du sammanfattar, gör **minimal** ändring, verifierar, **review-pass** på diffen. Snabbare än `/långbänk`. Se `.cursor/skills/818-swarm-decide/SKILL.md`.
- `/avslutning` = stäng arbete: review, scoped cleanup, docs-/schema-/backoffice-sync, verifiering, commit + push. Hanterar både vanligt slutpass och stängning av hela arbetsspår.
- `/buggrapport` = skapa Linear-issue i team Sajtmaskin med label Bug + lokal mirror i `.cursor/bugs/`.
- `/långbänk` = lång orkestrator-session där flera tunga subagents körs **parallellt** över olika spår med rätt modell per spår, sedan sammanfattning + glasklar-fixar + verifiering + leverans. Tar en mapp som underlag eller frågar dig om scope. Förvänta 20–60 min wall-clock.

## Backoffice

**Kanonisk Streamlit-app:** `backoffice/` (sidmoduler, delad logik i `backoffice/shared.py`).

**Entrypoint:** `npm run backoffice` från repo-rot (kanonisk, plattformsoberoende). Direktanrop `python(3) sajtmaskin_backoffice.py` fungerar också.

**Domänkarta:** `config/dashboard/domain-map.json` — mappar backoffice-vyer till kanoniska sökvägar, docs och kodsanningar. (Mappnamnet `dashboard/` är legacy; bara domänkartan bor kvar där.)

## Flera agenter / parallellt arbete

- Jobba i huvudcheckouten på `master` med en git-root per fönster.
- Separera commits: docs, tooling och kod i egna commits.
- Verifiera före push: `npm run typecheck` + `npx vitest run`.
- **Konfliktzoner** (stäm av om två spår rör dessa samtidigt): `src/lib/gen/*`, `src/lib/providers/own-engine/*`, `src/lib/hooks/chat/*`, `src/lib/env.ts`, `src/lib/config.ts`, kanoniska arkitekturdocs.

## MCP (`mcp.json`)

Valfria repo-/plattforms-MCP: **`shadcn`** (repo-local för Cursor via `npx shadcn@latest mcp`) samt vid behov v0, Vercel, OpenAI-docs och ev. `openclaw-docs` på användarnivå. Detta är **IDE-lokal utvecklarintegration**, inte runtime för own-engine-genereringen. Repoets `components.json` använder preset `radix-vega` med `@shadcn` pinnad till den stilbundna live-registryn, så att Cursor-MCP:n kan lista och visa samma registry-items som buildern använder. **Hur Sajtmaskin fungerar** läses i **`docs/`**, `.cursor/rules/` och `sajtmaskin-context`-skillen.

**GitHub:** `.cursor/mcp.json` är **ignorerad**; kopiera `.cursor/mcp.json.example` → `.cursor/mcp.json` och ta bort de MCP:er du inte använder lokalt.
