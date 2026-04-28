## Agent 01 — Scaffold serialization truncation

### Sources read

- `/workspace/src/lib/gen/scaffolds/serialize.ts` (full file; truncation logic in `renderSelectedScaffoldFiles` and `renderScaffoldFiles`)

### Finding

| Function | When `// ... truncated` appears | Mechanism (cited) |
|----------|--------------------------------|-------------------|
| `renderSelectedScaffoldFiles` | Next full fenced block would exceed `maxChars`; `remaining = max(0, maxChars - usedChars - 200)` and **`remaining > 200`** | First `remaining` characters of `file.content`, then newline + `// ... truncated` inside the same fenced block; may append “omitted for prompt budget” for later files. See ```247:257:/workspace/src/lib/gen/scaffolds/serialize.ts``` |
| `renderScaffoldFiles` | Only when **`usedChars === 0`** (first file alone exceeds budget) | `file.content.substring(0, maxChars - 200)`, then `// ... truncated` in the fence; then “omitted for length” if more files exist. See ```272:282:/workspace/src/lib/gen/scaffolds/serialize.ts``` |

Shared pattern: fence is `` ```${inferLang(file.path)} file="${file.path}"\n `` + truncated body + `\n// ... truncated\n` + closing fence (see ```246:251:/workspace/src/lib/gen/scaffolds/serialize.ts``` and ```274:275:/workspace/src/lib/gen/scaffolds/serialize.ts```).  
Note: in `renderScaffoldFiles`, if **`usedChars > 0`** and the next file does not fit, there is **no** partial file + `// ... truncated`—only the omission line and `break` (```272:282:/workspace/src/lib/gen/scaffolds/serialize.ts```).

### Likely root cause link to Nordtak-style failure

Prompt-visible scaffold TSX can end **mid-AST** (unclosed JSX/braces/imports). The model may mirror that shape or miss structure that existed only **after** the cut, producing **parse/type errors**, broken layout, or “half components” consistent with **Nordtak-style** broken builds when the bad example is layout/globals/page-level.

### Confidence this explains user failures (%)

**35–50%** — plausible for budget-truncated critical paths; not exclusive of merge rules, verifier gaps, or model drift.

### World-class improvements (bullets)

- Truncate at **safe boundaries** (e.g. last full line, or AST-aware chunking for TSX) instead of raw `slice`/`substring`.
- Prefer **omitting whole files** with an explicit “not shown—see tree” over **mid-file** truncation for `layout`/`page`/`globals`.
- **Telemetry**: log when truncation fires (path, `remaining`, mode) to correlate with bad generations.
- Align `renderScaffoldFiles` with `renderSelectedScaffoldFiles`: optionally **partial last file** when `usedChars > 0` instead of silent skip + omission only.

### Notes on .cursorignore / missing local logs

`.cursorignore` was **not** read in this pass; local prompt dumps / generation logs under ignored paths were **not** opened—findings are **code-only** from `serialize.ts`.

**Model:** composer-2-fast (subagent)
