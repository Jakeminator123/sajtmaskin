"use client";

import { ClerkProvider } from "@clerk/nextjs";
import type { ComponentProps, ReactNode } from "react";

type ClerkProviderProps = ComponentProps<typeof ClerkProvider>;

export interface ClerkProviderShellProps {
  children: ReactNode;
  localization?: ClerkProviderProps["localization"];
  appearance?: ClerkProviderProps["appearance"];
}

/**
 * A real Clerk publishable key is `pk_(test|live)_<base64>` where the base64
 * payload decodes to the instance's frontend API host followed by `$`.
 * Placeholder values (e.g. `pk_test_placeholder`) fail that check and make
 * `<ClerkProvider>` throw "Publishable key not valid" on mount.
 */
function isLikelyValidClerkPublishableKey(key: string | undefined): key is string {
  if (!key) return false;
  const match = /^pk_(test|live)_([A-Za-z0-9+/=]+)$/.exec(key);
  if (!match) return false;
  try {
    return atob(match[2]).endsWith("$");
  } catch {
    return false;
  }
}

/**
 * Wrapper around Clerk's provider that degrades gracefully when keys are
 * missing or are placeholders. When NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is
 * unset — or holds a preview placeholder like `pk_test_placeholder` — we
 * render the children without the provider plus a small banner. This prevents
 * `<ClerkProvider>` from throwing synchronously on mount, which would
 * black-screen the entire app in dev/preview environments where the
 * operator hasn't pasted real keys yet.
 */
export function ClerkProviderShell({
  children,
  localization,
  appearance,
}: ClerkProviderShellProps) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!isLikelyValidClerkPublishableKey(publishableKey)) {
    return (
      <>
        <div
          role="status"
          className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-900"
        >
          Auth not configured: set <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and{" "}
          <code>CLERK_SECRET_KEY</code> in <code>.env.local</code> to enable login.
        </div>
        {children}
      </>
    );
  }

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      localization={localization}
      appearance={appearance}
    >
      {children}
    </ClerkProvider>
  );
}
