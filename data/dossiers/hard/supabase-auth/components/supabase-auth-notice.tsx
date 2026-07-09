"use client";

import { isSupabaseAuthConfigured } from "@/lib/supabase/config";

export interface SupabaseAuthNoticeProps {
  className?: string;
}

/**
 * Discreet "auth not configured" banner (mock: none — login cannot be
 * meaningfully mocked). Renders ONLY when the Supabase public env vars are
 * missing or preview placeholders; with real keys it renders nothing. Mount it
 * near the auth UI (login form / header auth buttons) so an unconfigured
 * preview shows a calm notice instead of a broken sign-in flow. Mirrors the
 * clerk-auth banner + IntegrationConfigNotice tone: neutral/muted, never
 * error-red, never any key VALUES.
 */
export function SupabaseAuthNotice({ className }: SupabaseAuthNoticeProps) {
  if (isSupabaseAuthConfigured()) return null;

  return (
    <div
      role="status"
      className={
        className ??
        "border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-900"
      }
    >
      Auth ej konfigurerat: sätt <code>NEXT_PUBLIC_SUPABASE_URL</code> och{" "}
      <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> i <code>.env.local</code> för att
      aktivera inloggning.
    </div>
  );
}
