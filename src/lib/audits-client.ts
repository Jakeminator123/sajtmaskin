// Client-side API for saved-audit operations (mirrors project-client.ts).
// Backend: src/app/api/audits/route.ts + [id]/route.ts, service in
// src/lib/db/services/audits.ts.

import type { AuditResult } from "@/types/audit";

/** Lightweight list item returned by GET /api/audits. */
export interface SavedAuditListItem {
  id: number;
  url: string;
  domain: string;
  company_name: string | null;
  score_overall: number | null;
  score_seo: number | null;
  score_ux: number | null;
  score_performance: number | null;
  score_security: number | null;
  created_at: string;
}

/** Full audit returned by GET /api/audits/[id]. */
export interface SavedAuditDetail extends SavedAuditListItem {
  result: AuditResult | null;
}

/** List the current user's saved audits (newest first). Throws on auth/API error. */
export async function getSavedAudits(): Promise<SavedAuditListItem[]> {
  const response = await fetch("/api/audits");
  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.success) {
    throw new Error(data?.error || `Kunde inte hämta audits (HTTP ${response.status})`);
  }

  return data.audits as SavedAuditListItem[];
}

/** Fetch a single saved audit with its full result payload. */
export async function getSavedAudit(id: number): Promise<SavedAuditDetail> {
  const response = await fetch(`/api/audits/${id}`);
  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.success) {
    throw new Error(data?.error || `Kunde inte hämta audit (HTTP ${response.status})`);
  }

  return data.audit as SavedAuditDetail;
}

/** Delete a saved audit. Throws on auth/API error. */
export async function deleteSavedAudit(id: number): Promise<void> {
  const response = await fetch(`/api/audits/${id}`, { method: "DELETE" });
  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.success) {
    throw new Error(data?.error || `Kunde inte ta bort audit (HTTP ${response.status})`);
  }
}
