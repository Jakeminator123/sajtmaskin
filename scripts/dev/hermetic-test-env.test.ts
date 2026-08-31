import { describe, expect, it } from "vitest";

import { HERMETIC_TEST_ENV_KEYS, scrubHermeticTestEnv } from "./hermetic-test-env";

describe("hermetic unit-test environment", () => {
  it("removes runtime credentials without touching unrelated process settings", () => {
    const env: NodeJS.ProcessEnv = {
      OPENAI_API_KEY: "real-key-that-must-not-leak-into-tests",
      REDIS_URL: "redis://runtime",
      POSTGRES_URL: "postgres://runtime",
      NODE_ENV: "test",
      CI: "true",
      PATH: "/bin",
    };

    scrubHermeticTestEnv(env);

    expect(env).toEqual({ NODE_ENV: "test", CI: "true", PATH: "/bin" });
  });

  it("covers the known injected environments that previously changed test behavior", () => {
    expect(HERMETIC_TEST_ENV_KEYS).toEqual(
      expect.arrayContaining([
        "OPENAI_API_KEY",
        "REDIS_URL",
        "VERCEL_PROJECT_ID",
        "KOSTNADSFRI_API_KEY",
        "OC_REPO_READ_TOKEN",
      ]),
    );
  });
});
