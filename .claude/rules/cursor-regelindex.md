<!-- Genererad av npm run claude:sync från .cursor/rules/*.mdc (beskrivningsregler) — redigera källan, inte den här filen. -->

# Cursor-regler att läsa vid behov

Cursor visar de här reglernas beskrivning och agenten läser regeln när den
passar uppgiften. Gör likadant: läs filen när beskrivningen träffar.

| Regel | Läs när |
|---|---|
| `.cursor/rules/agent-observatory.mdc` | Läs när du ska säga vad som hände i en generation, preview, verifier eller autofix. |
| `.cursor/rules/agent-worktree.mdc` | Valfria git-worktrees. Läs när du skapar eller tar bort en worktree, eller när flera agenter ska skriva parallellt. |
| `.cursor/rules/local-tooling-mcp.mdc` | Cursor MCP-felsökning: läs faktisk konfiguration och kör doctor. |
| `.cursor/rules/pr-merge.mdc` | PR-grind: GitHubs status, reviews och rulesets äger mergebarhet. |
| `.cursor/rules/project-phase-priorities.mdc` | MVP-bias: hygien alltid; varna innan nya features; inga onödiga säkerhetslager. |
| `.cursor/rules/subagent-models.mdc` | Läs före subagent: modell från sessionens lista, reasoning-nivå och oberoende PR-review. |
| `.cursor/rules/terminology.mdc` | Läs när en Sajtmaskin-term är oklar eller när terminologisemantik ändras; gör riktade glossary-uppslag. |
