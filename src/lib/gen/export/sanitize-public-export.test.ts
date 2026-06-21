import { describe, expect, it } from "vitest";
import { sanitizeEnvSecretsForPublicExport } from "./sanitize-public-export";

describe("sanitizeEnvSecretsForPublicExport (B11)", () => {
  it("redacts the canonical env.example (no leading dot) — the F3 real-value vector", () => {
    const out = sanitizeEnvSecretsForPublicExport([
      {
        path: "env.example",
        content: "# env.example — DOCUMENTATION\nSTRIPE_SECRET_KEY=sk_live_real123\nNEXT_PUBLIC_X=ok\n",
        language: "text",
      },
    ]);
    const env = out[0]!.content;
    expect(env).toContain("# env.example — DOCUMENTATION");
    expect(env).toContain("STRIPE_SECRET_KEY=");
    expect(env).not.toContain("sk_live_real123");
    expect(env).toContain("NEXT_PUBLIC_X=");
    expect(env).not.toContain("=ok");
  });

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

  it("redacts .env, .env.production, .env.example and legacy env.env too", () => {
    const out = sanitizeEnvSecretsForPublicExport([
      { path: ".env", content: "DB_URL=postgres://u:p@h/db", language: "text" },
      { path: ".env.production", content: "KEY=realvalue", language: "text" },
      { path: ".env.example", content: "STRIPE_SECRET_KEY=sk_test_example", language: "text" },
      { path: "env.env", content: "LEGACY_SECRET=still_real", language: "text" },
    ]);
    expect(out[0]!.content).toBe("DB_URL=");
    expect(out[1]!.content).toBe("KEY=");
    expect(out[2]!.content).toBe("STRIPE_SECRET_KEY=");
    expect(out[3]!.content).toBe("LEGACY_SECRET=");
  });

  it("drops multiline / continuation values so no wrapped secret survives", () => {
    const out = sanitizeEnvSecretsForPublicExport([
      {
        path: ".env.local",
        content: 'PRIVATE_KEY="-----BEGIN-----\nMIIsecretline\n-----END-----"\nNEXT=ok\n',
        language: "text",
      },
    ]);
    const env = out[0]!.content;
    expect(env).toContain("PRIVATE_KEY=");
    expect(env).not.toContain("MIIsecretline");
    expect(env).not.toContain("BEGIN");
    expect(env).toContain("NEXT=");
  });

  it("leaves non-env files untouched", () => {
    const out = sanitizeEnvSecretsForPublicExport([
      { path: "app/page.tsx", content: "const x = 1;", language: "tsx" },
      { path: "README.md", content: "KEY=looks-like-env-but-isnt", language: "text" },
    ]);
    expect(out[0]!.content).toBe("const x = 1;");
    expect(out[1]!.content).toBe("KEY=looks-like-env-but-isnt");
  });

  it("splits only on the first '=' (values containing '=' are still dropped)", () => {
    const out = sanitizeEnvSecretsForPublicExport([
      { path: ".env.local", content: "TOKEN=a=b=c", language: "text" },
    ]);
    expect(out[0]!.content).toBe("TOKEN=");
  });
});
