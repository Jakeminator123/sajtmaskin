# D-ID avatar test route

> Status: active
> Last updated: 2026-03-15

## Goal

Stand up a single public test surface at `/avatar` so the D-ID agent can be
verified in isolation, while still allowing an explicit experimental path where
OpenClaw can act as the avatar brain through a separate bridge flow.

Current intended test URLs:

- local: `http://localhost:3000/avatar`
- deployed: `https://sajtmaskin.vercel.app/avatar`

## What may be renamed vs what must stay exact

### Flexible (our side)

These names are ours and can be simplified freely as long as the code reads the
same names:

- env var names
- React component names
- internal helper names
- optional server route paths

Recommended public env names for this integration:

```bash
NEXT_PUBLIC_AVATAR_AGENT_ID=...
NEXT_PUBLIC_AVATAR_CLIENT_KEY=...
```

### Exact (D-ID embed contract)

When using the D-ID embed script, these HTML data attributes must stay exactly
as D-ID expects:

- `data-client-key`
- `data-agent-id`
- `data-target-id` in `full` mode

For a Next.js app, any value read in browser code must use a `NEXT_PUBLIC_`
prefix.

## D-ID domain allowlist

The D-ID client key used by the embed must be generated with a tight
`allowed_domains` list. For the current test scope, include at least:

- `http://localhost:3000`
- `https://sajtmaskin.vercel.app`

If preview deployments should work later, add the specific preview origin before
testing there.

## Scope boundaries for this pass

Do:

- expose a public `/avatar` page
- keep a simple D-ID fallback path available
- allow an isolated OpenClaw bridge mode for avatar testing
- read `agent_id` and `client_key` from public env vars
- keep the work isolated from the rest of the product

Do not do yet:

- do not wire the avatar into the global layout or navbar
- do not add a server endpoint for minting client keys
- do not make OpenClaw a hard dependency for first render
- do not broaden CSP for the whole app; only open what `/avatar` needs

## Sajtmaskin reference implementation

This repository now uses the following structure:

- route: `src/app/avatar/page.tsx`
- iframe fallback: `src/components/avatar/did-avatar-embed.tsx`
- OpenClaw bridge widget: `src/components/avatar/did-openclaw-bridge.tsx`
- avatar diagnostics: `src/components/avatar/avatar-integration-status.tsx`
- avatar bridge route: `src/app/api/did/chat/route.ts`
- CSP exception: `src/proxy.ts`
- env registry: `src/lib/env.ts`, `config/env-policy.json`, `ENV.md`

The current Sajtmaskin implementation also keeps:

- `/api/did/conversation` for tolerant transcript/webhook handoff
- `/api/did/chat` for the isolated avatar -> OpenClaw bridge path

`/avatar` now supports two explicit modes:

- default/fallback: iframe-style D-ID share page
- experimental: `?mode=bridge` for D-ID Client SDK + OpenClaw bridge

For browser automation and local debugging, `?mode=bridge&mock=1` enables a
mocked avatar transport while preserving the same client-side bridge UI.

## Copy/paste spec for another Next.js App Router project

Use this when delegating to another agent working in a separate website repo.

### Objective

Implement a minimal D-ID test route at `/avatar` in a Next.js App Router app.
The result should be a standalone public page where the user can talk to the
configured D-ID agent. Keep the integration isolated and avoid touching the rest
of the site.

### Required inputs

- `agent_id`
- `client_key`

### Recommended env names

```bash
NEXT_PUBLIC_AVATAR_AGENT_ID=...
NEXT_PUBLIC_AVATAR_CLIENT_KEY=...
```

### Required file structure

If the project uses `src/app`:

```text
src/app/avatar/page.tsx
src/components/avatar/did-avatar-embed.tsx
```

If the project uses `app` directly:

```text
app/avatar/page.tsx
components/avatar/did-avatar-embed.tsx
```

### Implementation requirements

1. Create a public page at `/avatar`.
2. Mount the D-ID script from `https://agent.d-id.com/v2/index.js`.
3. Use D-ID `full` mode.
4. Read `agent_id` and `client_key` from public env vars.
5. Use the exact D-ID embed attributes:
   - `data-client-key`
   - `data-agent-id`
   - `data-target-id`
6. Show a clear on-page error if the env vars are missing.
7. If the app has strict CSP, allow D-ID only for the `/avatar` route in:
   - `script-src`
   - `frame-src`
   - `connect-src`
   - `media-src`
   - `worker-src` if workers are restricted
8. Do not make this route depend on any unrelated chat, auth, or builder flow.

### Minimal client component shape

```tsx
"use client";

import { useEffect, useId, useRef } from "react";

const AGENT_ID = process.env.NEXT_PUBLIC_AVATAR_AGENT_ID;
const CLIENT_KEY = process.env.NEXT_PUBLIC_AVATAR_CLIENT_KEY;

export function DidAvatarEmbed() {
  const rootRef = useRef<HTMLDivElement>(null);
  const uniqueId = useId().replace(/:/g, "");

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !AGENT_ID || !CLIENT_KEY) return;

    const targetId = `did-avatar-target-${uniqueId}`;

    root.innerHTML = "";

    const container = document.createElement("div");
    container.id = targetId;
    container.style.width = "100%";
    container.style.minHeight = "720px";
    root.appendChild(container);

    const script = document.createElement("script");
    script.type = "module";
    script.src = "https://agent.d-id.com/v2/index.js";
    script.setAttribute("data-mode", "full");
    script.setAttribute("data-target-id", targetId);
    script.setAttribute("data-client-key", CLIENT_KEY);
    script.setAttribute("data-agent-id", AGENT_ID);
    root.appendChild(script);

    return () => {
      root.innerHTML = "";
    };
  }, [uniqueId]);

  if (!AGENT_ID || !CLIENT_KEY) {
    return <div>Missing NEXT_PUBLIC_AVATAR_AGENT_ID or NEXT_PUBLIC_AVATAR_CLIENT_KEY</div>;
  }

  return <div ref={rootRef} />;
}
```

### Minimal page shape

```tsx
import { DidAvatarEmbed } from "@/components/avatar/did-avatar-embed";

export default function AvatarPage() {
  return (
    <main>
      <h1>Avatar test</h1>
      <p>Isolated D-ID test route at /avatar.</p>
      <DidAvatarEmbed />
    </main>
  );
}
```

### Verification checklist

1. Add the two public env vars locally.
2. Start the app.
3. Open `http://localhost:3000/avatar`.
4. Confirm that the avatar renders.
5. Confirm that voice/chat can start.
6. Add the same values in the deployed environment.
7. Redeploy after changing `NEXT_PUBLIC_*` env vars.
8. Open the deployed `/avatar` route and verify the same behavior.

### Common failure modes

- missing `NEXT_PUBLIC_AVATAR_AGENT_ID`
- missing `NEXT_PUBLIC_AVATAR_CLIENT_KEY`
- `allowed_domains` does not include the current origin
- wrong `agent_id`
- strict CSP blocks `agent.d-id.com`
- app was not redeployed after changing public env vars

## OpenClaw note

OpenClaw is no longer completely out of scope for `/avatar`, but it is still
kept behind an explicit experimental path instead of being a hard dependency
for first render.

Current strategy:

1. keep iframe D-ID as the safe fallback/default mode
2. use `?mode=bridge` to test OpenClaw as the avatar brain through `/api/did/chat`
3. use `?mode=bridge&mock=1` for isolated UI/E2E checks without requiring a
   live D-ID session
4. keep `/api/did/conversation` available for transcript-style handoff even if
   the bridge path is disabled or unavailable
