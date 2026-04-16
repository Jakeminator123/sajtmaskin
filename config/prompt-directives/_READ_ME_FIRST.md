# Prompt Directives (this folder)

These `.md` files are **adaptive prompt modules** — the part of the codegen system prompt that varies per request through the **Directive Cascade**.

## What is a Directive?

A directive is a markdown file containing prompt guidance with **placeholder defaults**. At generation time, the system resolves each directive through a 4-level cascade:

1. **EXPLICIT** — The brief or prompt provides an exact value (e.g., `colorPalette.primary: "#B8860B"`).
2. **INDICATED** — Strong signal in the prompt that the Brief-LLM interprets (e.g., "hårdrocksband" → dark palette).
3. **INFERRED** — Deterministic heuristics in `guidance-resolvers.ts` (e.g., keyword matching for domain/motion).
4. **DEFAULT** — The placeholder text in this directive file. Used when nothing else provides guidance.

## File Format

Each directive uses HTML comments for metadata:

```markdown
# Directive Title
<!-- directive: directive-name -->
<!-- cascade: explicit > indicated > inferred > default -->

## Section
<!-- default: value-name -->
Content here...
```

- `<!-- directive: name -->` — Canonical name, must match the manifest entry.
- `<!-- cascade: ... -->` — Documents which cascade levels apply.
- `<!-- default: value -->` — Labels the default value for that section.

## How Directives Differ from Core Rules

| Aspect | Core Rules (`prompt-core/`) | Directives (`prompt-directives/`) |
|--------|---------------------------|----------------------------------|
| Varies per request? | Never | Yes, through the cascade |
| Contains placeholder values? | No | Yes |
| Editable in backoffice? | Yes | Yes |
| Examples | Tech stack, output format, a11y | Visual design, motion, domain hints |

## Editing

1. Open `config/codegen-directives-manifest.json` — directive order matters for priority.
2. Edit the relevant `.md` file in this folder.
3. Use the backoffice "prompt-directives" page for a richer editing experience.
4. The directive loader uses file mtimes — no rebuild required for text changes.

## Relationship to guidance-resolvers.ts

The TypeScript functions in `src/lib/gen/guidance-resolvers.ts` (`inferMotionProfile`, `resolveVisualIdentityGuidance`, etc.) serve as **level 3 (INFERRED)** resolvers. They provide deterministic fallbacks when the brief doesn't cover a directive's domain. The directive file text is level 4 (DEFAULT) — used only when all other levels are silent.
