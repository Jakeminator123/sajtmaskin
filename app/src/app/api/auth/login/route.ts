/**
 * API Route: Login user
 * POST /api/auth/login
 */

import { NextRequest, NextResponse } from "next/server";
import { loginUser, setAuthCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body as {
      email?: string;
      password?: string;
    };

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "E-post och lösenord krävs" },
        { status: 400 }
      );
    }

    // Login user
    const result = await loginUser(email, password);

    if ("error" in result) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 401 }
      );
    }

    // Set auth cookie
    await setAuthCookie(result.token);

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
      },
    });
  } catch (error) {
    console.error("[API/auth/login] Error:", error);
    return NextResponse.json(
      { success: false, error: "Något gick fel vid inloggning" },
      { status: 500 }
    );
  }
}
