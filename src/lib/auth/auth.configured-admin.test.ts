import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUser, getUserByEmail, getUserById, setVerifiedUserPassword, setUserDiamonds } from "@/lib/db/services/users";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    set: vi.fn(),
    get: vi.fn(),
    getAll: vi.fn(() => []),
    delete: vi.fn(),
  })),
  headers: vi.fn(async () => ({
    get: vi.fn(() => null),
  })),
}));

vi.mock("@/lib/db/services/users", () => ({
  getUserById: vi.fn(),
  getUserByEmail: vi.fn(),
  createUser: vi.fn(),
  createGoogleUser: vi.fn(),
  updateUserLastLogin: vi.fn(),
  isAdminEmail: vi.fn(() => true),
  setUserDiamonds: vi.fn(),
  markEmailVerified: vi.fn(),
  setVerifiedUserPassword: vi.fn(),
}));

vi.mock("@/lib/auth/edge-auth", () => ({
  isAdminEmailEdge: vi.fn(() => true),
}));

vi.mock("@/lib/config", () => ({
  SECRETS: {
    jwtSecret: "test",
    googleClientId: "",
    googleClientSecret: "",
    superadminEmail: "",
    superadminPassword: "",
    testUserEmail: "",
    testUserPassword: "",
  },
  URLS: {
    googleCallbackUrl: "https://example.test/api/auth/google/callback",
  },
  IS_PRODUCTION: false,
}));

import { createConfiguredAdminLogin, loginUser, hashPassword, verifyPassword } from "./auth";

const existingAdmin = {
  id: "user_admin",
  email: "admin@example.test",
  name: "Admin",
  password_hash: "salt:hash",
  email_verified: true,
  diamonds: 10_000,
} as Awaited<ReturnType<typeof getUserByEmail>>;

describe("createConfiguredAdminLogin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(setVerifiedUserPassword).mockReset();
    vi.stubEnv("ADMIN_CREDENTIALS", "Admin:password123: Admin@Example.TEST :Admin");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("looks up a mixed-case configured email in lowercase", async () => {
    vi.mocked(getUserByEmail).mockResolvedValue(existingAdmin);
    vi.mocked(getUserById).mockResolvedValue(existingAdmin);

    const result = await createConfiguredAdminLogin();

    expect(getUserByEmail).toHaveBeenCalledWith("admin@example.test");
    expect(createUser).not.toHaveBeenCalled();
    expect(result).toEqual({ token: expect.any(String) });
  });

  it.each(["env", "handoff"])("replaces the pre-account password before %s bootstrap", async (method) => {
    const user = { ...existingAdmin!, password_hash: hashPassword("old-password"), email_verified: false };
    vi.mocked(getUserByEmail).mockResolvedValue(user);
    vi.mocked(getUserById).mockResolvedValue(user);
    vi.mocked(setVerifiedUserPassword).mockImplementation(async (_id, hash) => {
      user.password_hash = hash;
      user.email_verified = true;
    });
    expect(await loginUser(user.email!, "old-password")).toHaveProperty("error");
    const result = method === "env" ? await loginUser("Admin", "password123") : await createConfiguredAdminLogin();
    expect(result).toHaveProperty("token");
    expect(verifyPassword("old-password", user.password_hash)).toBe(false);
    expect(verifyPassword("password123", user.password_hash)).toBe(true);
    expect(await loginUser(user.email!, "old-password")).toHaveProperty("error");
  });

  it("does not mint a session or grant privileges if replacing the secret fails", async () => {
    vi.mocked(getUserByEmail).mockResolvedValue(existingAdmin);
    vi.mocked(setVerifiedUserPassword).mockRejectedValueOnce(new Error("write failed"));
    await expect(createConfiguredAdminLogin()).rejects.toThrow("write failed");
    expect(setUserDiamonds).not.toHaveBeenCalled();
  });
});
