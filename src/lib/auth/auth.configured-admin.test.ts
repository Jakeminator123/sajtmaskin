import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUser, getUserByEmail, getUserById } from "@/lib/db/services/users";

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

import { createConfiguredAdminLogin } from "./auth";

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
});
