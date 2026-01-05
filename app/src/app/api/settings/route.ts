import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getUserSettings,
  getOrCreateUserSettings,
  updateUserSettings,
  type UserSettings,
} from "@/lib/database";

/**
 * GET /api/settings
 * Get current user's settings
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const settings = getOrCreateUserSettings(user.id);

    // Don't expose full API keys - just indicate if they're set
    const safeSettings = {
      use_ai_gateway: settings.use_ai_gateway,
      has_ai_gateway_key: !!settings.ai_gateway_api_key,
      has_openai_key: !!settings.openai_api_key,
      has_anthropic_key: !!settings.anthropic_api_key,
      preferred_model: settings.preferred_model,
      preferred_quality: settings.preferred_quality,
      enable_streaming: settings.enable_streaming,
      enable_thinking_display: settings.enable_thinking_display,
    };

    return NextResponse.json({
      success: true,
      settings: safeSettings,
    });
  } catch (error) {
    console.error("[API:Settings:GET] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get settings" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/settings
 * Update current user's settings
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      use_ai_gateway,
      ai_gateway_api_key,
      openai_api_key,
      anthropic_api_key,
      preferred_model,
      preferred_quality,
      enable_streaming,
      enable_thinking_display,
    } = body;

    // Build update object with only provided fields
    const updates: Partial<UserSettings> = {};

    if (use_ai_gateway !== undefined) {
      updates.use_ai_gateway = Boolean(use_ai_gateway);
    }

    // Only update API keys if explicitly provided (not undefined)
    // Empty string means "clear the key"
    if (ai_gateway_api_key !== undefined) {
      updates.ai_gateway_api_key = ai_gateway_api_key || null;
    }

    if (openai_api_key !== undefined) {
      updates.openai_api_key = openai_api_key || null;
    }

    if (anthropic_api_key !== undefined) {
      updates.anthropic_api_key = anthropic_api_key || null;
    }

    if (preferred_model !== undefined) {
      updates.preferred_model = preferred_model;
    }

    if (preferred_quality !== undefined) {
      updates.preferred_quality = preferred_quality;
    }

    if (enable_streaming !== undefined) {
      updates.enable_streaming = Boolean(enable_streaming);
    }

    if (enable_thinking_display !== undefined) {
      updates.enable_thinking_display = Boolean(enable_thinking_display);
    }

    const settings = updateUserSettings(user.id, updates);

    // Return safe version
    const safeSettings = {
      use_ai_gateway: settings.use_ai_gateway,
      has_ai_gateway_key: !!settings.ai_gateway_api_key,
      has_openai_key: !!settings.openai_api_key,
      has_anthropic_key: !!settings.anthropic_api_key,
      preferred_model: settings.preferred_model,
      preferred_quality: settings.preferred_quality,
      enable_streaming: settings.enable_streaming,
      enable_thinking_display: settings.enable_thinking_display,
    };

    return NextResponse.json({
      success: true,
      settings: safeSettings,
      message: "Inställningar sparade",
    });
  } catch (error) {
    console.error("[API:Settings:POST] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save settings" },
      { status: 500 }
    );
  }
}

