---
name: sajtmaskin-builder-ux
description: >-
  Guides frontend/UI/UX work for Sajtmaskin’s guided builder: minimalist hero intent,
  Swedish Starter vs Professional modes, preview-first layouts, proactive chat, Apple-like
  visuals (rounded cards, subtle pulse, navy/orange tokens), and alignment with own-engine
  without changing backend contracts. Use when designing or implementing landing → mode
  → builder flows, onboarding, builder chrome reduction, or UX copy in Swedish.
---

# Sajtmaskin Builder UX (guided experience)

This skill condenses eight parallel UX research passes (hero/intent, mode labels, Starter layout, Professional layout, visual system, backend alignment, flow/IA, Swedish copy). Use it when designing or implementing the **two-step entry** (intent → mode) and **mode-specific builder chrome**.

## When to apply

- Landing/hero: user picks **what** to build before free text or heavy options.
- Step two: **Starter** vs **Professional** (Swedish labels; see below).
- Builder: **Starter** = preview + one proactive chat; **Professional** = same chat + optional advanced surfaces.
- Visual polish: Apple-like minimalism, rounded surfaces, optional pulse on primary CTAs, semantic colors only.
- Copy: short Swedish UI text; avoid vague or English-only errors.

## Read with

- `.cursor/rules/terminology.mdc` — own-engine, mallgalleri vs template-library, preview vs sandbox.
- `.cursor/skills/sajtmaskin-context/SKILL.md` — domain guardrails.

Do **not** change backend routes or data contracts from this skill; UX maps *onto* existing capabilities.

---

## 1. Hero — intent (step one)

**Goal:** One calm screen, one commitment: *what* the user is building.

- One headline + one subline; no competing CTAs, carousels, or feature grids in the hero fold.
- Primary action: explicit **choice of intent** (4–6 mutually exclusive options): large cards or compact segmented control — not a long dropdown as the default.
- Plain Swedish labels users would say aloud; avoid English growth jargon unless the audience expects it.
- Require explicit selection before “Fortsätt”; disable or ghost the primary button until chosen.
- One-line **outcome** per option (e.g. what the site will *do*) so the choice feels concrete.
- Mobile-first: full-width touch targets; no hover-only affordances.
- At most one subtle trust line on step one; defer logos/stats to later steps.
- After selection, one-line confirmation (“Du bygger: …”) before the next step.
- Defer free-text prompt, style pickers, and integrations until intent is locked.

---

## 2. Mode — Starter vs Professional (step two)

**Screen title (suggestion):** `Välj arbetssätt`  
**Subline (suggestion):** `Två nivåer – samma kvalitet, olika omfattning.`

| Mode | Swedish label options | One-line promise |
|------|----------------------|------------------|
| Simple | **Starter** eller **Grund** | Allt du behöver för att komma igång snabbt, utan onödig komplexitet. |
| Advanced | **Professional** eller **Pro** | Fler verktyg och inställningar när du vill forma lösningen i detalj. |

- Optional reassurance: “Du kan byta senare om behoven ändras.”
- Primary CTA: `Fortsätt` · Secondary: `Tillbaka`

---

## 3. Starter layout (builder)

- **Preview** dominates the viewport; **one chat** beside or below — not competing for attention.
- **Show:** live preview, single thread, input, minimal status (loading / ready), one clear primary action when it matters.
- **Hide:** Secondary nav, deep settings, version history, file tree, dev tools, dense toolbars, billing/credits in the default path, raw logs, API/debug surfaces.
- Chat voice: **proactive** — suggest next steps, clarify goal, offer options; not passive “skriv här”.
- Prefer short choices and suggested replies over open-ended only.
- Lightweight progress: “vad vi bygger”-summary or small step hint — not a heavy wizard.
- Errors: plain Swedish recovery **in chat**; no stack traces or internal IDs.
- One **“Mer” / “Avancerat”** entry that reveals Professional chrome only on explicit intent.
- Mobile: preview first; chat as bottom sheet or full-screen when typing.
- Success: preview visible + short confirmation + obvious next (publish/share) without pipeline jargon.

---

## 4. Professional layout (builder)

- **Same core as Starter:** one primary chat surface.
- **Pro rail:** slim edge control (icon or “Pro”) opens advanced tools without leaving the chat mental model.
- **One panel at a time:** model, scaffold, deploy, etc. behind clear labels — grouped by task (**Generera · Struktur · Publicera**), not internal system names.
- Progressive disclosure: defaults + remembered choices; drill-in on demand.
- Deploy as **late-stage** when it matters, not permanent chrome.
- Keyboard: quick toggle for pro rail (power users).
- **Escape hatch:** one click returns to chat-only and collapses panels.

---

## 5. Visual system

- Few elements, clear hierarchy; **one primary action** per view when possible.
- **Rounded corners** on cards — use a single radius token; light border or hairline shadow only if needed.
- Typography: limited scale; strong heading/body contrast.
- **Colors:** navy / orange / white **only via CSS variables** (background, surface, text, border, accent, CTA) — no ad-hoc hex in new UI.
- **Pulse:** subtle, low amplitude, slow on key CTAs; respect `prefers-reduced-motion`.
- Icons: simple; avoid busy hero illustrations behind primary controls.
- Motion: short ease transitions; no constant loops except deliberate CTA pulse.
- **Clutter rule:** if it doesn’t aid the next step or comprehension, remove it.

---

## 6. Backend alignment (UX only — no API changes)

Map user-facing steps to existing capabilities **conceptually**:

- Structured answers in chat → **brief** / seed for generation.
- Chat surface → **streaming** states (thinking, partial text, recoverable errors) in user language.
- Structure choice → **scaffold** / catalog baseline when applicable.
- “See it running” → **preview / sandbox** readiness and refresh semantics.
- Publish → **async** stages with clear failure/recovery.
- **Intent classification** (build vs help vs deploy) — keep one mental model per message.
- Persist minimal **canonical state** (intent, mode, project/chat ids) via URL where possible; session as backfill.
- Destructive or costly actions → explicit confirmation aligned with backend prechecks.
- Terminology: **preview** vs published site **mirrors** lifecycle stages in code/docs.

---

## 7. Flow & information architecture

- **Beats:** hero (intent) → mode → builder — avoid extra hubs unless they reduce errors.
- **URL first:** encode intent + mode in query (or short path) when stable and shareable; session mirrors for long/sensitive values.
- **Builder entry:** one transition; pre-fill from intent + mode without re-asking.
- **Recovery:** if params missing, light “fortsätt där du slutade” only when session matches same journey.
- **Analytics:** tag steps with intent + mode for funnels without adding navigation depth.

---

## 8. Swedish microcopy

- Buttons: imperative, clear (`Spara`, `Fortsätt`, `Skicka`) — not vague (`OK`).
- One primary action per screen; secondary neutral (`Avbryt`, `Tillbaka`).
- Errors: what happened + what to do next — not only “något gick fel”.
- Loading: concrete (`Sparar…`, `Genererar…`); if slow, set expectation (“kan ta några sekunder”).
- Tone: “du”, active voice, one sentence when enough.
- **Avoid:** empty “Oops”, English-only errors (`Invalid`, `Unauthorized`), vague “snart/strax” without a signal, mixing `Spara` / `Lagra` for the same action.

---

## Agent checklist (for implementers)

Use as a quick review before shipping UI:

1. [ ] Hero has a single clear intent choice before prompt chaos.
2. [ ] Mode step uses Swedish labels and one-line promises.
3. [ ] Starter hides nonessential chrome; Professional exposes it via a clear rail.
4. [ ] Chat is proactive in Starter; same thread in Pro with optional depth.
5. [ ] Colors and radius use design tokens only.
6. [ ] Motion respects reduced-motion; pulse only on intentional CTAs.
7. [ ] URL/state carries intent + mode into builder without duplicate questions.
8. [ ] Copy follows Swedish rules above.

---

## Non-goals

- Do not rename backend concepts (`own-engine`, `previewUrl`, engine chat routes) in user-facing text without product alignment.
- Do not add new API routes or change generation contracts from this skill alone.
