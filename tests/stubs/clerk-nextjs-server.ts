/**
 * Test/typecheck stub for `@clerk/nextjs/server` — like `clerk-nextjs.tsx` a
 * dependency of the GENERATED site (clerk-auth dossier), not of this repo.
 * The dossier's verbatim `middleware.ts` imports `clerkMiddleware` and
 * `createRouteMatcher` from this subpath, so the warm-cache pre-VM typecheck
 * needs it to resolve (Bugbot on the #600 follow-up). Every export is an
 * inert placeholder.
 *
 * The surface must cover EVERY symbol `ts2304-known-import-fixer.ts` resolves
 * to this module (`CLERK_SERVER_IMPORTS`), and the value types are deliberately
 * loose (`any`): a stub that is narrower than the real SDK just trades TS2307
 * for TS2305/TS2339 and sends the same clean auth code into repair, which is
 * the exact failure this stub exists to prevent (Codex P2 on #603).
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- see the loose-types note above */
import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";

/** Loose auth object: any property/telescoping access typechecks. */
interface StubAuth {
  userId: string | null;
  sessionId: string | null;
  protect: (...args: any[]) => Promise<any>;
  redirectToSignIn: (...args: any[]) => any;
  [key: string]: any;
}

type ClerkMiddlewareHandler = (
  auth: StubAuth,
  request: NextRequest,
) => void | Response | Promise<void | Response>;

export function clerkMiddleware(handler?: ClerkMiddlewareHandler, options?: any) {
  void handler;
  void options;
  return (_request: NextRequest, _event: NextFetchEvent): Response => NextResponse.next();
}

export function createRouteMatcher(patterns: string[]) {
  void patterns;
  return (_request: NextRequest): boolean => false;
}

/**
 * Callable AND awaitable, mirroring how generated code uses it in both shapes
 * (`auth()` in route handlers, `await auth()` in server components).
 */
export function auth(...args: any[]): any {
  void args;
  const value: StubAuth = {
    userId: null,
    sessionId: null,
    protect: async () => undefined,
    redirectToSignIn: () => undefined,
  };
  return Object.assign(Promise.resolve(value), value);
}

/** Request-scoped variant used in route handlers / API routes. */
export function getAuth(_request?: NextRequest, ...args: any[]): any {
  void args;
  return {
    userId: null,
    sessionId: null,
    protect: async () => undefined,
    redirectToSignIn: () => undefined,
  };
}

/**
 * Returns `any` rather than `null`: generated pages read profile fields
 * (`(await currentUser())?.firstName`), which a `null` return would reject.
 */
export async function currentUser(): Promise<any> {
  return null;
}

/** Backend client — `clerkClient.users.getUser(...)` and friends typecheck. */
export const clerkClient: any = new Proxy(
  {},
  {
    get: () => () => undefined,
  },
);
