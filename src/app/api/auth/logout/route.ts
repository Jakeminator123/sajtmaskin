/**
 * API Route: Logout user
 * POST /api/auth/logout
 */

import { NextResponse } from "next/server";
import { clearAuthCookie } from "@/lib/auth/auth";
import { expireCookieSetOptions } from "@/lib/auth/host-cookies";
import {
  CAMPAIGN_CLAIM_COOKIE_HOST,
  CAMPAIGN_CLAIM_COOKIE_LEGACY,
} from "@/lib/kostnadsfri/campaign-account-ticket";

export async function POST() {
  try {
    await clearAuthCookie();

    const response = NextResponse.json({
      success: true,
      message: "Du har loggats ut",
    });
    response.cookies.set({
      name: CAMPAIGN_CLAIM_COOKIE_HOST,
      value: "",
      ...expireCookieSetOptions(true),
    });
    response.cookies.set({
      name: CAMPAIGN_CLAIM_COOKIE_LEGACY,
      value: "",
      ...expireCookieSetOptions(false),
    });
    return response;
  } catch (error) {
    console.error("[API/auth/logout] Error:", error);
    return NextResponse.json(
      { success: false, error: "Något gick fel vid utloggning" },
      { status: 500 },
    );
  }
}
