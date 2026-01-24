# Shadcn registry blocks: sajtmaskin vs sajtgen

## Current state in sajtmaskin

- Init modal only supports GitHub and ZIP sources.
- There is no `/api/v0/chats/init-registry` endpoint.
- `src/lib/v0/v0-generator.ts` does not expose an `initFromRegistry()` helper.
- `src/lib/v0/v0-url-parser.ts` already understands registry URLs, but it is unused.

## What sajtgen does

- Adds a "blocks" source in the import modal that builds a registry URL.
- Calls `/api/v0/chats/init-registry` to initialize from a registry item.
- Implements `initFromRegistry()` that calls `v0.chats.init({ type: "registry" })`.

## Impact

Without the registry init flow, sajtmaskin cannot pull shadcn blocks from the registry.
It can only generate from prompt or import a repo/ZIP.

## Minimal additions to match sajtgen

- Add a "blocks" option in the import modal and call `/api/v0/chats/init-registry`.
- Add the `init-registry` API route with validation and DB persistence.
- Add `initFromRegistry()` to `src/lib/v0/v0-generator.ts` and reuse existing URL parsing.

---

# Extended recommendations (quality + parity)

## 1) Registry blocks (shadcn)

**What it is:** A shortcut that initializes a v0 chat from a shadcn registry JSON
instead of a free-form prompt. This gives a known, high-quality UI starting point.

**Why it helps:** Better baseline layout + design consistency, fewer prompt misses.

**How it works in sajtgen:** A "blocks" picker builds a registry URL and calls
`/api/v0/chats/init-registry`, which uses `v0.chats.init({ type: "registry" })`.

**What to port into sajtmaskin:**

- UI: add a blocks picker (suggested placement: above chat input, near the Figma button).
- API: add `/api/v0/chats/init-registry`.
- Helper: add `initFromRegistry()` in `src/lib/v0/v0-generator.ts`.

---

## 2) Prompt Assist vs v0 builder (important difference)

**Prompt Assist** happens **before** v0 generation and only rewrites the prompt.
It does NOT change the v0 model (which is still `v0-max`, `v0-pro`, etc).

**Why it matters:** The screenshot showing `openai/gpt-5` or `openai/gpt-4o`
means the **prompt rewriting model**, not the v0 builder model.

**Implication:** You can get better prompts (and better results) by using a stronger
assist model, even if the v0 model stays the same.

---

## 3) Using GPT-5 for Prompt Assist (Gateway)

**Model naming (AI Gateway):**

- Use `openai/gpt-5` (or `openai/gpt-5.2`, `openai/gpt-5.2-pro`, etc).
- AI Gateway expects `provider/model` format.
  Refs: [Vercel Models & Providers](https://vercel.com/docs/ai-gateway/models-and-providers),
  [GPT-5 on Vercel AI Gateway](https://vercel.com/ai-gateway/models/gpt-5),
  [GPT-5.2 availability](https://vercel.com/changelog/gpt-5-2-models-now-available-on-vercel-ai-gateway)

**What this changes:** Better rewrite quality (more precise instructions)
without changing v0's generation model.

**API structure check (current code already matches):**

- `provider="gateway"` requires `model="openai/gpt-5"` (provider/model).
- `provider="openai"` requires raw model name (e.g. `gpt-5`).

---

## 4) Deep Brief Mode (optional)

**What it is:** A structured brief (pages, sections, tone, imagery) generated first,
then converted into a deterministic v0 prompt.

**Why it helps:** Often produces more coherent multi-section sites.

**Costs:** Slower and more tokens.

---

## 5) System Prompt (v0)

Sajtmaskin lets you set a **system prompt** for v0 generation. This can shape
the final output more than you think.

**Suggested improvement:** Add a "recommended system prompt" option for
image-heavy or brand-heavy sites (explicitly request hero imagery, etc).

---

## 6) Avoid missing UI dependencies (ex: sonner)

If v0 generates `sonner` (toasts) but the component isn't in `src/components/ui`,
the build will fail.

**Two solutions:**

- Add the component (and any dependency like `sonner` or `next-themes`)
- Or instruct the model not to use it (via prompt or system prompt)

---

## 7) Image quality & asset strategy

If pages are missing imagery or look flat, add explicit prompt guidance:

- Require a large hero image and 2-3 section images.
- Mention image style (photography vs illustration).
- Keep `imageGenerations` enabled in Settings.

If external images are blocked, use Blob image strategy.
