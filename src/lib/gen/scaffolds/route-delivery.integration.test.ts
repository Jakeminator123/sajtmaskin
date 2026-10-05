import { describe, expect, it, vi } from "vitest";
import { mergeGeneratedProjectFiles } from "../stream/finalize-merge";
import type { CodeFile } from "../parser";
import type { RoutePlan } from "../route-plan";
import { serializeScaffoldForPrompt, type ScaffoldSerializeMode } from "./serialize";
import type { ScaffoldManifest } from "./types";
import { isUnderRoutePath, resolveScaffoldRouteDelivery } from "./route-delivery";

vi.mock("@/lib/logging/dev-log", () => ({ devLogAppend: vi.fn() }));
vi.mock("@/lib/db/chat-repository-pg", () => ({
  getPreferredVersion: vi.fn(),
  getLatestVersion: vi.fn(),
  getVersionById: vi.fn(),
  getKnownBrokenImageReplacements: vi.fn(),
  updateVersionFiles: vi.fn(),
}));

const sharedPaths = [
  "app/page.tsx",
  "app/layout.tsx",
  "app/globals.css",
  "app/api/health/route.ts",
  "components/shared.tsx",
  "app/catalogue/page.tsx",
];
const routePaths = [
  "app/must/page.tsx",
  "app/maybe/page.tsx",
  "app/catalog/page.tsx",
  "app/product/[id]/page.tsx",
  "app/story/page.tsx",
  "app/story/[slug]/page.tsx",
  "app/login/page.tsx",
  "app/signup/page.tsx",
  "app/forgot-password/page.tsx",
];

function fixture(): ScaffoldManifest {
  return {
    id: "blog",
    label: "Route delivery fixture",
    description: "Route delivery fixture",
    allowedBuildIntents: ["website"],
    tags: [],
    promptHints: [],
    routeContract: {
      requiredRoutes: [{ path: "/must", name: "Must", planIntent: "Required by scaffold" }],
      optionalRoutes: [{ path: "/maybe", name: "Maybe", planIntent: "Optional page" }],
      declaredRoutePaths: ["/catalog", "/story", "/login", "/signup", "/forgot-password"],
      dynamicRoutePatterns: ["/product/[id]", "/story/[slug]"],
      deliveryGroups: [
        ["/catalog", "/product/[id]"],
        ["/login", "/signup", "/forgot-password"],
      ],
    },
    files: [...sharedPaths, ...routePaths].map((path) => ({
      path,
      content: path.endsWith(".css")
        ? "body { color: black; }"
        : path.endsWith("route.ts")
          ? "export function GET() { return new Response('ok'); }"
          : "export default function Fixture() { return <div>Fixture</div>; }",
    })),
  };
}

function plan(paths: string[]): RoutePlan {
  return {
    provenance: { primarySource: "prompt", sources: ["prompt"] },
    siteType: "brochure",
    reason: "fixture",
    routes: paths.map((path) => ({ path, name: path, intent: "fixture", required: true })),
  };
}

const home: CodeFile = {
  path: "app/page.tsx",
  content: "export default function Home() { return <main>Home</main>; }",
  language: "tsx",
};

describe.each([
  ["structural", {}],
  ["inspirational", {}],
  ["structural full dump", { forceFullDump: true }],
] as const)("route delivery at serializer and materializer — %s", (label, extraOptions) => {
  const mode: ScaffoldSerializeMode = label === "inspirational" ? "inspirational" : "structural";

  it.each([
    ["root-only excludes even required routes", ["/"], []],
    ["required", ["/", "/must"], ["app/must/page.tsx"]],
    ["optional", ["/", "/maybe"], ["app/maybe/page.tsx"]],
    [
      "declared and dynamic delivery group",
      ["/", "/catalog"],
      ["app/catalog/page.tsx", "app/product/[id]/page.tsx"],
    ],
    [
      "parent delivers dynamic descendant",
      ["/", "/story"],
      ["app/story/page.tsx", "app/story/[slug]/page.tsx"],
    ],
    [
      "dynamic alone does not deliver its parent",
      ["/", "/story/[slug]"],
      ["app/story/[slug]/page.tsx"],
    ],
    [
      "auth delivery group",
      ["/", "/signup"],
      ["app/login/page.tsx", "app/signup/page.tsx", "app/forgot-password/page.tsx"],
    ],
  ])("%s", (_label, plannedPaths, deliveredRoutes) => {
    const scaffold = fixture();
    const routePlan = plan(plannedPaths);
    const before = JSON.stringify(scaffold);
    const merged = mergeGeneratedProjectFiles({
      chatId: "route-fixture",
      originalFilesJson: "[]",
      generatedFiles: [home],
      resolvedScaffold: scaffold,
      routePlan,
    });
    const materializedPaths = (JSON.parse(merged.filesJson) as CodeFile[])
      .map((file) => file.path)
      .sort();
    const expected = [...sharedPaths, ...deliveredRoutes].sort();
    // The existing materializer is the policy control: no new route deletion.
    expect(materializedPaths).toEqual(expected);
    const prompt = serializeScaffoldForPrompt(scaffold, mode, {
      maxChars: 50_000,
      routePlan,
      ...extraOptions,
    });
    for (const path of [...sharedPaths, ...routePaths]) {
      if (expected.includes(path)) expect(prompt, path).toContain(path);
      else expect(prompt, path).not.toContain(path);
    }
    expect(JSON.stringify(scaffold)).toBe(before);
  });

  it.each(["missing plan", "empty plan", "missing contract", "empty contract"])(
    "fail-open: %s",
    (condition) => {
      const scaffold = fixture();
      if (condition === "missing contract") delete scaffold.routeContract;
      if (condition === "empty contract")
        scaffold.routeContract = {
          requiredRoutes: [],
          optionalRoutes: [],
          declaredRoutePaths: [],
          dynamicRoutePatterns: [],
        };
      const routePlan =
        condition === "missing plan" ? undefined : plan(condition === "empty plan" ? [] : ["/"]);
      const merged = mergeGeneratedProjectFiles({
        chatId: "route-fail-open",
        originalFilesJson: "[]",
        generatedFiles: [home],
        resolvedScaffold: scaffold,
        routePlan,
      });
      expect((JSON.parse(merged.filesJson) as CodeFile[]).map((file) => file.path).sort()).toEqual(
        [...sharedPaths, ...routePaths].sort(),
      );
      const prompt = serializeScaffoldForPrompt(scaffold, mode, {
        maxChars: 50_000,
        routePlan,
        ...extraOptions,
      });
      for (const path of [...sharedPaths, ...routePaths]) expect(prompt).toContain(path);
    },
  );

  it("neutral follow-up keeps established route files even under a narrower plan", () => {
    const scaffold = fixture();
    const routePlan = plan(["/"]);
    const previousFiles: CodeFile[] = scaffold.files.map((file) => ({ ...file, language: "tsx" }));
    const merged = mergeGeneratedProjectFiles({
      chatId: "route-followup",
      originalFilesJson: "[]",
      generatedFiles: [home],
      resolvedScaffold: scaffold,
      routePlan,
      previousFiles,
    });
    expect((JSON.parse(merged.filesJson) as CodeFile[]).map((file) => file.path).sort()).toEqual(
      [...sharedPaths, ...routePaths].sort(),
    );
    const prompt = serializeScaffoldForPrompt(scaffold, mode, {
      generationMode: "followUp",
      maxChars: 50_000,
      routePlan,
      ...extraOptions,
    });
    for (const path of [...sharedPaths, ...routePaths]) expect(prompt).toContain(path);
  });
});

describe("extracted route policy retains its existing classification", () => {
  it("reports the deepest owner and keeps descendants when their parent is delivered", () => {
    const contract = fixture().routeContract;
    const dropped = resolveScaffoldRouteDelivery(contract, plan(["/"]))!;
    expect(dropped.classifyDrop("src\\app\\story\\[slug]\\page.tsx")).toEqual({
      routePath: "/story/[slug]",
      category: "dynamic",
    });
    expect(dropped.classifyDrop("app/must/page.tsx")).toEqual({
      routePath: "/must",
      category: "required",
    });
    expect(dropped.classifyDrop("app/maybe/page.tsx")).toEqual({
      routePath: "/maybe",
      category: "optional",
    });
    expect(dropped.classifyDrop("app/catalog/page.tsx")).toEqual({
      routePath: "/catalog",
      category: "declared",
    });
    expect(dropped.classifyDrop("app/catalogue/page.tsx")).toBeNull();
    expect(
      resolveScaffoldRouteDelivery(contract, plan(["/", "/story"]))!.classifyDrop(
        "src/app/story/[slug]/page.tsx",
      ),
    ).toBeNull();
  });

  it("retains normalization, exact route boundaries and shared files", () => {
    expect(isUnderRoutePath("src\\app\\catalog\\page.tsx", ["/catalog"])).toBe(true);
    expect(isUnderRoutePath("app/catalogue/page.tsx", ["/catalog"])).toBe(false);
    const delivered = resolveScaffoldRouteDelivery(
      fixture().routeContract,
      plan(["/", "catalog/", "/catalog"]),
    )!;
    expect(delivered.plannedRoutePaths).toEqual(["/", "/catalog"]);
    expect(delivered.classifyDrop("app/product/[id]/page.tsx")).toBeNull();
    for (const path of sharedPaths) expect(delivered.classifyDrop(path)).toBeNull();
  });
});
