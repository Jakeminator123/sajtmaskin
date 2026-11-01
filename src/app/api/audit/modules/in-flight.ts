type InFlightAudit = {
  startTime: number;
};

// Track audits currently in progress (per canonical URL)
const inFlightAudits = new Map<string, InFlightAudit>();

// Cleanup stale entries after 10 minutes (safety net)
const IN_FLIGHT_MAX_AGE_MS = 10 * 60 * 1000;

export function cleanupStaleInFlightAudits(now = Date.now()) {
  for (const [key, audit] of inFlightAudits.entries()) {
    if (now - audit.startTime > IN_FLIGHT_MAX_AGE_MS) {
      inFlightAudits.delete(key);
    }
  }
}

export { inFlightAudits };
