import { describe, expect, it } from "vitest";
import { getPreGenerationContractsConfigFromManifest } from "@/lib/ai-models/load-manifest";
import { detectProjectProviderEvidence } from "./project-provider-evidence";

const rules = [
  { providerKey: "auth0", dossierCapability: "auth", packageRoots: ["@auth0/nextjs-auth0"] },
  { providerKey: "next-auth", dossierCapability: "auth", packageRoots: ["next-auth"] },
  {
    kind: "payment" as const,
    providerKey: "stripe-elements",
    packageRoots: ["@stripe/react-stripe-js", "@stripe/stripe-js"],
  },
];

describe("detectProjectProviderEvidence", () => {
  it("requires both a declared package and a runtime AST import", () => {
    expect(
      detectProjectProviderEvidence(
        [
          {
            path: "package.json",
            content: JSON.stringify({ dependencies: { "@auth0/nextjs-auth0": "^4.0.0" } }),
          },
          {
            path: "app/api/auth/route.ts",
            content: 'import { handleAuth } from "@auth0/nextjs-auth0";\nexport const GET = handleAuth();',
          },
        ],
        rules,
      ),
    ).toEqual([
      expect.objectContaining({
        providerKey: "auth0",
        dossierCapability: "auth",
        packageRoot: "@auth0/nextjs-auth0",
      }),
    ]);
  });

  it.each([
    ['import "next-auth";', "side-effect import"],
    ['import NextAuth, { type Session } from "next-auth";', "mixed value import"],
    ['export { default as NextAuth, type Session } from "next-auth";', "mixed value export"],
    ['const NextAuth = require("next-auth");', "global CommonJS require"],
    ['const NextAuth = await import("next-auth");', "dynamic import"],
  ])("accepts %s as runtime evidence (%s)", (content) => {
    expect(
      detectProjectProviderEvidence(
        [
          { path: "package.json", content: JSON.stringify({ dependencies: { "next-auth": "5" } }) },
          { path: "lib/auth.ts", content },
        ],
        rules,
      ),
    ).toEqual([expect.objectContaining({ providerKey: "next-auth" })]);
  });

  it.each([
    ["package-only", []],
    ["type-only", [{ path: "lib/auth.ts", content: 'import type { Session } from "next-auth";' }]],
    ["named type-only import", [{ path: "lib/auth.ts", content: 'import { type Session } from "next-auth";' }]],
    ["named type-only export", [{ path: "lib/auth.ts", content: 'export { type Session } from "next-auth";' }]],
    ["comment", [{ path: "lib/auth.ts", content: '// import x from "next-auth"' }]],
    ["ordinary string", [{ path: "lib/auth.ts", content: 'const packageName = "next-auth";' }]],
    ["shadowed require", [{ path: "lib/auth.ts", content: 'const require = (x: string) => x; require("next-auth");' }]],
    ["parse failure", [{ path: "lib/auth.ts", content: 'import { broken from "next-auth";' }]],
  ])("does not treat %s as positive evidence", (_name, extraFiles) => {
    expect(
      detectProjectProviderEvidence(
        [
          { path: "package.json", content: JSON.stringify({ dependencies: { "next-auth": "5" } }) },
          ...extraFiles,
        ],
        rules,
      ),
    ).toEqual([]);
  });

  it("does not accept an import without a direct package declaration", () => {
    expect(
      detectProjectProviderEvidence(
        [{ path: "lib/auth.ts", content: 'const auth = require("next-auth");' }],
        rules,
      ),
    ).toEqual([]);
  });

  it.each(["@stripe/react-stripe-js", "@stripe/stripe-js"])(
    "recognizes %s as request-local Stripe Elements method evidence",
    (packageRoot) => {
      expect(
        detectProjectProviderEvidence(
          [
            { path: "package.json", content: JSON.stringify({ dependencies: { [packageRoot]: "1" } }) },
            { path: "components/payment.tsx", content: `import { loadStripe } from "${packageRoot}"; export { loadStripe };` },
          ],
          rules,
        ),
      ).toContainEqual(
        expect.objectContaining({
          kind: "payment",
          providerKey: "stripe-elements",
          dossierCapability: undefined,
          packageRoot,
        }),
      );
    },
  );

  it.each([
    ["root array", "[]"],
    ["dependencies array", JSON.stringify({ dependencies: ["next-auth"] })],
    ["dependencies null", JSON.stringify({ dependencies: null })],
    ["devDependencies primitive", JSON.stringify({ devDependencies: "next-auth" })],
    ["malformed JSON", "{"],
  ])("rejects an invalid package.json shape: %s", (_name, packageJson) => {
    expect(
      detectProjectProviderEvidence(
        [
          { path: "package.json", content: packageJson },
          { path: "lib/auth.ts", content: 'import NextAuth from "next-auth";' },
        ],
        rules,
      ),
    ).toEqual([]);
  });

  it("keeps a real top-level require when an unrelated nested scope shadows require", () => {
    expect(
      detectProjectProviderEvidence(
        [
          { path: "package.json", content: JSON.stringify({ dependencies: { "next-auth": "5" } }) },
          {
            path: "lib/auth.ts",
            content: [
              'const auth = require("next-auth");',
              'function helper(require: (name: string) => unknown) { require("next-auth"); }',
              "export { auth, helper };",
            ].join("\n"),
          },
        ],
        rules,
      ),
    ).toEqual([expect.objectContaining({ providerKey: "next-auth" })]);
  });

  it.each([
    [
      "parameter scope",
      'function helper(require: (name: string) => unknown) { return require("next-auth"); }',
    ],
    [
      "top-level const",
      'const require = (name: string) => name; require("next-auth");',
    ],
    [
      "destructured binding",
      'const { require } = tools; require("next-auth");',
    ],
    [
      "catch binding",
      'try { throw new Error(); } catch (require) { require("next-auth"); }',
    ],
    [
      "import binding",
      'import { loader as require } from "./loader"; require("next-auth");',
    ],
  ])("suppresses a require call only where %s shadows the global", (_name, content) => {
    expect(
      detectProjectProviderEvidence(
        [
          { path: "package.json", content: JSON.stringify({ dependencies: { "next-auth": "5" } }) },
          { path: "lib/auth.ts", content },
        ],
        rules,
      ),
    ).toEqual([]);
  });

  it("does not let a block-scoped require hide a sibling global require", () => {
    expect(
      detectProjectProviderEvidence(
        [
          { path: "package.json", content: JSON.stringify({ dependencies: { "next-auth": "5" } }) },
          {
            path: "lib/auth.ts",
            content: [
              '{ const require = (name: string) => name; require("next-auth"); }',
              'const auth = require("next-auth");',
              "export { auth };",
            ].join("\n"),
          },
        ],
        rules,
      ),
    ).toEqual([expect.objectContaining({ providerKey: "next-auth" })]);
  });

  it("does not let a catch binding hide a genuine require outside the catch", () => {
    expect(
      detectProjectProviderEvidence(
        [
          { path: "package.json", content: JSON.stringify({ dependencies: { "next-auth": "5" } }) },
          {
            path: "lib/auth.ts",
            content: [
              'try { throw new Error(); } catch (require) { require("next-auth"); }',
              'const auth = require("next-auth");',
              "export { auth };",
            ].join("\n"),
          },
        ],
        rules,
      ),
    ).toEqual([expect.objectContaining({ providerKey: "next-auth" })]);
  });

  it("limits let/const require bindings to their for-loop scope", () => {
    const packageJson = {
      path: "package.json",
      content: JSON.stringify({ dependencies: { "next-auth": "5" } }),
    };
    expect(
      detectProjectProviderEvidence(
        [
          packageJson,
          {
            path: "lib/auth.ts",
            content: [
              'for (let require of loaders) { require("next-auth"); }',
              'const auth = require("next-auth");',
              "export { auth };",
            ].join("\n"),
          },
        ],
        rules,
      ),
    ).toEqual([expect.objectContaining({ providerKey: "next-auth" })]);

    for (const content of [
      'for (const require in loaders) { require("next-auth"); }',
      'for (let require = loader; ready; ready = false) { require("next-auth"); }',
    ]) {
      expect(
        detectProjectProviderEvidence(
          [packageJson, { path: "lib/auth.ts", content }],
          rules,
        ),
      ).toEqual([]);
    }
  });

  it("keeps var require function-scoped and hoisted", () => {
    expect(
      detectProjectProviderEvidence(
        [
          { path: "package.json", content: JSON.stringify({ dependencies: { "next-auth": "5" } }) },
          {
            path: "lib/auth.ts",
            content: [
              'const auth = require("next-auth");',
              "var require = loader;",
              "export { auth };",
            ].join("\n"),
          },
        ],
        rules,
      ),
    ).toEqual([]);
  });

  it.each([
    "src/auth.test.ts",
    "src/auth.spec.tsx",
    "src/__tests__/auth.ts",
    "test/auth.ts",
    "tests/auth.ts",
    "src/fixtures/auth.ts",
    "src/__fixtures__/auth.ts",
    "src/auth.fixture.ts",
    "src/auth.fixtures.tsx",
    "src/auth.stories.tsx",
    "src/auth.stories.mts",
    "src/__mocks__/auth.ts",
    "src/e2e/auth.ts",
    "src/test-utils/auth.ts",
  ])("does not accept provider imports from non-runtime test or fixture paths: %s", (path) => {
    expect(
      detectProjectProviderEvidence(
        [
          {
            path: "package.json",
            content: JSON.stringify({ devDependencies: { "next-auth": "5" } }),
          },
          { path, content: 'import NextAuth from "next-auth";' },
        ],
        rules,
      ),
    ).toEqual([]);
  });

  it("still accepts the same declared provider import from production source", () => {
    expect(
      detectProjectProviderEvidence(
        [
          {
            path: "package.json",
            content: JSON.stringify({ dependencies: { "next-auth": "5" } }),
          },
          { path: "src/auth.ts", content: 'import NextAuth from "next-auth";' },
        ],
        rules,
      ),
    ).toEqual([expect.objectContaining({ providerKey: "next-auth" })]);
  });

  it.each([
    "src/.storybook/auth.ts",
    "src/mocks/auth.ts",
    "src/auth.story.tsx",
  ])("does not broaden non-runtime filtering to unsupported heuristics: %s", (path) => {
    expect(
      detectProjectProviderEvidence(
        [
          {
            path: "package.json",
            content: JSON.stringify({ dependencies: { "next-auth": "5" } }),
          },
          { path, content: 'import NextAuth from "next-auth";' },
        ],
        rules,
      ),
    ).toEqual([expect.objectContaining({ providerKey: "next-auth" })]);
  });

  it("uses the actual manifest to prove @supabase/ssr as auth evidence only", () => {
    const evidence = detectProjectProviderEvidence(
      [
        {
          path: "package.json",
          content: JSON.stringify({ dependencies: { "@supabase/ssr": "^0.7.0" } }),
        },
        {
          path: "lib/supabase/server.ts",
          content: 'import { createServerClient } from "@supabase/ssr";',
        },
      ],
      getPreGenerationContractsConfigFromManifest().providerRules,
    );

    expect(evidence).toContainEqual(
      expect.objectContaining({
        providerKey: "supabase",
        dossierCapability: "auth",
        packageRoot: "@supabase/ssr",
      }),
    );
    expect(evidence).not.toContainEqual(
      expect.objectContaining({ providerKey: "supabase", dossierCapability: "database" }),
    );
  });

  it.each(["@ai-sdk/openai", "openai"])(
    "uses the actual manifest to prove %s as OpenAI ai-chat evidence",
    (packageRoot) => {
      const evidence = detectProjectProviderEvidence(
        [
          {
            path: "package.json",
            content: JSON.stringify({ dependencies: { [packageRoot]: "1" } }),
          },
          {
            path: "app/api/chat/route.ts",
            content: `import { openai } from "${packageRoot}"; export const model = openai;`,
          },
        ],
        getPreGenerationContractsConfigFromManifest().providerRules,
      );

      expect(evidence).toContainEqual(
        expect.objectContaining({
          providerKey: "openai",
          dossierCapability: "ai-chat",
          packageRoot,
        }),
      );
    },
  );

  it.each([
    ["package only", []],
    [
      "type-only import",
      [{ path: "app/api/chat/route.ts", content: 'import type { OpenAIProvider } from "@ai-sdk/openai";' }],
    ],
    [
      "test-only import",
      [{ path: "app/api/chat/route.test.ts", content: 'import { openai } from "@ai-sdk/openai";' }],
    ],
  ])("does not accept @ai-sdk/openai from %s", (_name, extraFiles) => {
    const evidence = detectProjectProviderEvidence(
      [
        {
          path: "package.json",
          content: JSON.stringify({ dependencies: { "@ai-sdk/openai": "1" } }),
        },
        ...extraFiles,
      ],
      getPreGenerationContractsConfigFromManifest().providerRules,
    );

    expect(evidence).not.toContainEqual(
      expect.objectContaining({ providerKey: "openai", dossierCapability: "ai-chat" }),
    );
  });
});
