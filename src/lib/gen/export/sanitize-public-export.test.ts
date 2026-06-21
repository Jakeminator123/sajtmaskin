import { describe, expect, it } from "vitest";
import { sanitizeEnvSecretsForPublicExport } from "./sanitize-public-export";

describe("sanitizeEnvSecretsForPublicExport (B11)", () => {
  it("redacts values in .env.local but keeps keys, comments and blanks", () => {
    const out = sanitizeEnvSecretsForPublicExport([
      {
        path: ".env.local",
        content: "# secrets\nSTRIPE_SECRET_KEY=sk_test_abc123\n\nNEXT_PUBLIC_URL=https://x.example\n",
        language: "text",
      },
    ]);
    const env = out[0]!.content;
    expect(env).toContain("# secrets");
    expect(env).toContain("STRIPE_SECRET_KEY=");
    expect(env).not.toContain("sk_test_abc123");
    expect(env).toContain("NEXT_PUBLIC_URL=");
    expect(env).not.toContain("https://x.example");
  });

  it("redacts other dotenv files (.env, .env.production) too", () => {
    const out = sanitizeEnvSecretsForPublicExport([
      { path: ".env", content: "DB_URL=postgres://u:p@h/db", language: "text" },
      { path: ".env.production", content: "KEY=realvalue", language: "text" },
    ]);
    expect(out[0]!.content).toBe("DB_URL=");
    expect(out[1]!.content).toBe("KEY=");
  });

  it("leaves .env.example templates and non-env files untouched", () => {
    const input = [
      { path: ".env.example", content: "STRIPE_SECRET_KEY=sk_test_example", language: "text" as const },
      { path: "app/page.tsx", content: "const x = 1;", language: "tsx" as const },
    ];
    const out = sanitizeEnvSecretsForPublicExport(input);
    expect(out[0]!.content).toBe("STRIPE_SECRET_KEY=sk_test_example");
    expect(out[1]!.content).toBe("const x = 1;");
  });

  it("splits only on the first '=' (values containing '=' are still dropped)", () => {
    const out = sanitizeEnvSecretsForPublicExport([
      { path: ".env.local", content: "TOKEN=a=b=c", language: "text" },
    ]);
    expect(out[0]!.content).toBe("TOKEN=");
  });
});
