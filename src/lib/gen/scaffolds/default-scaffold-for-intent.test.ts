import { describe, expect, it } from "vitest";

import { defaultScaffoldForIntent, scaffoldForExplicitIntent } from "./matcher";
import { getScaffoldById } from "./registry";

/**
 * Used by `resolve-base` when an explicit Byggval Hemsida/App choice rejects an
 * auto-matched scaffold that `allowedBuildIntents` forbids. The fallback is only
 * safe if it is itself intent-compatible — otherwise the guard would swap one
 * illegal pair for another.
 */
describe("defaultScaffoldForIntent", () => {
  it("returns a scaffold that allows the intent it was asked for", () => {
    for (const intent of ["website", "app", "template"] as const) {
      const scaffold = defaultScaffoldForIntent(intent);
      expect(scaffold.allowedBuildIntents, `intent=${intent}`).toContain(intent);
    }
  });

  it("keeps website and app on different baselines", () => {
    expect(defaultScaffoldForIntent("website").id).toBe("landing-page");
    expect(defaultScaffoldForIntent("app").id).toBe("app-shell");
  });

  it("falls back to the minimal starter without an intent", () => {
    expect(defaultScaffoldForIntent(null).id).toBe("base-nextjs");
    expect(defaultScaffoldForIntent(undefined).id).toBe("base-nextjs");
  });
});

/**
 * Applied at BOTH the create-chat pre-match (which steers the Deep Brief) and in
 * `resolve-base` (which steers codegen). If only one side ran it, the brief would
 * describe the rejected scaffold while generation targeted the fallback.
 */
describe("scaffoldForExplicitIntent", () => {
  it("swaps an app-only scaffold for the website default", () => {
    expect(scaffoldForExplicitIntent(getScaffoldById("dashboard"), "website")?.id).toBe(
      "landing-page",
    );
    expect(scaffoldForExplicitIntent(getScaffoldById("app-shell"), "website")?.id).toBe(
      "landing-page",
    );
  });

  it("swaps a website-only scaffold for the app default", () => {
    expect(scaffoldForExplicitIntent(getScaffoldById("landing-page"), "app")?.id).toBe(
      "app-shell",
    );
    expect(scaffoldForExplicitIntent(getScaffoldById("blog"), "app")?.id).toBe("app-shell");
  });

  it("leaves a compatible scaffold untouched", () => {
    for (const id of ["landing-page", "blog", "portfolio", "ecommerce", "saas-landing"]) {
      expect(scaffoldForExplicitIntent(getScaffoldById(id), "website")?.id).toBe(id);
    }
    for (const id of ["dashboard", "app-shell"]) {
      expect(scaffoldForExplicitIntent(getScaffoldById(id), "app")?.id).toBe(id);
    }
    // auth-pages allows both, so neither target may move it.
    expect(scaffoldForExplicitIntent(getScaffoldById("auth-pages"), "website")?.id).toBe(
      "auth-pages",
    );
    expect(scaffoldForExplicitIntent(getScaffoldById("auth-pages"), "app")?.id).toBe(
      "auth-pages",
    );
  });

  it("is a no-op without a scaffold or without a real intent", () => {
    expect(scaffoldForExplicitIntent(null, "website")).toBeNull();
    expect(scaffoldForExplicitIntent(getScaffoldById("dashboard"), null)?.id).toBe("dashboard");
    expect(scaffoldForExplicitIntent(getScaffoldById("dashboard"), undefined)?.id).toBe(
      "dashboard",
    );
  });

  it("always returns a scaffold that allows the requested intent", () => {
    for (const entry of getAllScaffoldIds()) {
      for (const intent of ["website", "app", "template"] as const) {
        const result = scaffoldForExplicitIntent(getScaffoldById(entry), intent);
        expect(result!.allowedBuildIntents, `${entry} → ${intent}`).toContain(intent);
      }
    }
  });
});

function getAllScaffoldIds(): string[] {
  return [
    "base-nextjs",
    "landing-page",
    "saas-landing",
    "portfolio",
    "blog",
    "dashboard",
    "auth-pages",
    "ecommerce",
    "app-shell",
    "projekt-bas-app",
  ];
}
