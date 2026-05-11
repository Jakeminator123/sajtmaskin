import { describe, expect, it } from "vitest";
import {
  runScaffoldManifestChecks,
  validateScaffoldManifest,
} from "./scaffold-manifest-validation";
import { landingPageManifest } from "./landing-page/manifest";
import type { ScaffoldManifest } from "./types";

describe("runScaffoldManifestChecks", () => {
  it("keeps all registered scaffolds free from structural errors", () => {
    const issues = runScaffoldManifestChecks();
    expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });
});

describe("validateScaffoldManifest — V2 file-policy fields", () => {
  function fixtureScaffold(): ScaffoldManifest {
    return {
      id: "landing-page",
      label: "v2-fixture",
      description: "Fixture for V2 file policy validation.",
      allowedBuildIntents: ["website"],
      tags: [],
      promptHints: ["one", "two"],
      qualityChecklist: ["a", "b", "c"],
      files: [
        {
          path: "app/layout.tsx",
          content: "export default function Layout(){ return null; }",
        },
        { path: "app/globals.css", content: "@theme inline { --x: 1; }" },
        { path: "app/icon.svg", content: "<svg/>" },
        {
          path: "app/page.tsx",
          content: "export default function Page(){ return null; }",
        },
      ],
    };
  }

  it("accepts manifests that omit V2 fields entirely", () => {
    const issues = validateScaffoldManifest(fixtureScaffold());
    expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("accepts valid V2 fields on a file", () => {
    const scaffold = fixtureScaffold();
    scaffold.files[3] = {
      ...scaffold.files[3],
      role: "route-page",
      serialization: "excerpt",
      maxPromptChars: 800,
    };
    const issues = validateScaffoldManifest(scaffold);
    expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("flags an invalid role value", () => {
    const scaffold = fixtureScaffold();
    scaffold.files[3] = {
      ...scaffold.files[3],
      role: "not-a-role" as unknown as ScaffoldManifest["files"][number]["role"],
    };
    const errors = validateScaffoldManifest(scaffold).filter(
      (issue) => issue.severity === "error",
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining("Invalid role") }),
      ]),
    );
  });

  it("flags an invalid serialization value", () => {
    const scaffold = fixtureScaffold();
    scaffold.files[3] = {
      ...scaffold.files[3],
      serialization: "compact" as unknown as ScaffoldManifest["files"][number]["serialization"],
    };
    const errors = validateScaffoldManifest(scaffold).filter(
      (issue) => issue.severity === "error",
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("Invalid serialization"),
        }),
      ]),
    );
  });

  it("flags non-positive maxPromptChars", () => {
    const scaffold = fixtureScaffold();
    scaffold.files[3] = { ...scaffold.files[3], maxPromptChars: 0 };
    const errors = validateScaffoldManifest(scaffold).filter(
      (issue) => issue.severity === "error",
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("maxPromptChars"),
        }),
      ]),
    );
  });
});

describe("landing-page scaffold prompt hints (plan-12 #14)", () => {
  it("warns the LLM that sub-routes must not redirect back to '/'", () => {
    // Repro chat 2026-04-24: LLM generated a /afrikanska-bonor sub-route
    // that auto-redirected to '/' via router.push in useEffect, because it
    // misread the scaffold's one-page-marketing structureProfile as "all
    // navigation funnels back to the one-page version". This hint stops
    // that misreading at prompt-construction time.
    const subRouteHint = landingPageManifest.promptHints.find((h) =>
      h.includes("Sub-routes"),
    );
    expect(subRouteHint).toBeDefined();
    expect(subRouteHint).toMatch(/router\.push\('\/'\)/);
    expect(subRouteHint).toMatch(/redirect\('\/'\)/);
  });
});
