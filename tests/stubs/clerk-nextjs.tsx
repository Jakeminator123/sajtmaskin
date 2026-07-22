/**
 * Test stub for `@clerk/nextjs` — a dependency of the GENERATED site (the
 * clerk-auth dossier ships it via manifest `dependencies`), not of this repo.
 * The dossier components import it at module top, so unit tests that render
 * the DEMO branch (no valid publishable key → Clerk components never mount)
 * still need the import to resolve. Wired via the `@clerk/nextjs` alias in
 * `vitest.config.ts`; every export is an inert placeholder.
 */
import type { ReactNode } from "react";

// Prop shape mirrors the pieces `clerk-provider-shell.tsx` actually touches
// (publishableKey/localization/appearance) — the stub also backs the tsconfig
// `paths` mapping, so tsc typechecks the dossier component against it.
export function ClerkProvider(_props: {
  children?: ReactNode;
  publishableKey?: string;
  localization?: unknown;
  appearance?: unknown;
}) {
  return <>{_props.children}</>;
}

export function SignedIn(_props: { children?: ReactNode }) {
  return null;
}

export function SignedOut(_props: { children?: ReactNode }) {
  return null;
}

export function SignInButton(_props: { children?: ReactNode; mode?: string }) {
  return null;
}

export function SignUpButton(_props: { children?: ReactNode; mode?: string }) {
  return null;
}

export function UserButton(_props: Record<string, unknown>) {
  return null;
}
