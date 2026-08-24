import { describe, expect, it } from "vitest";
import { scrubOpenClawReadText } from "./scrub";

describe("OpenClaw read-tool scrubbing", () => {
  it.each([
    "Authorization: Bearer abcdefghijklmnopqrstuvwxyz",
    "api_key=sk-proj-abcdefghijklmnopqrstuvwxyz",
    "password: super-secret-value",
    "DATABASE_URL=postgres://owner:password@database.example/app",
    "https://user:password@example.test/path?token=top-secret",
    "github=ghp_abcdefghijklmnopqrstuvwxyz1234567890",
    "jwt=eyJabcdefghijk.eyJabcdefghijk.abcdefghijklmno",
    "OPENCLAW_API_KEY=literal-secret-value",
    "SUPABASE_SERVICE_ROLE_KEY=literal-service-secret",
    "STRIPE_SECRET_KEY=literal-stripe-secret-value",
    '{"OPENCLAW_GATEWAY_TOKEN":"literal-gateway-token"}',
    "openclawApiKey=literal-camel-secret",
    "stripeSecretKey=literal-camel-stripe-secret",
    "awsSecretAccessKey=literal-aws-secret",
    "sessionToken=literal-session-token",
  ])("redacts credential-shaped value in %s", (input) => {
    const result = scrubOpenClawReadText(input);
    expect(result.redacted).toBe(true);
    expect(result.text).toContain("[REDACTED]");
    expect(result.text).not.toContain("super-secret-value");
    expect(result.text).not.toContain("top-secret");
  });

  it("redacts complete PEM and PGP private-key blocks", () => {
    const input = [
      "before",
      "-----BEGIN PRIVATE KEY-----",
      "literal-private-key-material",
      "-----END PRIVATE KEY-----",
      "-----BEGIN PGP PRIVATE KEY BLOCK-----",
      "literal-pgp-private-key-material",
      "-----END PGP PRIVATE KEY BLOCK-----",
      "after",
    ].join("\n");
    const result = scrubOpenClawReadText(input);
    expect(result.redacted).toBe(true);
    expect(result.text).not.toContain("literal-private-key-material");
    expect(result.text).not.toContain("literal-pgp-private-key-material");
    expect(result.text.match(/\[REDACTED PRIVATE KEY\]/g)).toHaveLength(2);
  });

  it("preserves environment references while removing control characters", () => {
    const result = scrubOpenClawReadText(
      "apiKey = process.env.OPENAI_API_KEY\u0000\npassword=${APP_PASSWORD}",
    );
    expect(result.text).toContain("process.env.OPENAI_API_KEY");
    expect(result.text).toContain("${APP_PASSWORD}");
    expect(result.text).not.toContain("\u0000");
    expect(result.redacted).toBe(true);
  });

  it("applies a hard output length cap", () => {
    const result = scrubOpenClawReadText("x".repeat(100), { maxChars: 12 });
    expect(result.text).toHaveLength(12);
    expect(result.truncated).toBe(true);
  });
});
