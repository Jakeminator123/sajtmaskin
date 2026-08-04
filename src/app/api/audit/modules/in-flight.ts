import type { AuditResult } from "@/types/audit";

type InFlightAudit = {
  startTime: number;
  userId: string;
  promise: Promise<AuditResult>;
};

// Track audits currently in progress (per canonical URL)
const inFlightAudits = new Map<string, InFlightAudit>();

// Cleanup stale entries after 10 minutes (safety net)
const IN_FLIGHT_MAX_AGE_MS = 10 * 60 * 1000;

function cleanupStaleInFlightAudits() {
  const now = Date.now();
  for (const [key, audit] of inFlightAudits.entries()) {
    if (now - audit.startTime > IN_FLIGHT_MAX_AGE_MS) {
      inFlightAudits.delete(key);
    }
  }
}

// Run cleanup periodically (on each request, cheap operation)
setInterval(cleanupStaleInFlightAudits, 60 * 1000);

export { inFlightAudits };
