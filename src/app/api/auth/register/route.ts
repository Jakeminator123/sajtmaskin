/**
 * API Route: Register new user
 * POST /api/auth/register
 */

import { NextRequest, NextResponse } from "next/server";
import { registerUser, setAuthCookie } from "@/lib/auth/auth";
import { createTransaction } from "@/lib/data/database";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, name } = body as {
      email?: string;
      password?: string;
      name?: string;
    };

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "E-post och lösenord krävs" },
        { status: 400 },
      );
    }

    // Register user
    const result = await registerUser(email, password, name);

    if ("error" in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    // Record signup bonus transaction
    createTransaction(
      result.user.id,
      "signup_bonus",
      0, // Already have 5 diamonds from creation
      "Välkomstbonus vid registrering",
    );

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
    console.error("[API/auth/register] Error:", error);
    return NextResponse.json(
      { success: false, error: "Något gick fel vid registrering" },
      { status: 500 },
    );
  }
}
