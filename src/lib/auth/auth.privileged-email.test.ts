import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getUserByEmail,
  isAdminEmail,
  markEmailVerified,
  setUserDiamonds,
  updateUserLastLogin,
} from "@/lib/db/services/users";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
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

import { hashPassword, loginUser } from "./auth";

describe("loginUser privileged-address ownership gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAdminEmail).mockReturnValue(true);
  });

  it("does not bootstrap an unverified privileged database row", async () => {
    const password = "password123";
    vi.mocked(getUserByEmail).mockResolvedValue({
      id: "user_unverified",
      email: "privileged@example.test",
      name: "Unverified",
      password_hash: hashPassword(password),
      email_verified: false,
      diamonds: 0,
    } as Awaited<ReturnType<typeof getUserByEmail>>);

    const result = await loginUser("privileged@example.test", password);

    expect(result).toEqual({
      error:
        "Du måste bekräfta din e-post innan du kan logga in. Använd 'Skicka verifieringsmail igen' i inloggningsrutan.",
    });
    expect(markEmailVerified).not.toHaveBeenCalled();
    expect(setUserDiamonds).not.toHaveBeenCalled();
    expect(updateUserLastLogin).not.toHaveBeenCalled();
  });
});
