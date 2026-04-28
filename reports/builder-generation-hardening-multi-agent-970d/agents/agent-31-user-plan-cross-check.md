## Agent 31 — User Nordtak plan vs repo cross-check

### Agree (mot din inklistrade plan)

| Din punkt | Repo |
|-----------|------|
| TSX trunkeras med `// ... truncated` | `renderSelectedScaffoldFiles` / `renderScaffoldFiles` i `serialize.ts` |
| Trivial `app/page.tsx` + gate 200 tecken | `buildMissingHomeRouteIssue` + `measureRenderedContentLength` |
| `tryRecoverMissingHomeRoute` vid **befintlig** fil | Early return — **ingen** LLM-recovery för trivial home (se agent 02) |
| Inspirational layout cap | `Math.min(maxChars, 4_000)` för layout i inspirational mode |
| DOM-typer som JSX | `dom-builtin-jsx-fixer` finns redan i pipeline |
| `autofix.heavy_load` utan verifier-gate | `pre-phases.ts` loggar; ingen hård stopp i samma pass |

### Disagree / nuance

- Subagent blandade in **versionless chat / stream-abort recovery** — det är **annan** "recovery" än `HOME_ROUTE_RECOVERY` i preflight; ignorera för Nordtak-kedjan.  
- "Sänk DEFAULT_LIGHTWEIGHT till 10k" påverkar **inte** inspirational layout-blockets **4k**-tak (se agent 12).

### Confidence user root cause (%)

**70–85%** att kombinationen trunkerad scaffold-kontext + tung autofix + trivial home gate förklarar **din** beskrivna Nordtak-mermaid (inom repo-stödda mekanismer).

### Improvements

- Prioritera Prio 1 trunkering + Prio 3 trivial-home recovery enligt din plan.

**Model:** composer-2-fast (subagent)
