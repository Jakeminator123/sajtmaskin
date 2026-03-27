import { NextResponse } from "next/server";
import { isV0PlatformEnabled } from "@/lib/env";

export const V0_PLATFORM_DISABLED_CODE = "v0_platform_disabled";

export function isV0PlatformDisabled(): boolean {
  return !isV0PlatformEnabled();
}

export function buildV0PlatformDisabledResponse(capability?: string) {
  const detail = capability?.trim()
    ? `${capability} via V0 Platform ar avstangd.`
    : "Legacy V0 Platform-rutter ar avstangda.";

  return NextResponse.json(
    {
      success: false,
      code: V0_PLATFORM_DISABLED_CODE,
      error: `${detail} Anvand own-engine scaffold/build flow i stallet.`,
    },
    { status: 410 },
  );
}
