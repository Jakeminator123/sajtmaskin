---
id: llm-tools-builder-spar
status: scope
created: 2026-04-28
linear: null
parent: 2026-04-28-llm-flode-startlinje
supersedes: null
---

# LLM-tools för builder — scope

Spår som utforskar deterministiska builder-tools som ett alternativ till att låta codegen-LLM gissa hela route/dependency/scaffold-ytan. Målet är **mindre LLM-flöde, mer deterministisk styrning** — i linje med [`docs/architecture/llm-flow-target-worldclass.md`](../../architecture/llm-flow-target-worldclass.md).

Denna fil är **bara scope/plan**. Inga kodändringar levereras innan vi enats om vilka 2–3 tools som ska implementeras först.

## Bakgrund

Senaste session 2026-04-28 (chat `52031a6d-4edb-42f1-8deb-f6228486b2fa`) visade följande problem som tools potentiellt löser bättre än prompt-instruktioner:

| Problem | Bevis i loggarna |
|---|---|
| LLM gissar route-paths och importer som inte matchar filsystemet | `cross-file-import-checker.rewireTarget` i version `803b0845` |
| Capability hänger kvar (3D) trots att användaren bad om "ta bort" | `dossiers_selected.byCapability: { "visual-3d": ["three-fiber-canvas"] }` på flera follow-ups |
| qualityTarget sänks via inheritance | `quality_target_inherited_from_prior_version from premium to standard` |
| LLM-stream-output har ofta 30+ autofixes på enkla prompts | `autofix.heavy_load fixCount: 37` på Nordtak-init |

Tools skulle göra "ta bort 3D", "lägg till route", "höj qualityTarget" till **deterministiska anrop**, inte prompt-gissningar.

## Designprinciper

1. **Tools ska vara små och idempotenta.** Ingen "build me a website"-tool. Bara mekaniska builder-operationer.
2. **F2 vs F3 har olika tillåtna tools.** F2 får aldrig env/integrationer-tools (env-flow-mute-regeln gäller).
3. **Tool-call ≠ ny LLM-runda.** En tool body måste vara deterministisk eller kallad från samma codegen-stream.
4. **Failmode: fail-loud, inte fail-silent.** Stub-creation taught us not to silently null-render.
5. **Inga tools rör user-projektets `package.json` utan explicit signal.** All dep-injection går via existerande `dep-completer`.

## Föreslagna tools (rangordnade efter värde / risk)

| # | Tool | Body | Var i pipeline | Värde | Risk |
|---|---|---|---|---|---|
| 1 | `addRoute({ path, mode: "shell"|"full", purpose? })` | Skapar route-shell ELLER lägger till i route-plan för LLM-emission | Pre-codegen + finalize-merge | Hög: löser "lägg till /onas-skro" deterministiskt | Låg |
| 2 | `removeCapability(id)` | Tar bort capability från brief, dossiers, deps, prompt-context | Pre-codegen | Hög: löser "ta bort 3D"-spöket | Medel |
| 3 | `setQualityTarget("standard"|"premium")` | Override base-spec qualityTarget för aktuell turn | Pre-codegen | Medel: explicit "snyggare"-knapp | Låg |
| 4 | `addCheckoutDemoUI()` | Genererar UI-only checkout (ingen Stripe, ingen env) | Codegen | Medel: F2-säker checkout | Låg |
| 5 | `pickScaffoldVariant({ briefHints })` | Deterministisk variant-pick istället för LLM-gissning | Pre-codegen | Hög för design | Medel |
| 6 | `validateGeneratedFiles()` | Kör typecheck/syntax/route-check och returnerar strukturerade findings till modellen | Mid-codegen | Hög: real feedback i samma stream | Hög (kostnadsökning + loop-risk) |
| 7 | `materializeShadcnComponent(name)` | Säkerställ shadcn-import + filresolution | Mid-codegen | Låg-medel: minskar import-validator-arbete | Låg |

## Rekommenderad första våg

| Wave | Tools | Motivering |
|---|---|---|
| **Wave 1** | `removeCapability` + `addRoute` | Direkt löser två P0-bugs från 2026-04-28 (3D-spöket, route-buggen). Båda kan implementeras som pre-codegen mutations utan att röra själva LLM-streamen. |
| Wave 2 | `setQualityTarget` + `pickScaffoldVariant` | Designkvalitet — komplement till PR-D2 (qualityTarget premium-sticky). |
| Wave 3 | `addCheckoutDemoUI` | F2-säker UI-pattern. |
| Wave 4 (kräver utvärdering) | `validateGeneratedFiles` | Hög potentiell vinst men loop-risk; behöver eval-baseline + tight loop-cap. |

## Tekniska val (att besluta innan implementation)

| Val | Alternativ | Rekommendation |
|---|---|---|
| Tool-framework | (a) AI SDK `tools` på codegen-stream, (b) MCP-server, (c) deterministisk pre-/post-stream pipeline | **(c) först** — tools körs som builder-operationer i orchestrate, inte som LLM-tool-calls. Mindre risk, ingen ny event-yta. |
| Tool-trigger | (a) UI-knapp, (b) prompt-pattern-detection, (c) explicit `tool:`-syntax i prompt | (a) + (b) hybrid — UI-knapp för obvious actions, prompt-detection för vanlig naturlig syntax ("ta bort 3D") |
| Tool-yta | (a) Bara builder-API, (b) även LLM ser tools | (a) först — bevisa värdet utan att blanda upp LLM-kontexten |
| Observability | (a) DevLog-event, (b) Backoffice-panel | Båda — `tool.invoked` event + `backoffice/pages/llm_tools_telemetry.py`-panel |

## Implementationsteg (Wave 1, exempel)

```
1. Definiera `BuilderTool`-typ i `src/lib/builder/tools/types.ts`
2. Implementera `removeCapability` som pre-codegen mutation:
   - removar från `brief.requestedCapabilities`
   - removar från `selectedDossiers`
   - removar från package.json deps om unika till capability
   - emitterar `tool.invoked { tool: "removeCapability", capability, removedDeps }`
3. Implementera `addRoute` som pre-codegen mutation:
   - lägg till i route-plan
   - skapa shell om mode === "shell"
   - emitterar `tool.invoked`
4. Wire upp i `orchestrate.ts`: efter capability-detection, kolla om aktuell prompt
   matchar `removeCapabilityPattern` eller `addRoutePattern`, kalla tool.
5. Backoffice: ny panel som listar `tool.invoked`-events.
```

## Risker

| Risk | Mitigation |
|---|---|
| Tools blir prompt-injection-yta | Tools kallas bara av orchestrate efter intent-classification, inte direkt av LLM-output |
| Tools förvirrar status-modellen | Varje tool-invocation får eget event-typ, inte blandat med `version.created` |
| Tool-loops om validateGeneratedFiles körs som LLM-tool | Hard cap (max 1 retry), eval-gate innan deploy |
| User förstår inte vad som händer | UI-feedback "Tool: removeCapability(visual-3d) — 4 deps borttagna" |

## Out of scope (denna fil)

- Implementation av tools — bara plan/scope.
- MCP-integration — det är ett separat beslut.
- LLM-tool-calling i codegen-stream — det är Wave 4+.

## Definition of done för denna scope-doc

- [ ] Användaren har bekräftat Wave 1-listan eller justerat den.
- [ ] Wave 1-tools har egna implementation-plans i `docs/plans/active/`.
- [ ] Glossary uppdaterad med termen `builder tool` när första tool implementeras.
- [ ] Linear-issue skapad för Wave 1 (om behövs).
