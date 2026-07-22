# When to use

Use this dossier when the brief declares the `stepper` capability — a flow is broken into ordered steps and the user should see where they are.

Best fit:

- A multi-step form or wizard (sign-up, application, configurator).
- A checkout flow (cart -> shipping -> payment -> confirm).
- An onboarding sequence with a clear start and end.

Do not use it for:

- Free-form navigation between unrelated pages (use normal nav).
- A single-page form with no real sequence.
- A progress bar for a download/upload (use a determinate progress bar instead).

# How to integrate

The component is controlled: you own the `current` step index (0-based) in the parent and pass it in. Optionally pass `onStepChange` to make steps clickable.

```tsx
"use client";
import { useState } from "react";
import { Stepper } from "@/components/stepper";

export default function Wizard() {
  const [current, setCurrent] = useState(0);
  const steps = [
    { label: "Account", description: "Your details" },
    { label: "Plan", description: "Pick a tier" },
    { label: "Payment", description: "Billing info" },
    { label: "Done" },
  ];
  return (
    <>
      <Stepper steps={steps} current={current} onStepChange={setCurrent} />
      {/* render the form for `current` here, with Back/Next buttons that call setCurrent */}
    </>
  );
}
```

- Steps before `current` show as complete (check mark), `current` is highlighted, later steps are muted.
- Omit `onStepChange` for a display-only indicator (steps render as non-interactive).

# UX rules

- Keep step labels to one or two words; use the optional `description` for the detail.
- Allow clicking back to completed steps, but be cautious about jumping forward past unfilled steps — guard that in the parent's `onStepChange`.
- Always mark the active step with `aria-current="step"` (the component does this) so screen readers announce position.
- 3–6 steps is the comfortable range; more than that, consider grouping.

# Avoid

- Do not store the current step only inside this component — it is controlled by design so the parent stays the source of truth.
- Do not advance the step automatically without user action in a form context.
- Do not hide which steps remain; showing the whole path reduces drop-off.
- Do not rely on color alone to signal state — the component also uses a check mark and number.

# Verification

- Render with `current = 0` — first step highlighted, the rest muted, no completed marks.
- Render with `current = 2` of 4 — steps 0–1 show check marks, step 2 highlighted, step 3 muted.
- Pass `onStepChange` and click a completed step — the parent receives the index.
- Tab through with `onStepChange` set — each step is a focusable button with a visible ring.
- Resize to mobile — steps stack vertically and stay readable.
