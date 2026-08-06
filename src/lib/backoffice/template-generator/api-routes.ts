/**
 * Generate the auth API route
 */
export function generateAuthRoute(): string {
  return `import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const COOKIE_NAME = "backoffice_session";
const SESSION_MAX_AGE = 8 * 60 * 60; // 8 hours
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const SESSION_VERSION_DEFAULT = "1";

// In-memory rate limiter for brute-force protection
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 min

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= MAX_ATTEMPTS;
}

function getClientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function hmacSign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

function getSessionVersion(): string {
  const raw = process.env.BACKOFFICE_SESSION_VERSION?.trim();
  if (!raw) return SESSION_VERSION_DEFAULT;
  return raw.replace(/\./g, "_");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function validateOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const host = req.headers.get("host");
  if (!host) return false;
  const allowedOrigin = \`\${IS_PRODUCTION ? "https" : "http"}://\${host}\`;
  if (origin) return origin === allowedOrigin;
  if (referer) return referer.startsWith(allowedOrigin);
  return false;
}

export function verifySessionCookie(cookieValue: string | undefined): boolean {
  if (!cookieValue) return false;
  const parts = cookieValue.split(".");
  if (parts.length !== 4) return false;

  const [tokenPart, expiry, sessionVersion, signature] = parts;
  if (Date.now() > parseInt(expiry)) return false;

  const secret = process.env.BACKOFFICE_PASSWORD;
  if (!secret) return false;
  if (sessionVersion !== getSessionVersion()) return false;

  const expected = hmacSign(tokenPart + "." + expiry + "." + sessionVersion, secret);
  return constantTimeEqual(signature, expected);
}

// POST - Login
export async function POST(req: NextRequest) {
  try {
    if (!validateOrigin(req)) {
      return NextResponse.json({ success: false, error: "Invalid origin" }, { status: 403 });
    }

    const ip = getClientIp(req);
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { success: false, error: "För många försök. Vänta och försök igen." },
        { status: 429 }
      );
    }

    const { password } = await req.json();
    const correctPassword = process.env.BACKOFFICE_PASSWORD;

    if (!correctPassword) {
      return NextResponse.json(
        { success: false, error: "Backoffice är inte konfigurerat" },
        { status: 500 }
      );
    }

    if (password !== correctPassword) {
      return NextResponse.json(
        { success: false, error: "Fel lösenord" },
        { status: 401 }
      );
    }

    const token = randomBytes(32).toString("hex");
    const expiry = Date.now() + SESSION_MAX_AGE * 1000;
    const sessionVersion = getSessionVersion();
    const signature = hmacSign(token + "." + expiry + "." + sessionVersion, correctPassword);
    const cookieValue = \`\${token}.\${expiry}.\${sessionVersion}.\${signature}\`;

    const response = NextResponse.json({ success: true });
    response.cookies.set(COOKIE_NAME, cookieValue, {
      httpOnly: true,
      secure: IS_PRODUCTION,
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });

    return response;
  } catch {
    return NextResponse.json(
      { success: false, error: "Inloggning misslyckades" },
      { status: 500 }
    );
  }
}

// GET - Verify authentication status
export async function GET(req: NextRequest) {
  const session = req.cookies.get(COOKIE_NAME);
  return NextResponse.json({ authenticated: verifySessionCookie(session?.value) });
}

// DELETE - Logout
export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(COOKIE_NAME);
  return response;
}
`;
}

/**
 * Generate the content API route
 */
export function generateContentRoute(): string {
  return `import { NextRequest, NextResponse } from "next/server";
import { verifySessionCookie, validateOrigin } from "../auth/route";
import { loadContentData, saveContentData } from "../_lib/storage";

export async function GET(req: NextRequest) {
  try {
    const session = req.cookies.get("backoffice_session");
    if (!verifySessionCookie(session?.value)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const content = await loadContentData();
    return NextResponse.json(content);
  } catch {
    return NextResponse.json(
      { error: "Failed to load content" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = req.cookies.get("backoffice_session");
    if (!verifySessionCookie(session?.value)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateOrigin(req)) {
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    }

    const { updates } = await req.json();
    const content = await loadContentData();

    for (const [id, value] of Object.entries(updates)) {
      const item = content.content.find((c: any) => c.id === id);
      if (item) item.value = value;
    }

    await saveContentData(content);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to update content" },
      { status: 500 }
    );
  }
}
`;
}

/**
 * Generate the colors API route
 */
export function generateColorsRoute(): string {
  return `import { NextRequest, NextResponse } from "next/server";
import { verifySessionCookie, validateOrigin } from "../auth/route";
import { loadColorsData, saveColorsData } from "../_lib/storage";

export async function GET(req: NextRequest) {
  try {
    const session = req.cookies.get("backoffice_session");
    if (!verifySessionCookie(session?.value)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await loadColorsData();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to load colors" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = req.cookies.get("backoffice_session");
    if (!verifySessionCookie(session?.value)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateOrigin(req)) {
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    }

    const { colors } = await req.json();
    await saveColorsData(colors);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to save colors" }, { status: 500 });
  }
}
`;
}
