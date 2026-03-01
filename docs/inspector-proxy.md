# Inspector Proxy System

## Overview

Inspector mode lets users hover/click elements in the preview to select them
for the next chat prompt. It works by proxying the v0 demo page through
`/api/proxy-preview`, injecting a hover/click detection script, and routing
all sub-resources through `/api/proxy-asset` (same-origin).

## Architecture

```
Builder (parent)        Proxy Pipeline             v0 (upstream)
┌──────────┐    iframe  ┌──────────────┐  fetch    ┌──────────────┐
│ Preview  │───────────>│proxy-preview │──────────>│ vusercontent  │
│ Panel    │            │  (HTML)      │<──────────│   .net        │
│          │            └──────┬───────┘           └──────┬───────┘
│          │                   │ rewrites src/href         │
│          │            ┌──────┴───────┐  fetch    ┌──────┴───────┐
│          │            │ proxy-asset  │──────────>│ /_next/      │
│          │            │ (JS/CSS/img) │<──────────│ /assets/     │
└──────────┘            └──────────────┘           └──────────────┘
       ▲                       │
       │    postMessage        │
       └───────────────────────┘
         (hover/select events)
```

## Files

| File | Purpose |
|------|---------|
| `src/app/api/proxy-preview/route.ts` | HTML proxy: fetches page, patches URLs, injects inspector |
| `src/app/api/proxy-asset/route.ts` | Asset proxy: streams JS/CSS/images from vusercontent, rewrites CSS url() |
| `src/components/builder/PreviewPanel.tsx` | Switches iframe src between direct URL and proxy URL |

## How it works

1. User clicks "Inspektionsläge" in the builder
2. PreviewPanel changes iframe src from `https://demo-xxx.vusercontent.net`
   to `/api/proxy-preview?url=https://demo-xxx.vusercontent.net`
3. proxy-preview fetches the HTML server-side and applies:
   - CSP removal
   - `blocking="render"` removal (prevents permanent render block in proxy)
   - `v0-loading` class removal (v0 runtime never completes init in proxy)
   - `<base>` tag removal
   - src/href/srcset rewriting → `/api/proxy-asset?url=<encoded-url>`
   - CSS `url()` rewriting → proxy URLs
   - fetch/XHR/createElement monkey-patches → proxy URLs
   - Inspector script injection (hover detection, postMessage to parent)
4. Browser loads all sub-resources through proxy-asset (same-origin)
5. Inspector script detects hover/click and sends element info to parent via postMessage
6. Parent (PreviewPanel) receives selection and passes to ChatInterface

## Important: Chat Privacy

**Demo pages must be publicly accessible for the proxy to work.** The proxy
fetches HTML server-side without the user's v0 session cookies. If the page
is "private", vusercontent.net returns empty content.

Default `chatPrivacy` is `"private"`. To enable inspector mode, users must
toggle **"Publik preview"** in the builder Settings dropdown before creating
a new chat. This sets `chatPrivacy` to `"unlisted"` — accessible via direct
URL but not publicly listed. Existing private chats must be recreated with
the toggle enabled for inspector mode to work.

## Isolation

The proxy system is self-contained in two API routes:
- `/api/proxy-preview` — only used when inspector mode is active
- `/api/proxy-asset` — only receives requests from proxy-preview pages

Normal preview (non-inspector) loads directly from vusercontent.net and is
completely unaffected by these routes.

The `inspectorScript` only runs inside the proxied iframe and communicates
exclusively via postMessage. It cannot affect the parent page or other iframes.

## Limitations

- Only works for v0 demo pages on vusercontent.net (allowlist in proxy-asset)
- Adds latency: each sub-resource makes an extra hop through localhost
- Existing "private" chats need to be re-created as "unlisted" to work
- Third-party embeds (Google Maps, YouTube) are replaced with placeholders
- v0 runtime features (like Tailwind v4 JIT) may not fully initialize
