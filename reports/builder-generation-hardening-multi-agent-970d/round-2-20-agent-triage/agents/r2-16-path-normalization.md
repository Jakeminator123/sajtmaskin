## R2-16 — Path normalization in follow-up merge

### Verdict

**Bug / medium confidence.** `mergeVersionFilesWithWarnings` keys by raw `f.path`; no canonicalization for `\` vs `/` or `app/` vs `src/app/`. Follow-up merge can retain duplicate logical files and bypass shrink/structural comparisons.

### Evidence

- `src/lib/gen/version-manager.ts`: `merged.set(f.path, f)` / `merged.get(f.path)`.
- `src/lib/gen/stream/finalize-merge.ts`: follow-up path calls this helper directly.
- Other areas normalize for membership (`path.replace(/\\/g, "/")`), but not this map.

### Severity / confidence

- Severity: **P2/P3** — silent duplicate-file corruption in edge cases.
- Confidence: **80%** for `app` vs `src/app`; **55%** for backslash from persisted JSON.

### Minimal fix

Use normalized map keys in `mergeVersionFilesWithWarnings`; preserve prior path spelling for output or choose one project convention.

### Triage tags

`merge-regression`, `path-normalization`, `follow-up`, `low-confidence`

**Model:** composer-2-fast (subagent)
