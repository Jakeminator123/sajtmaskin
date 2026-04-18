# When to use

Use this dossier when building a minimal SaaS marketing site on Next.js App Router and you want a clean root layout with dark mode support via `next-themes`.

It is a good fit for:
- landing pages and SaaS marketing sites
- lightweight product websites that need dark/light theme switching
- projects that already have sections/components but need the app-level shell

It is **not** a full website. It only provides the root layout pattern.

# How to integrate

Install the required dependencies:

```bash
npm install next-themes react-icons
```

Create or keep the App Router root layout at `app/layout.tsx` and wrap the app with `ThemeProvider`.

```tsx
import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";

import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Your Product Name",
  description: "Short product description",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter+Tight:ital,wght@0,100..900;1,100..900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-white dark:bg-black">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

If your project uses a `src/` layout structure or a different alias, adjust the global CSS import accordingly.

Use `next-themes` in client components for theme toggles:

```tsx
"use client";

import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      Toggle theme
    </button>
  );
}
```

# UX rules

- Set real `metadata.title` and `metadata.description`; do not ship template defaults.
- Keep `suppressHydrationWarning` on `<html>` when using `next-themes` to avoid theme hydration mismatches.
- Ensure global styles define both default and `.dark` color tokens so theme switching actually changes the UI.
- Use accessible color contrast in both themes.
- Prefer a single site-wide font choice; remove external font loading if your app uses `next/font` instead.

# Avoid

- Do not leave template branding such as "Next JS SaaS Starter Template" in metadata.
- Do not add `use client` to the root layout; only client components that need browser hooks should use it.
- Do not render theme-dependent UI on the server without guarding for hydration behavior.
- Do not keep unused dependencies like `react-icons` unless you actually use them in UI components.

# Verification

1. Start the app and confirm the root layout renders without hydration warnings.
2. Verify global CSS is applied across all routes.
3. Confirm dark mode classes are applied to `<html>` or downstream elements through `ThemeProvider`.
4. If you add a theme toggle, verify switching between light and dark updates the UI correctly.
5. Check the browser tab title, description, and favicon are no longer template defaults.

Example checks:

```bash
npm run dev
```

Then verify:
- page loads with no runtime errors
- favicon resolves from `/favicon.svg`
- metadata matches the product
- dark mode works consistently after refresh
