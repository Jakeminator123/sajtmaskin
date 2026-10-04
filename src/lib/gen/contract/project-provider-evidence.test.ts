import { describe, expect, it } from "vitest";
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
});
