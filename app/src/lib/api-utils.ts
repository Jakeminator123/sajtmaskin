/**
 * Shared API utilities
 *
 * Common functions used across API routes to reduce duplication.
 */

import { NextResponse } from "next/server";

/**
 * Get OpenAI API key from environment
 * Checks both OPENAI_API_KEY and OPEN_AI_API for compatibility
 */
export function getOpenAIApiKey(): string | null {
  return process.env.OPENAI_API_KEY || process.env.OPEN_AI_API || null;
}

/**
 * Get Google Maps API key from environment
 */
export function getGoogleMapsApiKey(): string | null {
  return process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY || null;
}

/**
 * Get Pexels API key from environment
 */
export function getPexelsApiKey(): string | null {
  return process.env.PEXELS_API_KEY || null;
}

/**
 * Standard error responses
 */
export const ApiErrors = {
  unauthorized: () =>
    NextResponse.json(
      { success: false, error: "API key not configured" },
      { status: 500 }
    ),

  badRequest: (message: string) =>
    NextResponse.json({ success: false, error: message }, { status: 400 }),

  notFound: (message = "Not found") =>
    NextResponse.json({ success: false, error: message }, { status: 404 }),

  rateLimited: () =>
    NextResponse.json(
      { success: false, error: "Rate limit exceeded. Try again later." },
      { status: 429 }
    ),

  serverError: (message = "An error occurred") =>
    NextResponse.json({ success: false, error: message }, { status: 500 }),
};

/**
 * Log API request with timestamp and route info
 */
export function logApiRequest(route: string, message: string, data?: unknown) {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[${timestamp}] [${route}] ${message}`, data);
  } else {
    console.log(`[${timestamp}] [${route}] ${message}`);
  }
}

/**
 * Safe JSON parse with fallback
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + "...";
}
