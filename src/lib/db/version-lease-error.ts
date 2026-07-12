/**
 * Thrown by `updateVersionFiles` when a foreign verify/repair job holds the
 * active version lease and the write is NOT the lease holder's own
 * (`holderRunId` absent or non-matching). HTTP routes translate it to the
 * canonical retryable `409 version_busy` (the same code the quality-gate /
 * repair / accept-repair routes emit).
 *
 * Lives in its own tiny module (no DB imports) so route tests that
 * `vi.mock("@/lib/db/chat-repository-pg")` still resolve this class for the
 * `instanceof` check in `versionBusyResponseIfLeaseHeld` — mocking the big
 * repository module would otherwise leave the class `undefined`.
 */
export class VersionLeaseHeldError extends Error {
  readonly code = "version_busy" as const;
  readonly versionId: string;

  constructor(versionId: string) {
    super(`Version ${versionId} is busy: another verify/repair job holds the version lease.`);
    this.name = "VersionLeaseHeldError";
    this.versionId = versionId;
  }
}
