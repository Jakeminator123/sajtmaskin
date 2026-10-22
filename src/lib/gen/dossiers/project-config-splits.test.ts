import { describe, expect, it } from "vitest";

import { getDossierById, getDossierFileContent, getDossierInstructions } from "./registry";

function instructions(id: string): string {
  return getDossierInstructions("hard", id);
}

describe("dossier project configuration splits", () => {
  it("keeps Clerk security middleware verbatim while route policy stays rewritable", () => {
    const clerk = getDossierById("clerk-auth");
    expect(clerk).toBeDefined();
    expect(clerk?.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "components/middleware.ts",
          role: "server",
          injectionMode: "verbatim",
        }),
        expect.objectContaining({
          path: "components/lib/clerk/protected-routes.ts",
          role: "shared",
          injectionMode: "rewritable",
        }),
      ]),
    );

    const middleware = getDossierFileContent("hard", "clerk-auth", "components/middleware.ts");
    const policy = getDossierFileContent(
      "hard",
      "clerk-auth",
      "components/lib/clerk/protected-routes.ts",
    );
    expect(middleware).toContain('from "./lib/clerk/protected-routes"');
    expect(middleware).toContain("createRouteMatcher(protectedRoutes)");
    expect(middleware).toContain("await auth.protect()");
    expect(middleware).toContain("return NextResponse.next()");
    expect(middleware).toContain('"/(api|trpc)(.*)"');
    expect(policy).toContain("export const protectedRoutes");
    for (const route of ["/dashboard", "/app", "/medlem", "/account", "/api/protected"]) {
      expect(policy).toContain(`"${route}(.*)"`);
    }
  });

  it("makes only Resend presentation rewritable and preserves the server payload contract", () => {
    const resend = getDossierById("resend-contact-form");
    const contactForm = resend?.files?.find((file) => file.path === "components/contact-form.tsx");
    const route = resend?.files?.find(
      (file) => file.path === "components/api/contact/route.ts",
    );
    expect(contactForm?.injectionMode).toBe("rewritable");
    expect(route?.injectionMode).toBe("verbatim");
    expect(instructions("resend-contact-form")).toContain("`name`, `email`, and `message`");
    expect(instructions("resend-contact-form")).toContain("server payload");
  });

  it("does not impose Drizzle when Prisma is explicit or authorize live database writes", () => {
    expect(instructions("postgres-drizzle")).toContain("Prisma");
    expect(instructions("postgres-drizzle")).toContain("do not add Drizzle");
    expect(instructions("postgres-drizzle")).toContain("authorized test environment");
    expect(instructions("postgres-drizzle")).not.toContain(
      "Apply migrations to the target database",
    );
  });

  it("describes Stripe as one-time Buy now rather than a subscription", () => {
    expect(instructions("stripe-checkout")).toContain("one-time Price");
    expect(instructions("stripe-checkout")).toContain("Buy now");
    expect(instructions("stripe-checkout")).not.toMatch(/\$29\s*\/\s*month|Subscribe/i);
  });
});
