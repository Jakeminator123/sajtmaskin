# Design Priority (Directive Cascade)
<!-- directive: design-priority -->
<!-- cascade: N/A — this directive defines the cascade itself -->

When multiple sources suggest different colors, fonts, or visual direction, follow this resolution order. This hierarchy applies to ALL design decisions, not just colors.

## Resolution Order

1. **User-locked theme tokens** (if set in builder UI) — absolute, never override.
2. **Brief visual direction** (colorPalette, typography, tone, domainProfile) — primary design intent from the LLM-generated brief or user input.
3. **Scaffold Variant defaults** (theme tokens, font pairings, signature motif, style rules) — fallback when brief is silent on a design aspect.
4. **Directive defaults** — placeholder values in the directive files (this folder). Used when neither brief nor variant provides guidance.

## Practical Examples

- Brief says `primary: "#B8860B"` (dark goldenrod) + variant says `primary: oklch(0.6 0.15 250)` (blue) → use the brief's goldenrod.
- Brief is silent on fonts + variant says "Playfair Display + Source Sans 3" → use the variant's fonts.
- Brief is silent on fonts + no variant → use the directive default (choose a Google Font pairing that matches the site's subject).
- User locked `--primary: #FF0000` in builder UI → use red regardless of brief or variant.

## Conflict Resolution

- Never mix signals from different cascade levels for the same design property. If the brief provides a partial palette (only `primary`), use the variant for `secondary` and `accent` — do not invent unrelated colors.
- When variant `styleRules`, `sectionInventory`, or `avoidPatterns` are present, treat them as level 3 (variant defaults) — they yield to brief-derived guidance but override directive defaults.
