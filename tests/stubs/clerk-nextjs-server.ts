/**
 * Test/typecheck stub for `@clerk/nextjs/server` — like `clerk-nextjs.tsx` a
 * dependency of the GENERATED site (clerk-auth dossier), not of this repo.
 * The dossier's verbatim `middleware.ts` imports `clerkMiddleware` and
 * `createRouteMatcher` from this subpath, so the warm-cache pre-VM typecheck
 * needs it to resolve (Bugbot on the #600 follow-up). Every export is an
 * inert placeholder shaped after how the dossier middleware uses it.
 */
import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";

interface StubAuth {
  userId: string | null;
  protect: () => Promise<void>;
}

type ClerkMiddlewareHandler = (
  auth: StubAuth,
  request: NextRequest,
) => void | Response | Promise<void | Response>;

export function clerkMiddleware(handler?: ClerkMiddlewareHandler) {
  void handler;
  return (_request: NextRequest, _event: NextFetchEvent): Response =>
    NextResponse.next();
}

export function createRouteMatcher(patterns: string[]) {
  void patterns;
  return (_request: NextRequest): boolean => false;
}

export async function auth(): Promise<StubAuth> {
  return { userId: null, protect: async () => {} };
}

export async function currentUser(): Promise<null> {
  return null;
}
