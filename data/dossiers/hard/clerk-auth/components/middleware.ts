import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/app(.*)",
  "/medlem(.*)",
  "/account(.*)",
  "/api/protected(.*)",
]);

/**
 * A real Clerk publishable key is `pk_(test|live)_<base64>` where the base64
 * payload decodes to the instance's frontend API host followed by `$`.
 * Placeholder values (e.g. `pk_test_placeholder`) fail that decode check, and
 * passing them to Clerk makes `clerkMiddleware` throw "Publishable key not
 * valid" on every request — a 500/blank page for the whole site.
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

function isLikelyValidClerkSecretKey(key: string | undefined): key is string {
  if (!key) return false;
  return /^sk_(test|live)_/.test(key) && !key.toLowerCase().includes("placeholder");
}

const clerkConfigured =
  isLikelyValidClerkPublishableKey(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
  isLikelyValidClerkSecretKey(process.env.CLERK_SECRET_KEY);

// Only construct the Clerk handler when real keys are present, so missing or
// placeholder keys degrade to open routes instead of crashing every request.
const clerkHandler = clerkConfigured
  ? clerkMiddleware(async (auth, req) => {
      if (isProtectedRoute(req)) {
        await auth.protect();
      }
    })
  : null;

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  if (!clerkHandler) {
    return NextResponse.next();
  }
  return clerkHandler(req, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
