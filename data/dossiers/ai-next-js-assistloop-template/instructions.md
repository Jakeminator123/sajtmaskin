# When to use

Use this dossier when the site needs an embedded AssistLoop AI chat widget for customer support, lead qualification, or product-help flows.

Best fit:
- SaaS marketing sites with a support agent
- Dashboards or app shells that need in-app help
- Product sites that want a persistent chat launcher

Do not use this dossier if you need a fully custom chat backend, server-side AI orchestration, or conversation storage in your own database. This integration is for embedding AssistLoop's hosted widget.

# How to integrate

## 1) Add the public agent ID

Set the AssistLoop agent ID as a public environment variable so the browser can initialize the widget:

```bash
NEXT_PUBLIC_ASSISTLOOP_AGENT_ID=your_agent_id
```

Because the widget is initialized in the browser, the variable must be prefixed with `NEXT_PUBLIC_`.

## 2) Mount the widget once in the root layout

Render the widget component near the end of `app/layout.tsx` so it loads globally across the app.

```tsx
import type { ReactNode } from "react"
import { AssistLoopWidget } from "@/components/assistloop-widget"

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <AssistLoopWidget />
      </body>
    </html>
  )
}
```

Use the provided component:

```tsx
"use client"

import Script from "next/script"

export function AssistLoopWidget() {
  return (
    <Script
      src="https://assistloop.ai/assistloop-widget.js"
      strategy="afterInteractive"
      onLoad={() => {
        ;(window as any).AssistLoopWidget?.init({
          agentId: process.env.NEXT_PUBLIC_ASSISTLOOP_AGENT_ID,
        })
      }}
    />
  )
}
```

## 3) Open the chat from your own UI

Use the helper when you want a CTA like “Chat with support” or “Ask AI”.

```ts
export const openChatWidget = (): void => {
  if (typeof window !== "undefined") {
    const assistLoopWidget = (window as typeof window & {
      AssistLoopWidget?: {
        init: () => { toggle?: () => void }
      }
    }).AssistLoopWidget

    if (assistLoopWidget) {
      const widgetInstance = assistLoopWidget.init()
      if (widgetInstance && widgetInstance.toggle) {
        widgetInstance.toggle()
      }
    }
  }
}
```

Example button:

```tsx
"use client"

import { openChatWidget } from "@/lib/chat-widget"

export function SupportButton() {
  return (
    <button type="button" onClick={openChatWidget}>
      Chat with support
    </button>
  )
}
```

## 4) Keep the integration client-only

The widget depends on `window` and an external script. Do not try to initialize it in a Server Component or in server-only code.

# UX rules

- Mount the widget only once per app shell or root layout.
- Expose at least one explicit support CTA in addition to the floating widget if support is a key user journey.
- Label support actions clearly: “Chat with support”, “Ask AI”, or “Get help”.
- If the site has authenticated and public sections, keep the widget available in the sections where support is expected.
- If the env var is missing, fail quietly rather than breaking page rendering.

# Avoid

- Do not render multiple `AssistLoopWidget` instances across nested layouts or pages.
- Do not hardcode the agent ID in source code; use `NEXT_PUBLIC_ASSISTLOOP_AGENT_ID`.
- Do not call `openChatWidget()` from server code.
- Do not couple this integration to template-specific metadata, fonts, analytics, or theme providers.
- Do not assume the widget script is available immediately on first paint; user-triggered open actions should tolerate the widget not being ready yet.

# Verification

1. Set `NEXT_PUBLIC_ASSISTLOOP_AGENT_ID`.
2. Start the app and load any page where the root layout is used.
3. Confirm the browser loads `https://assistloop.ai/assistloop-widget.js`.
4. Confirm the chat launcher appears.
5. Click a custom button wired to `openChatWidget()` and verify the widget opens or toggles.
6. Remove the env var temporarily and verify the app still renders without crashing.
7. Check the console for duplicate initialization or repeated script loading if the widget appears more than once.
