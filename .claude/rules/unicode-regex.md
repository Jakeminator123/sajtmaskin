---
paths:
  - "src/lib/gen/**"
  - "src/lib/providers/own-engine/**"
  - "src/lib/api/engine/**"
  - "src/lib/images/**"
  - "src/lib/builder/**"
  - "scripts/**"
---

<!-- Genererad av npm run claude:sync från .cursor/rules/unicode-regex.mdc — redigera källan, inte den här filen. -->

# Regex mot mänsklig text

JavaScripts `\b`/`\w` kan missa svenska ord. Använd `uWordRegex`/`uWord`
från `src/lib/utils/unicode-word-boundary.ts` för ordmatchning i mänsklig text.
ASCII-gränser är OK för filnamn, URL-paths, enum/config-värden och kodtoken.

`node scripts/dev/check-unicode-regex.mjs` körs även i preflight.
