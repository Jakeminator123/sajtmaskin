import { describe, expect, it } from "vitest";

import * as clerkServerStub from "./clerk-nextjs-server";
import { CLERK_SERVER_IMPORTS } from "@/lib/gen/autofix/rules/ts2304-known-import-fixer";

/**
 * The warm-cache pre-VM typecheck aliases `@clerk/nextjs/server` to this stub
 * (`scripts/provision-warm-cache.ts`), because the SDK belongs to the generated
 * project, not to this repo. If the stub is narrower than what the pipeline
 * itself injects, valid generated auth code fails with TS2305/TS2339 and goes
 * into the repair loop — the exact false-red the stub exists to prevent
 * (Codex P2 on #603).
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
