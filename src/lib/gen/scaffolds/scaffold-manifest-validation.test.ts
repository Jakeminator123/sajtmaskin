import { describe, expect, it } from "vitest";
import {
  extractAppRoutePathsFromFilePaths,
  normalizeRoutePath,
  routePatternToRegex,
} from "../route-plan";
import {
  crossCheckHrefsAgainstRoutes,
  extractHrefsFromFiles,
} from "../verify/href-route-cross-check";
import {
  runScaffoldManifestChecks,
  validateScaffoldManifest,
} from "./scaffold-manifest-validation";
import { landingPageManifest } from "./landing-page/manifest";
import { getAllScaffolds } from "./registry";
import type { ScaffoldManifest, ScaffoldRouteContract } from "./types";

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
      routeContract: {
        requiredRoutes: [],
        optionalRoutes: [],
        declaredRoutePaths: [],
        dynamicRoutePatterns: [],
      },
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

  it("rejects an empty allowedBuildIntents list", () => {
    const scaffold = fixtureScaffold();
    scaffold.allowedBuildIntents = [];
    const errors = validateScaffoldManifest(scaffold).filter(
      (issue) => issue.severity === "error",
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("allowedBuildIntents"),
        }),
      ]),
    );
  });

  it("rejects unknown allowedBuildIntents values", () => {
    const scaffold = fixtureScaffold();
    scaffold.allowedBuildIntents = [
      "website",
      "other" as unknown as ScaffoldManifest["allowedBuildIntents"][number],
    ];
    const errors = validateScaffoldManifest(scaffold).filter(
      (issue) => issue.severity === "error",
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("invalid values: other"),
        }),
      ]),
    );
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

describe("validateScaffoldManifest — routeContract shape", () => {
  function contractScaffold(routeContract: ScaffoldRouteContract): ScaffoldManifest {
    return {
      id: "landing-page",
      label: "route-contract-fixture",
      description: "Fixture for route contract validation.",
      allowedBuildIntents: ["website"],
      tags: [],
      promptHints: ["one", "two"],
      qualityChecklist: ["a", "b", "c"],
      routeContract,
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

  function errorsOf(scaffold: ScaffoldManifest) {
    return validateScaffoldManifest(scaffold).filter((issue) => issue.severity === "error");
  }

  it("flags a missing routeContract", () => {
    const scaffold = contractScaffold({
      requiredRoutes: [],
      optionalRoutes: [],
      declaredRoutePaths: [],
      dynamicRoutePatterns: [],
    });
    delete (scaffold as { routeContract?: ScaffoldRouteContract }).routeContract;
    expect(errorsOf(scaffold)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining("missing routeContract") }),
      ]),
    );
  });

  it("flags the same path in two categories", () => {
    const errors = errorsOf(
      contractScaffold({
        requiredRoutes: [{ path: "/blog", name: "Blog", planIntent: "Keep it." }],
        optionalRoutes: [{ path: "/blog", name: "Blog", planIntent: "Keep it." }],
        declaredRoutePaths: [],
        dynamicRoutePatterns: [],
      }),
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("appears in both requiredRoutes and optionalRoutes"),
        }),
      ]),
    );
  });

  it("flags a dynamic segment in a static category and a pattern without one", () => {
    const errors = errorsOf(
      contractScaffold({
        requiredRoutes: [{ path: "/product/[id]", name: "Product", planIntent: "Keep it." }],
        optionalRoutes: [],
        declaredRoutePaths: [],
        dynamicRoutePatterns: ["/products"],
      }),
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("patterns belong in dynamicRoutePatterns"),
        }),
        expect.objectContaining({
          message: expect.stringContaining("has no dynamic segment"),
        }),
      ]),
    );
  });

  it("flags non-normalized paths, missing name/planIntent, and bad intent scopes", () => {
    const errors = errorsOf(
      contractScaffold({
        requiredRoutes: [
          {
            path: "/blog/",
            name: " ",
            planIntent: "",
            planOnlyForBuildIntents: ["desktop" as unknown as "app"],
          },
        ],
        optionalRoutes: [
          {
            path: "/extra",
            name: "Extra",
            planIntent: "Keep it.",
            requiredOnlyForBuildIntents: ["app"],
          },
        ],
        declaredRoutePaths: [],
        dynamicRoutePatterns: [],
      }),
    );
    const messages = errors.map((issue) => issue.message).join("\n");
    expect(messages).toContain("is not normalized");
    expect(messages).toContain("missing a name");
    expect(messages).toContain("missing a planIntent");
    expect(messages).toContain("invalid build intents: desktop");
    expect(messages).toContain("requiredOnlyForBuildIntents on optional route /extra");
  });
});

/**
 * Deterministic link ↔ route-contract gate (runs in `npm run
 * scaffolds:validate`, blocking in the `quality` CI job).
 *
 * Two directions per scaffold:
 *  1. Every internal href/Link path in `files/**` must resolve against the
 *     manifest's route contract ("/" plus required/optional/declared routes,
 *     dynamic links matched against `dynamicRoutePatterns`).
 *  2. Every contract route must be reachable: at least one link OR one
 *     starter page file. This is what catches contract junk — a promised
 *     route that neither exists nor is linked.
 */
type RouteContractViolation = {
  scaffoldId: string;
  kind: "link-outside-route-contract" | "contract-route-without-link-or-file";
  path: string;
};

const EMPTY_ROUTE_CONTRACT: ScaffoldRouteContract = {
  requiredRoutes: [],
  optionalRoutes: [],
  declaredRoutePaths: [],
  dynamicRoutePatterns: [],
};

/** Does `pattern` extend `basePath` with at least one dynamic segment? */
function dynamicPatternExtendsBase(pattern: string, basePath: string): boolean {
  const patternSegments = pattern.split("/").filter(Boolean);
  const baseSegments = basePath.split("/").filter(Boolean);
  if (patternSegments.length <= baseSegments.length) return false;
  for (let i = 0; i < baseSegments.length; i += 1) {
    if (patternSegments[i] !== baseSegments[i]) return false;
  }
  const next = patternSegments[baseSegments.length]!;
  return next.startsWith("[") && next.endsWith("]");
}

function collectRouteContractViolations(
  scaffold: ScaffoldManifest,
): RouteContractViolation[] {
  const contract = scaffold.routeContract ?? EMPTY_ROUTE_CONTRACT;
  const hrefs = extractHrefsFromFiles(
    scaffold.files.map((file) => ({ path: file.path, content: file.content, language: "tsx" })),
  );
  const violations: RouteContractViolation[] = [];

  // Direction 1: links must resolve against the contract. Root is owned by
  // the plan builder (always planned), so "/" is implicitly in the contract.
  const contractPaths = [
    "/",
    ...contract.requiredRoutes.map((route) => route.path),
    ...contract.optionalRoutes.map((route) => route.path),
    ...contract.declaredRoutePaths,
    ...contract.dynamicRoutePatterns,
  ];
  const seenLinkPaths = new Set<string>();
  for (const mismatch of crossCheckHrefsAgainstRoutes(hrefs, contractPaths)) {
    if (seenLinkPaths.has(mismatch.basePath)) continue;
    seenLinkPaths.add(mismatch.basePath);
    violations.push({
      scaffoldId: scaffold.id,
      kind: "link-outside-route-contract",
      path: mismatch.basePath,
    });
  }

  // Direction 2: contract routes must have at least one link or one file.
  const fileRoutePaths = new Set(
    extractAppRoutePathsFromFilePaths(scaffold.files.map((file) => file.path)).map((path) =>
      normalizeRoutePath(path),
    ),
  );
  const staticContractPaths = [
    ...contract.requiredRoutes.map((route) => route.path),
    ...contract.optionalRoutes.map((route) => route.path),
    ...contract.declaredRoutePaths,
  ];
  for (const rawPath of staticContractPaths) {
    const path = normalizeRoutePath(rawPath);
    const hasFile = fileRoutePaths.has(path);
    const hasLink = hrefs.some((href) => href.basePath === path);
    if (!hasFile && !hasLink) {
      violations.push({
        scaffoldId: scaffold.id,
        kind: "contract-route-without-link-or-file",
        path,
      });
    }
  }
  for (const rawPattern of contract.dynamicRoutePatterns) {
    const pattern = normalizeRoutePath(rawPattern);
    const matcher = routePatternToRegex(pattern);
    const hasFile = fileRoutePaths.has(pattern);
    const hasLink = hrefs.some(
      (href) =>
        matcher.test(href.basePath) ||
        (href.isDynamic && dynamicPatternExtendsBase(pattern, href.basePath)),
    );
    if (!hasFile && !hasLink) {
      violations.push({
        scaffoldId: scaffold.id,
        kind: "contract-route-without-link-or-file",
        path: pattern,
      });
    }
  }
  return violations;
}

function sortViolations(violations: RouteContractViolation[]): RouteContractViolation[] {
  return [...violations].sort(
    (a, b) =>
      a.scaffoldId.localeCompare(b.scaffoldId) ||
      a.kind.localeCompare(b.kind) ||
      a.path.localeCompare(b.path),
  );
}

/**
 * KNOWN, DELIBERATELY VISIBLE violations. Do NOT extend this list to make a
 * new scaffold pass — fix the contract or the files instead.
 *
 * SM-042 (owner decision pending): four scaffolds link unconditionally to
 * routes the route plan never guaranteed. The two mutually exclusive ways
 * out are (1) make the nav mirror the plan (remove/derive the links) or
 * (2) make the plan guarantee the nav (promote the routes to
 * required/optional — which collides with the per-round page ceiling of 3).
 * That choice belongs to the owner; the entries below keep the drift loud
 * until it is made. Remove each entry when its direction is chosen.
 *
 * SM-043 (owner decision pending): ecommerce's /cart is declared in the
 * contract but has neither a starter file (CartDrawer replaced the page)
 * nor a link, and #977 already removed it from the plan defaults. Either
 * reintroduce a real cart page + link or delete the contract entry. Do not
 * add a file just to silence the gate. Remove the exception together with
 * the decision.
 */
const KNOWN_ROUTE_CONTRACT_VIOLATIONS: RouteContractViolation[] = sortViolations([
  // SM-042 — app-shell sidebar links /pipeline and /tasks; plan never guaranteed them.
  { scaffoldId: "app-shell", kind: "link-outside-route-contract", path: "/pipeline" },
  { scaffoldId: "app-shell", kind: "link-outside-route-contract", path: "/tasks" },
  // SM-042 — auth-pages login page links /forgot-password; plan never guaranteed it.
  { scaffoldId: "auth-pages", kind: "link-outside-route-contract", path: "/forgot-password" },
  // SM-042 — dashboard sidebar links /users; plan never guaranteed it.
  { scaffoldId: "dashboard", kind: "link-outside-route-contract", path: "/users" },
  // SM-042 — ecommerce header/footer link /categories and /om; plan never guaranteed them.
  { scaffoldId: "ecommerce", kind: "link-outside-route-contract", path: "/categories" },
  { scaffoldId: "ecommerce", kind: "link-outside-route-contract", path: "/om" },
  // SM-043 — /cart is contract junk: no file, no link, not planned since #977.
  { scaffoldId: "ecommerce", kind: "contract-route-without-link-or-file", path: "/cart" },
]);

describe("route contract ↔ scaffold links gate", () => {
  it("matches the documented SM-042/SM-043 exception list exactly — no new drift, no silently fixed entries", () => {
    const actual = sortViolations(
      getAllScaffolds().flatMap((scaffold) => collectRouteContractViolations(scaffold)),
    );
    // Equality in BOTH directions: a new violation fails here, and a fixed
    // one fails too until its exception row above is removed — so the
    // SM-042/SM-043 debt can only disappear together with an explicit
    // decision, never silently.
    expect(actual).toEqual(KNOWN_ROUTE_CONTRACT_VIOLATIONS);
  });

  it("fails on a required route that has neither a link nor a file", () => {
    const scaffold: ScaffoldManifest = {
      id: "landing-page",
      label: "gate-fixture",
      description: "Fixture for the reverse gate direction.",
      allowedBuildIntents: ["website"],
      tags: [],
      promptHints: ["one", "two"],
      routeContract: {
        requiredRoutes: [{ path: "/ghost", name: "Ghost", planIntent: "Keep it." }],
        optionalRoutes: [],
        declaredRoutePaths: [],
        dynamicRoutePatterns: [],
      },
      files: [{ path: "app/page.tsx", content: "export default function Page(){ return null; }" }],
    };
    expect(collectRouteContractViolations(scaffold)).toEqual([
      {
        scaffoldId: "landing-page",
        kind: "contract-route-without-link-or-file",
        path: "/ghost",
      },
    ]);
  });

  it("accepts dynamic example links and template-literal links via dynamicRoutePatterns", () => {
    const scaffold: ScaffoldManifest = {
      id: "ecommerce",
      label: "gate-fixture",
      description: "Fixture for dynamic pattern matching.",
      allowedBuildIntents: ["website"],
      tags: [],
      promptHints: ["one", "two"],
      routeContract: {
        requiredRoutes: [],
        optionalRoutes: [],
        declaredRoutePaths: [],
        dynamicRoutePatterns: ["/category/[slug]"],
      },
      files: [
        {
          path: "app/category/[slug]/page.tsx",
          content: "export default function Page(){ return null; }",
        },
        {
          path: "components/nav.tsx",
          content:
            'export function Nav(){ return (<div><a href="/category/category-1">A</a><a href={`/category/${"x"}`}>B</a></div>); }',
        },
      ],
    };
    expect(collectRouteContractViolations(scaffold)).toEqual([]);
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
