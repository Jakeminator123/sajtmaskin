# When to use

Use this dossier whenever the brief asks for a command palette, quick-search, cmd+k menu, search bar that "feels native", or a power-user navigation surface. Triggers (Swedish + English): `command palette`, `cmd+k`, `cmd-k`, `quick search`, `spotlight`, `command menu`, `kommandopalett`, `sökpalett`, `snabbsök`, `power user`, `keyboard navigation`.

Best fit:

- A SaaS dashboard / app shell where users navigate between many pages or perform actions.
- A documentation site where the primary find-it interaction is a search field opened with cmd+k.
- An admin / backoffice with frequent jumps between record types (orders, customers, products).

Do not use for:

- A public marketing landing page where a top-nav with 5 links is enough. Command palettes signal "this is an app" — using one on a brochure site is misleading.
- Site-wide search across blog posts (use a search-as-you-type input or a dedicated search dossier instead — cmdk is for *commands*, not full-text content).
- Mobile-first surfaces where there is no keyboard. The palette is reachable on touch via an icon button, but the value is in the keyboard shortcut.

# How to integrate

Mount `<CommandPalette>` once near the root of the layout. The component owns its open state and the global cmd/ctrl+K listener. The codegen LLM passes a `groups` array describing the available commands; each command has a `label`, optional `keywords`, optional `shortcut`, and an `onSelect` callback (typically `router.push(...)` or a small action handler).

```tsx
"use client";

import { CommandPalette } from "@/components/command-palette";
import { useRouter } from "next/navigation";

export function AppCommandPalette() {
  const router = useRouter();
  return (
    <CommandPalette
      placeholder="Hoppa till sida eller utför kommando…"
      groups={[
        {
          heading: "Navigera",
          items: [
            { label: "Översikt", keywords: ["dashboard", "start"], shortcut: ["G", "H"], onSelect: () => router.push("/") },
            { label: "Bokningar", keywords: ["calendar", "kund"], shortcut: ["G", "B"], onSelect: () => router.push("/bokningar") },
            { label: "Inställningar", shortcut: ["G", "S"], onSelect: () => router.push("/installningar") },
          ],
        },
        {
          heading: "Åtgärder",
          items: [
            { label: "Skapa ny bokning", keywords: ["nytt", "create"], onSelect: () => router.push("/bokningar/ny") },
            { label: "Logga ut", onSelect: () => fetch("/api/logout", { method: "POST" }).then(() => router.refresh()) },
          ],
        },
      ]}
    />
  );
}
```

The palette is opened with cmd+K (mac) or ctrl+K (linux/windows), or by clicking a trigger you render yourself. To open programmatically, render `<CommandPalette … openSignalRef={ref} />` and call `ref.current?.()`.

A small clickable trigger that shows the shortcut hint is a common pattern in app headers:

```tsx
<button
  type="button"
  onClick={() => triggerRef.current?.()}
  className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground"
>
  <span>Sök eller hoppa…</span>
  <kbd className="rounded border bg-background px-1.5 py-0.5 text-xs">⌘K</kbd>
</button>
```

# UX rules

- The palette MUST be reachable from the keyboard alone. Cmd/Ctrl+K opens; Esc closes; Arrow keys move; Enter selects; Tab does NOT advance focus inside the palette (it is a single composite widget).
- Group commands by intent. "Navigera" + "Åtgärder" + "Inställningar" beats one flat list of 25 items.
- Show a shortcut hint (`<kbd>` chips on the right side of an item) whenever a command has a shortcut. Do not invent shortcuts that conflict with browser/OS defaults (cmd+T, cmd+W, cmd+R, cmd+L).
- Respect `prefers-reduced-motion`: the dialog opens with no transition under reduced motion. The wrapper handles this.
- Restore focus to the element that opened the palette when it closes. The wrapper handles this via `onOpenChange`.
- Empty state MUST be present. cmdk does not show one by default; the wrapper ships the Swedish default "Inga träffar." (override via `emptyMessage`).

# Avoid

- Do not put input fields inside palette items. The palette is a list of *commands*, not a form. If you need an input (rename, set quantity), open a Dialog from the command's `onSelect`.
- Do not auto-select the first item on every keystroke unless you want Enter to fire it. cmdk's default behavior is correct — leave it alone.
- Do not register more than one global cmd+K listener. Mount the palette once, near the root layout. Mounting per-page causes the listener to multiply and triggers double-opens.
- Do not paraphrase the cmdk component names (`Command.Root`, `Command.Input`, `Command.List`, `Command.Group`, `Command.Item`, `Command.Empty`). Their compound-component contract is what the package exports.
- Do not lazy-load the palette behind a Suspense boundary keyed off the cmd+K event — the first open will be visibly empty for ~200ms while the chunk loads. Mount it eagerly; the bundle is < 8KB gzipped.

# Verification

- Press cmd+K (mac) / ctrl+K (linux/windows) anywhere on the page → palette opens, input is auto-focused.
- Type 3 characters → fuzzy match narrows results live.
- Press ↑/↓ → highlighted item changes. Press Enter → command fires, palette closes.
- Press Esc → palette closes, focus returns to the element that triggered it (or `<body>` if opened via shortcut).
- Open the palette, type something with no matches → "Inga träffar." empty state renders (or the `emptyMessage` you passed).
- Set `prefers-reduced-motion: reduce` in DevTools → palette open/close has no transition.
- Tab through the page with the palette closed → no stray focus inside the palette's hidden DOM.
- Mount two independent `<CommandPalette>` instances temporarily → confirm only one global listener is registered (the wrapper warns in dev when a second mounts). Remove the duplicate before merging.
