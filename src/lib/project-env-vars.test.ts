import { beforeEach, describe, expect, it, vi } from "vitest";

const { getProjectData, saveProjectData } = vi.hoisted(() => ({
  getProjectData: vi.fn(),
  saveProjectData: vi.fn(),
}));

vi.mock("@/lib/db/services", () => ({
  getProjectData,
  saveProjectData,
}));

vi.mock("@/lib/config", () => ({
  SECRETS: {
    envVarEncryptionKey: "unit-test-env-key",
  },
}));

import * as envVarCipher from "./crypto/env-var-cipher";
import {
  deleteStoredProjectEnvVars,
  getStoredProjectEnvVarMap,
  getStoredProjectEnvVars,
  upsertStoredProjectEnvVars,
} from "./project-env-vars";

describe("project env var storage invariants", () => {
  beforeEach(() => {
    getProjectData.mockReset();
    saveProjectData.mockReset();
    saveProjectData.mockResolvedValue(undefined);
  });

  it("keeps untouched sensitive values encrypted during unrelated upserts", async () => {
    const encryptedApiKey = envVarCipher.encryptValue("super-secret");
    getProjectData.mockResolvedValue({
      meta: {
        projectEnvVars: [
          {
            id: "env_1",
            key: "API_KEY",
            value: encryptedApiKey,
            sensitive: true,
            createdAt: "2026-03-13T00:00:00.000Z",
            updatedAt: "2026-03-13T00:00:00.000Z",
          },
        ],
      },
    });

    const nextEnvVars = await upsertStoredProjectEnvVars("proj_1", [
      { key: "PUBLIC_URL", value: "https://example.com", sensitive: false },
    ]);

    const savedMeta = saveProjectData.mock.calls[0][0].meta as {
      projectEnvVars: Array<{ key: string; value: string; sensitive: boolean }>;
    };
    const savedApiKey = savedMeta.projectEnvVars.find((item) => item.key === "API_KEY");
    const savedPublicUrl = savedMeta.projectEnvVars.find((item) => item.key === "PUBLIC_URL");

    expect(savedApiKey?.value).toBe(encryptedApiKey);
    expect(savedApiKey?.sensitive).toBe(true);
    expect(savedPublicUrl?.value).toBe("https://example.com");
    expect(savedPublicUrl?.sensitive).toBe(false);

    expect(nextEnvVars.find((item) => item.key === "API_KEY")?.value).toBe("********");
    expect(nextEnvVars.find((item) => item.key === "PUBLIC_URL")?.value).toBe(
      "https://example.com",
    );
  });

  it("keeps remaining sensitive values encrypted during deletes", async () => {
    const encryptedApiKey = envVarCipher.encryptValue("super-secret");
    getProjectData.mockResolvedValue({
      meta: {
        projectEnvVars: [
          {
            id: "env_1",
            key: "API_KEY",
            value: encryptedApiKey,
            sensitive: true,
            createdAt: "2026-03-13T00:00:00.000Z",
            updatedAt: "2026-03-13T00:00:00.000Z",
          },
          {
            id: "env_2",
            key: "PUBLIC_URL",
            value: "https://example.com",
            sensitive: false,
            createdAt: "2026-03-13T00:00:00.000Z",
            updatedAt: "2026-03-13T00:00:00.000Z",
          },
        ],
      },
    });

    const nextEnvVars = await deleteStoredProjectEnvVars("proj_1", {
      keys: ["PUBLIC_URL"],
    });

    const savedMeta = saveProjectData.mock.calls[0][0].meta as {
      projectEnvVars: Array<{ key: string; value: string; sensitive: boolean }>;
    };

    expect(savedMeta.projectEnvVars).toHaveLength(1);
    expect(savedMeta.projectEnvVars[0]).toMatchObject({
      key: "API_KEY",
      value: encryptedApiKey,
      sensitive: true,
    });
    expect(nextEnvVars).toHaveLength(1);
    expect(nextEnvVars[0]).toMatchObject({
      key: "API_KEY",
      value: "********",
      sensitive: true,
    });
  });

  it("returns decrypted runtime values from stored project env vars", async () => {
    getProjectData.mockResolvedValue({
      meta: {
        projectEnvVars: [
          {
            id: "env_1",
            key: "API_KEY",
            value: envVarCipher.encryptValue("super-secret"),
            sensitive: true,
          },
          {
            id: "env_2",
            key: "PUBLIC_URL",
            value: "https://example.com",
            sensitive: false,
          },
        ],
      },
    });

    await expect(getStoredProjectEnvVarMap("proj_1")).resolves.toEqual({
      API_KEY: "super-secret",
      PUBLIC_URL: "https://example.com",
    });
  });

  it("masks sensitive values in display reads", async () => {
    getProjectData.mockResolvedValue({
      meta: {
        projectEnvVars: [
          {
            id: "env_1",
            key: "API_KEY",
            value: envVarCipher.encryptValue("super-secret"),
            sensitive: true,
          },
        ],
      },
    });

    await expect(getStoredProjectEnvVars("proj_1")).resolves.toEqual([
      expect.objectContaining({
        key: "API_KEY",
        value: "********",
        sensitive: true,
      }),
    ]);
  });

  it("fails closed when sensitive env vars are saved without an encryption key", async () => {
    getProjectData.mockResolvedValue({ meta: null });
    const keySpy = vi.spyOn(envVarCipher, "hasEnvVarEncryptionKey").mockReturnValue(false);

    await expect(
      upsertStoredProjectEnvVars("proj_1", [
        { key: "API_KEY", value: "super-secret", sensitive: true },
      ]),
    ).rejects.toThrow("ENV_VAR_ENCRYPTION_KEY");

    expect(saveProjectData).not.toHaveBeenCalled();
    keySpy.mockRestore();
  });
});
