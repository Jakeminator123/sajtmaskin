/**
 * API Route: Login user
 * POST /api/auth/login
 */

import { NextRequest, NextResponse } from "next/server";
import { loginUser, setAuthCookie } from "@/lib/auth/auth";
import { withRateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  return withRateLimit(req, "auth:login", async () => {
    try {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return NextResponse.json({ success: false, error: "Ogiltig request body" }, { status: 400 });
      }
      const { email, password } = body as {
        email?: string;
        password?: string;
      };

      // Validate input
      if (!email || !password) {
        return NextResponse.json(
          { success: false, error: "E-post och lösenord krävs" },
          { status: 400 },
        );
      }

      // Login user
      const result = await loginUser(email, password);

      if ("error" in result) {
        const isGoogleOnly = result.error.toLowerCase().includes("google");
        const requiresEmailVerification = result.error
          .toLowerCase()
          .includes("bekräfta din e-post");
        return NextResponse.json(
          {
            success: false,
            error: result.error,
            requiresEmailVerification,
          },
          // Keep expected auth-state errors as 200 to avoid noisy browser "failed resource" logs.
          { status: isGoogleOnly || requiresEmailVerification ? 200 : 401 },
        );
      }

      // Set auth cookie
      await setAuthCookie(result.token, { secure: req.nextUrl.protocol === "https:" });

      // Return user data (without sensitive fields)
      return NextResponse.json({
        success: true,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          image: result.user.image,
          diamonds: result.user.diamonds,
          provider: result.user.provider,
          emailVerified: result.user.email_verified,
        },
      });
    } catch (error) {
      console.error("[API/auth/login] Error:", error);
      return NextResponse.json(
        { success: false, error: "Något gick fel vid inloggning" },
        { status: 500 },
      );
    }
  });
}
