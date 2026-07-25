import { describe, expect, it } from "vitest";

import * as clerkServerStub from "./clerk-nextjs-server";
import { CLERK_SERVER_IMPORTS } from "@/lib/gen/autofix/rules/ts2304-known-import-fixer";

/**
 * `@clerk/nextjs/server` belongs to the GENERATED project, not to this repo, so
 * `vitest.config.ts` and the repo tsconfig alias it to this stub for dossier
 * component tests. A stub narrower than what the pipeline itself injects fails
 * valid generated auth code with TS2305/TS2339 — the same false-red class that
 * made the warm cache stop aliasing SDK stubs altogether (2026-07-25); keep the
 * surface complete so the alias that remains cannot reintroduce it.
 */
describe("clerk-nextjs-server stub", () => {
  it("exports every symbol the TS2304 fixer resolves to @clerk/nextjs/server", () => {
    const exported = new Set(Object.keys(clerkServerStub));
    const missing = [...CLERK_SERVER_IMPORTS].filter((name) => !exported.has(name));
    expect(missing).toEqual([]);
  });

  it("keeps profile access on currentUser() open (no null-narrowed return)", async () => {
    const user = await clerkServerStub.currentUser();
    // Generated pages read fields off the result; a `Promise<null>` return
    // would make `user?.firstName` a compile error rather than a runtime no-op.
    expect(user?.firstName).toBeUndefined();
  });

  it("supports auth() both called and awaited", async () => {
    expect(clerkServerStub.auth().userId).toBeNull();
    expect((await clerkServerStub.auth()).userId).toBeNull();
  });
});
