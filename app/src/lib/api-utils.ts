/**
 * Shared API utilities
 *
 * Common functions used across API routes to reduce duplication.
 * Uses centralized SECRETS from config.ts for security.
 */

import { NextResponse } from "next/server";
import { SECRETS, FEATURES } from "./config";

/**
 * Get OpenAI API key from centralized config
 */
export function getOpenAIApiKey(): string | null {
  const key = SECRETS.openaiApiKey;
  return key || null;
}

/**
 * Get Google Maps API key from centralized config
 */
export function getGoogleMapsApiKey(): string | null {
  const key = SECRETS.googleApiKey;
  return key || null;
}

/**
 * Get Pexels API key from centralized config
 */
export function getPexelsApiKey(): string | null {
  const key = SECRETS.pexelsApiKey;
  return key || null;
}

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(feature: keyof typeof FEATURES): boolean {
  return FEATURES[feature];
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
