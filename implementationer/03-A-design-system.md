# 03-A: v0 Design System Integration

**Implementation plan for integrating v0 Design Systems into Sajtmaskin**

**Reference:** [LLM/ROADMAP-next.txt](../LLM/ROADMAP-next.txt) — Section A  
**Roadmap:** `implementationer/README.md` — Steg 3 av 6  
**Status:** [ ] Ej påbörjad  
**Priority:** HIGH  
**Effort:** MEDIUM (separate repo + wiring)  
**Beroenden:** Inga — separat repo, kan köras parallellt

---

## Overview

v0 Design Systems enable **consistent design** across all generated sites without extra prompt text. You host a "registry" (a deployed Next.js app with design tokens and custom components); v0 reads from it when generating code and applies your colors, typography, and component styles automatically.

**Value:** All generated sites share Sajtmaskin branding and a cohesive look, improving perceived quality and user trust.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  REGISTRY (Separate Repo)                                                    │
│  github.com/vercel/registry-starter (forked)                                 │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  tokens.css          →  Brand colors, fonts, spacing                   │  │
│  │  layout.tsx           →  Global layout/typography                      │  │
│  │  components/          →  Custom header, footer, hero, CTA sections    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │  Deploy
                                        ▼
                              ┌──────────────────┐
                              │  Public URL      │
                              │  e.g. registry.  │
                              │  sajtmaskin.se   │
                              └────────┬─────────┘
                                       │
                                       │  v0 reads at generation time
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  v0 Platform                                                                  │
│  designSystemId bound to registry URL                                         │
│  → Fetches tokens + components when generating code                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       │  Generated code matches your design
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Sajtmaskin Builder                                                          │
│  Chat create / send message with designSystemId                               │
│  → v0 generates site using Sajtmaskin design system                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key insight:** You cannot "download" a design system from v0. The flow is reversed: you create a registry, deploy it, give v0 its URL (or register it to get a `designSystemId`), and v0 reads from your registry when generating.

---

## Phase 1: Create the Registry

### A1. Fork / clone Vercel registry-starter

- Clone: [github.com/vercel/registry-starter](https://github.com/vercel/registry-starter)
- Or fork into your org (e.g. `sajtmaskin/registry`)
- This is a **separate repo**, not part of the sajtmaskin main codebase

### A2. Customize `tokens.css`

- Add Sajtmaskin brand colors (primary, accent, background, foreground)
- Set typography (font families, sizes, weights)
- Define spacing scale, border radii, shadows
- Ensure variables follow the shadcn/registry spec so v0 can interpret them

### A3. Add custom components

- Header (navigation bar)
- Footer
- Hero section
- CTA (Call-to-action) sections
- Any other recurring building blocks that should be consistent across generated sites

These should be based on shadcn/ui patterns so v0 can compose them correctly.

### A4. Deploy to Vercel

- Create a new Vercel project for the registry
- Deploy as a separate project
- Ensure the URL is public (v0 must be able to fetch it)
- Example: `registry.sajtmaskin.se` or `sajtmaskin-registry.vercel.app`

---

## Phase 2: Connect to Sajtmaskin

### A5. Get `designSystemId`

Two options:

1. **v0.dev dashboard** — Create/link a design system in the v0 UI using your registry URL; copy the `designSystemId` it returns.
2. **init-registry API** — If v0 supports creating design systems via API, use the project’s existing `/api/v0/chats/init-registry` flow or equivalent to obtain the ID.

### A6. Add `DESIGN_SYSTEM_ID` to env vars

- Add `DESIGN_SYSTEM_ID=<your-id>` to `.env.local` (development)
- Add to Vercel project env vars (production)
- Optional: Support multiple IDs if you add more design systems later (e.g. per-industry)

### A7. Verify existing wiring

The codebase already has most of the plumbing:

| File | Status |
|------|--------|
| `src/lib/v0/v0-generator.ts` (line 558) | `designSystemId` in `GenerateCodeOptions` |
| `src/lib/v0/v0-generator.ts` (lines 732–735) | Passes `designSystemId` to `v0.chats.create` (TODO cast until SDK types updated) |
| `src/lib/validations/chatSchemas.ts` (line 50) | `designSystemId: z.string().optional()` |
| `src/app/api/v0/chats/stream/route.ts` (line 122) | Destructures `designSystemId` from body |
| `src/app/api/v0/chats/route.ts` (line 55) | Same |
| Both routes | Pass `designSystemId` to create call |

**Missing pieces:**

- Server: Read `DESIGN_SYSTEM_ID` from env and pass it when creating chats (when no explicit client override).
- Client: `useCreateChat.ts` and `useSendMessage.ts` do not yet include `designSystemId` in `requestBody`; they need to receive it (e.g. from project settings or builder state) and send it.

---

## Phase 3: User-Facing Selection

### A8. Design system selector in BuilderHeader

- Add a dropdown (or similar) in `BuilderHeader` to choose between:
  - **Default** — v0’s built-in design
  - **Sajtmaskin** — your custom design system (uses `DESIGN_SYSTEM_ID`)
  - *(Future)* Additional systems (e.g. by industry)
- Disable when busy (streaming / creating chat)
- Wire selection into builder state (e.g. `selectedDesignSystemId`)

### A9. Persist selection per project

- Store chosen design system in project metadata (e.g. `projects.designSystemId` or project settings table)
- On project load, restore the selection
- New projects can default to Sajtmaskin design system when `DESIGN_SYSTEM_ID` is set

---

## Files to Create / Modify

### Sajtmaskin main repo (this project)

| File | Action |
|------|--------|
| `src/components/builder/BuilderHeader.tsx` | Add design system dropdown (A8) |
| `src/lib/hooks/v0-chat/useCreateChat.ts` | Add `designSystemId` to `requestBody` when creating chat |
| `src/lib/hooks/v0-chat/useSendMessage.ts` | Add `designSystemId` to `requestBody` when sending messages |
| `src/app/api/v0/chats/stream/route.ts` | Use `designSystemId` from body or fall back to `process.env.DESIGN_SYSTEM_ID` |
| `src/app/api/v0/chats/route.ts` | Same fallback logic |
| Project schema / settings | Add `designSystemId` field for persistence (A9) |
| Builder state / page controller | Add `selectedDesignSystemId`, load/save with project |

### Registry (separate repo)

| Item | Action |
|------|--------|
| New repo | Fork/clone `registry-starter` |
| `tokens.css` | Sajtmaskin brand tokens |
| `components/` | Custom header, footer, hero, CTA |
| Vercel project | Deploy registry to public URL |

---

## Open Questions

1. **Multiple design systems:** Should different industries (restaurant, e‑commerce, portfolio) get separate registries and IDs?
2. **init-registry vs design system:** `init-registry` is for starting a chat from a *single component* URL. Is there a separate v0 API to register a full design system and get a `designSystemId`?
3. **v0-sdk types:** When will the official v0 SDK include `designSystemId` so the TODO cast can be removed?
4. **Project-level vs global default:** Should `DESIGN_SYSTEM_ID` be a global env default, or only used when a project has no explicit selection?

---

## Important Note

The registry is a **separate repository** from the main sajtmaskin app. The main repo only needs:

1. Env var `DESIGN_SYSTEM_ID`
2. Minor wiring: pass `designSystemId` through builder state → API routes → v0
3. UI: design system selector in `BuilderHeader` and persistence per project

All registry content (tokens, components) lives in the registry repo and is deployed independently.
