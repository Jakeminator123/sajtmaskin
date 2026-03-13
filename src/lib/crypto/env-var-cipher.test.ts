import { afterEach, describe, expect, it, vi } from "vitest";

async function loadCipherWithKey(value: string | undefined) {
  vi.resetModules();
  vi.doMock("@/lib/config", () => ({
    SECRETS: {
      get envVarEncryptionKey() {
        return value ?? "";
      },
    },
  }));
  return import("./env-var-cipher");
}

afterEach(() => {
  vi.resetModules();
});

describe("env-var-cipher disabled key handling", () => {
  it.each([undefined, "", " ", "n", "N", "no", "NO", "false", "0", "off", "disabled"])(
    "treats %p as disabled",
    async (value) => {
      const cipher = await loadCipherWithKey(value);

      expect(cipher.hasEnvVarEncryptionKey()).toBe(false);
      expect(cipher.encryptValue("super-secret")).toBe("super-secret");
    },
  );

  it("encrypts and decrypts when a real key is configured", async () => {
    const cipher = await loadCipherWithKey("unit-test-env-key");

    expect(cipher.hasEnvVarEncryptionKey()).toBe(true);

    const encrypted = cipher.encryptValue("super-secret");
    expect(encrypted).toMatch(/^enc:/);
    expect(encrypted).not.toBe("super-secret");
    expect(cipher.decryptValue(encrypted)).toBe("super-secret");
  });
});
