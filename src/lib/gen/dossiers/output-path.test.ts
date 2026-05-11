/**
 * Locks in the dossier-staging-path → user-project-output-path mapping.
 *
 * If any of these expectations break, BOTH the system-prompt instruction
 * (where the LLM is told to emit) AND the verbatim-policy restoration
 * target must be updated in lock-step — they share this helper specifically
 * because they used to drift apart and produced the
 * "two three-canvas-shell.tsx files in one version" rotorsaken on
 * 2026-05-01.
 */
import { describe, expect, it } from "vitest";
import { mapDossierPathToOutput } from "./output-path";

describe("mapDossierPathToOutput", () => {
  it("keeps `components/<file>.tsx` for ordinary UI components", () => {
    expect(mapDossierPathToOutput("components/three-canvas-shell.tsx")).toBe(
      "components/three-canvas-shell.tsx",
    );
    expect(mapDossierPathToOutput("components/checkout-button.tsx")).toBe(
      "components/checkout-button.tsx",
    );
    expect(mapDossierPathToOutput("components/contact-form.tsx")).toBe(
      "components/contact-form.tsx",
    );
  });

  it("rewrites `components/api/<route>/route.ts` to `app/api/<route>/route.ts`", () => {
    expect(
      mapDossierPathToOutput("components/api/checkout-session/route.ts"),
    ).toBe("app/api/checkout-session/route.ts");
    expect(mapDossierPathToOutput("components/api/contact/route.ts")).toBe(
      "app/api/contact/route.ts",
    );
    expect(mapDossierPathToOutput("components/api/chat/route.ts")).toBe(
      "app/api/chat/route.ts",
    );
  });

  it("strips `components/` for Next.js root-level convention files", () => {
    expect(mapDossierPathToOutput("components/middleware.ts")).toBe(
      "middleware.ts",
    );
    expect(mapDossierPathToOutput("components/instrumentation.ts")).toBe(
      "instrumentation.ts",
    );
    expect(mapDossierPathToOutput("components/sentry.client.config.ts")).toBe(
      "sentry.client.config.ts",
    );
    expect(mapDossierPathToOutput("components/sentry.server.config.ts")).toBe(
      "sentry.server.config.ts",
    );
    expect(mapDossierPathToOutput("components/sentry.edge.config.ts")).toBe(
      "sentry.edge.config.ts",
    );
  });

  it("strips `components/` for `lib/` SDK init helpers", () => {
    expect(mapDossierPathToOutput("components/lib/stripe.ts")).toBe(
      "lib/stripe.ts",
    );
    expect(mapDossierPathToOutput("components/lib/sub/foo.ts")).toBe(
      "lib/sub/foo.ts",
    );
  });

  it("returns paths without the `components/` prefix unchanged", () => {
    expect(mapDossierPathToOutput("app/page.tsx")).toBe("app/page.tsx");
    expect(mapDossierPathToOutput("middleware.ts")).toBe("middleware.ts");
    expect(mapDossierPathToOutput("lib/stripe.ts")).toBe("lib/stripe.ts");
  });

  it("does NOT confuse `components/middleware-foo.ts` with the root middleware file", () => {
    // Only the exact filename `middleware.ts` is a Next.js convention.
    // Anything else under `components/` is a regular component module.
    expect(mapDossierPathToOutput("components/middleware-helpers.ts")).toBe(
      "components/middleware-helpers.ts",
    );
    expect(mapDossierPathToOutput("components/auth-middleware.ts")).toBe(
      "components/auth-middleware.ts",
    );
  });

  it("is idempotent — re-applying the mapping is a no-op", () => {
    const inputs = [
      "components/three-canvas-shell.tsx",
      "components/api/checkout-session/route.ts",
      "components/middleware.ts",
      "components/lib/stripe.ts",
    ];
    for (const input of inputs) {
      const once = mapDossierPathToOutput(input);
      const twice = mapDossierPathToOutput(once);
      expect(twice).toBe(once);
    }
  });
});
