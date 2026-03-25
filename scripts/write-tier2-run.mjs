import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const r = path.join(root, ".cursor/orchestrator/run/2026-03-26-tier2-continue")

function write(rel, s) {
  const p = path.join(r, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, s, "utf8")
}

write(
  "ROADMAP.md",
  `# ROADMAP — 2026-03-26-tier2-continue

## Tier
**Tier 2** — \`track-plans/\`; parallella tier-3 workloads när filer inte överlappar.

## Mål
1. UTF-8-literaler i \`landing-chat-data.ts\` (ersätt \`\\u00XX\` i strängar).
2. Ny \`src/lib/integrations/registry.ts\` — typer + minst 6 poster i linje med \`detect-integrations.ts\`.

## Parallell (säkert)
| Spår | Fil |
|------|-----|
| A | \`landing-chat-data.ts\` |
| B | ny \`registry.ts\` |

## Acceptance
- \`npm run typecheck\` grönt.
`,
)

write("ORCHESTRATOR_LOG.md", "# ORCHESTRATOR_LOG\n\n| Tid | Händelse |\n|-----|----------|\n| Start | Run skapad; två parallella tier-3 uppdrag. |\n")

write(
  "track-plans/01-landing-polish.md",
  `# Track 01 — landing polish\n\nROADMAP: ../ROADMAP.md\n\nWorkload: ../workloads/03-01-utf8-landing-data.md\n`,
)

write(
  "track-plans/02-integration-registry.md",
  `# Track 02 — integration registry\n\nROADMAP: ../ROADMAP.md\n\nWorkload: ../workloads/03-02-integration-registry.md\n`,
)

write("workloads/03-01-utf8-landing-data.md", "# 03-01\n\nUtför UTF-8-normalisering i landing-chat-data.ts.\n")

write("workloads/03-02-integration-registry.md", "# 03-02\n\nSkapa registry scaffold.\n")

console.log("written", r)
