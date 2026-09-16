import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getUserByVerificationToken = vi.hoisted(() => vi.fn());
const markEmailVerified = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/users", () => ({
  getUserByVerificationToken,
  markEmailVerified,
}));

vi.mock("@/lib/config", () => ({
  URLS: { baseUrl: "https://example.test" },
}));

import { GET } from "./route";

describe("GET /api/auth/verify-email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserByVerificationToken.mockResolvedValue({ id: "user_1" });
    markEmailVerified.mockResolvedValue(undefined);
  });

  it("returns to the invitation after a successful verify", async () => {
    const response = await GET(
      new NextRequest(
        "https://example.test/api/auth/verify-email?token=tok&returnTo=/kostnadsfri/zax-2-0-ab",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://example.test/kostnadsfri/zax-2-0-ab?verified=success",
    );
    expect(markEmailVerified).toHaveBeenCalledWith("user_1");
  });

  it("ignores a foreign returnTo", async () => {
    const response = await GET(
      new NextRequest(
        "https://example.test/api/auth/verify-email?token=tok&returnTo=https://evil.example/",
      ),
    );

    expect(response.headers.get("location")).toBe("https://example.test/?verified=success");
  });
});
