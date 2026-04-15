---
name: builder-flow-polish
description: >-
  Launches 8 parallel READ-ONLY agents that each review one stage of the
  Sajtmaskin user flow (landing, wizard, builder shell, chat, preview,
  generation overlay, templates, design system) against Apple-like minimalist
  design principles. Each agent scores every checklist item 1-5 and writes
  a review to reviews/. NO code changes are made.
  Use when user says "polish", "Apple-design", "minimalistisk", "designpass",
  "köra polishsvärmen", or wants a full-flow UX review.
---

# Builder Flow Polish Swarm

Launch **8 parallel Task agents** (readonly) that each review one stage of the
user flow. Every agent **reads and scores** the current implementation against
the design checklist, then writes a `.txt` review to `reviews/`.

**CRITICAL: Agents do NOT edit any code. They only read, review, and write reports.**

## When to use

- User wants a design/UX review pass across the builder flow.
- User says "polish", "designpass", "köra polishsvärmen", "Apple-design", "minimalistisk".
- After a feature sprint to identify visual inconsistencies before fixing.

## Design principles (review criteria)

1. **Apple-minimalist**: clean, airy, generous whitespace, one primary action per view.
2. **Color**: CSS variables only — `--background`, `--foreground`, `--primary`, `--muted-foreground`, `--card`, `--border`. No hardcoded hex/Tailwind color classes.
3. **Typography**: limited scale, strong heading/body contrast, minimal text.
4. **Surfaces**: rounded-2xl or rounded-3xl cards, subtle `border-white/10`, `bg-white/5` overlays.
5. **Motion**: short ease transitions (150-200ms), no constant loops except deliberate CTA pulse. Respect `prefers-reduced-motion`.
6. **CTAs**: orange primary, subtle shadow-primary glow, rounded-xl.
7. **Copy**: Swedish, imperative, short. "Fortsätt", "Spara", "Bygg".
8. **Clutter rule**: if it doesn't aid the next step or comprehension, remove or hide it.

## Scoring system

Each checklist item gets a score:

| Score | Meaning |
|-------|---------|
| 5 | Excellent — meets or exceeds the design principle |
| 4 | Good — minor polish opportunity |
| 3 | Acceptable — noticeable room for improvement |
| 2 | Needs work — clearly falls short of the standard |
| 1 | Poor — significant rework needed |

## Pre-flight

```bash
mkdir -p reviews
```

Note current date for filenames.

## The 8 agents

Launch **all 8 as parallel Task calls** in a single message.
Each uses `subagent_type: "explore"` (read-only, no write access).

Every agent prompt MUST include:
- The **full scope, key files, and checklist** from its section below.
- The **design principles** above (copy them into the prompt).
- The **scoring system** (1-5 scale).
- Instruction: **DO NOT edit any files. Read-only review.**
- Instruction to write review to `reviews/<NN>-<slug>-<date>.txt`.
- Instruction to return a one-paragraph summary with the average score.

---

### Agent 1 — Landing & Hero (`01-landing`)

**Scope:** `src/app/page.tsx`, `src/components/landing-v2/`

Checklist (score each 1-5):
- Hero clarity: one calm screen, one clear CTA, minimal text, generous whitespace.
- Clutter level: excess decorative elements, competing CTAs, dense feature grids above fold.
- Primary CTA: orange glow + rounded-xl.
- Background: subtle, not distracting — no heavy animations by default.
- Navbar: clean, slim, transparent or frosted glass effect.
- Footer: minimal, muted.
- Mobile: full-width touch targets, no hover-only affordances.
- Color tokens: all colors via CSS variables, no hardcoded hex.

---

### Agent 2 — Intake Wizard (`02-wizard`)

**Scope:** `src/components/builder/IntakeWizard.tsx`

Checklist (score each 1-5):
- Dialog surface: frosted glass backdrop, generous padding, clean card.
- Step indicators: refined, minimal — small dots or thin progress bar.
- Form fields: consistent rounded-xl, subtle borders, clear focus states.
- Category grid: clean cards with gentle hover transitions.
- Scrape success panel: clean checkmark list, no visual noise.
- Badge styling: subtle, non-distracting.
- Buttons: orange primary CTA, ghost secondary, disabled state clear.
- Mobile: full-width inputs, adequate tap targets.
- Typography: minimal labels, clear hierarchy.

---

### Agent 3 — Builder Shell & Chrome (`03-builder-shell`)

**Scope:** `src/app/builder/BuilderShellContent.tsx`, `src/app/builder/BuilderLayout.tsx`, `src/components/builder/BuilderHeader.tsx`

Checklist (score each 1-5):
- Header: slim, clean, no dense toolbars — logo + project name + minimal actions.
- Layout: preview dominates, chat secondary. Clear visual separation.
- Chrome density: non-essential chrome collapsed behind clean toggles.
- Transitions: wizard → chat → preview feel smooth.
- Loading/empty states: clean, centered, minimal text.
- Error states: clear, actionable, Swedish text.
- Surface consistency: rounded corners and border tokens throughout.

---

### Agent 4 — Chat Interface (`04-chat`)

**Scope:** `src/components/builder/ChatInterface.tsx`, `src/components/builder/MessageList.tsx`, `src/components/builder/FloatingChatBox.tsx`

Checklist (score each 1-5):
- Message bubbles: clean rounded cards, subtle differentiation user vs assistant.
- Input area: clean, minimal, one clear send button.
- Streaming state: subtle typing indicator, not flashy.
- Tool calls / structured parts: collapsed by default, clean expand.
- Action buttons within chat: ghost style, small, non-distracting.
- Scroll behavior: smooth, no jarring jumps.
- Picker popups: clean, rounded, well-spaced.

---

### Agent 5 — Preview Panel (`05-preview`)

**Scope:** `src/components/builder/preview-panel/`

Checklist (score each 1-5):
- Chrome/toolbar: minimal — device toggles + URL bar + refresh, nothing more.
- Empty state: clean illustration or text, not dense.
- iframe wrapper: subtle border/shadow, feels like a real device frame.
- Code view: clean syntax highlighting, minimal tab chrome.
- Edit overlays: subtle, non-blocking.
- Route navigation: clean breadcrumb or tab bar.
- Loading states: smooth skeleton or spinner, not jarring.

---

### Agent 6 — Generation Progress & Overlays (`06-generation`)

**Scope:** `src/components/builder/preview-panel/GenerationProgress.tsx`, `src/components/builder/ThinkingOverlay.tsx`, `src/components/builder/GenerationSummary.tsx`

Checklist (score each 1-5):
- Progress bar: slim, smooth animation, clear phase labels.
- Thinking overlay: clean, centered, calm — rotating tips in muted text.
- Generation summary in chat: compact, clean card, collapsed details.
- Animation noise: no excessive animation during generation.
- Phase transitions: smooth fade, no abrupt jumps.
- Copy: Swedish, short, informative.

---

### Agent 7 — Templates & Gallery (`07-templates`)

**Scope:** `src/app/templates/page.tsx`, `src/app/category/[type]/page.tsx`, `src/components/templates/`, `src/components/builder/TemplatePickerPopup.tsx`

Checklist (score each 1-5):
- Template cards: clean rounded surfaces, consistent aspect ratios, subtle hover.
- Category page: clean grid, minimal filtering UI.
- Preview modal: full-screen, clean, immersive.
- In-builder picker: clean popup, good search, quick selection.
- Typography: template names prominent, descriptions muted.
- Mobile: 1-column grid, swipeable cards.

---

### Agent 8 — Design System & Cross-cutting (`08-design-system`)

**Scope:** `src/app/globals.css`, `tailwind.config.cjs`, `src/styles/landing-v2.css`, `src/components/ui/`, `src/app/layout.tsx`

Checklist (score each 1-5):
- CSS variables: complete set (background, foreground, card, primary, muted, border, radius).
- Hardcoded colors: none in globals/landing CSS.
- Font loading: clean, no FOUT.
- Global transitions: `transition-colors` and `transition-all` consistent.
- Dark mode: navy background palette consistent everywhere.
- shadcn components: consistent with project tokens.
- Cookie banner, beta banner: clean, minimal, non-intrusive.
- Scrollbar styling: subtle or hidden.

---

## Review format

Each agent writes a `.txt` file:

```
═══════════════════════════════════════════════════
  BUILDER FLOW POLISH REVIEW — <AREA NAME>
  Date: <YYYY-MM-DD>
═══════════════════════════════════════════════════

## Scores

| # | Item                        | Score | Notes                          |
|---|-----------------------------| ------| -------------------------------|
| 1 | <checklist item>            |  4/5  | <brief observation>            |
| 2 | <checklist item>            |  2/5  | <brief observation>            |
...

Average: X.X / 5

## Top improvements (prioritized)

1. <most impactful improvement> — File: <path>, line ~N
2. <second improvement> — File: <path>, line ~N
3. ...

## What already works well

- <positive observation>
- <positive observation>
```

## After all agents

1. Read all 8 `.txt` reviews from `reviews/`.
2. Summarize: overall average score, per-area scores, top 5 improvements across all areas.
3. Present results to the user as a table.

## How to re-run

> **Köra polishsvärmen igen**

or

> **Nästa polish-pass**

Reviews accumulate in `reviews/` with date-stamped filenames.

For a focused review on specific areas only, say e.g.:

> **Polish bara wizard och preview**

## Notes

- Agents are **READ-ONLY**. They do NOT edit code.
- Reviews go to `reviews/` — gitignore or treat as ephemeral.
- All scoring is relative to the design principles above.
- After reviewing results, the user decides which improvements to implement.
