/**
 * Pure `preview.screenshot` pin lookup. Returns a pinned artifact
 * reference — never bytes or a live URL the model can fetch. No I/O:
 * no env, no fs, no fetch, no Blob SDK, no preview-host calls.
 */

export type ScreenshotIdentity = {
  tenantId: string;
  chatId: string;
  versionId: string;
  filesRevision: string;
};

export type ScreenshotPin = ScreenshotIdentity & {
  artifactId: string;
  contentSha256: string;
  capturedAt: string;
};

export type PreviewScreenshotOk = {
  ok: true;
  tool: "preview.screenshot";
  artifactId: string;
  contentSha256: string;
  capturedAt: string;
  pinned: true;
};

export type PreviewScreenshotErr = {
  ok: false;
  code: "identity_mismatch" | "revision_mismatch" | "not_found" | "invalid_pin";
};

export type PreviewScreenshotResult = PreviewScreenshotOk | PreviewScreenshotErr;

const HEX64_RE = /^[0-9a-f]{64}$/;
const ARTIFACT_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const ISO_DATETIME_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;
const MAX_ARTIFACT_ID = 128;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function identityMismatch(left: ScreenshotIdentity, right: ScreenshotIdentity): boolean {
  return left.tenantId !== right.tenantId || left.chatId !== right.chatId;
}

function revisionMismatch(left: ScreenshotIdentity, right: ScreenshotIdentity): boolean {
  return left.versionId !== right.versionId || left.filesRevision !== right.filesRevision;
}

function looksLikeUrl(artifactId: string): boolean {
  return (
    artifactId.includes("://") ||
    artifactId.includes("/") ||
    artifactId.toLowerCase().includes("http")
  );
}

function isValidArtifactId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > MAX_ARTIFACT_ID) return false;
  if (looksLikeUrl(value)) return false;
  return ARTIFACT_ID_RE.test(value);
}

function isHex64(value: unknown): value is string {
  return typeof value === "string" && HEX64_RE.test(value);
}

function isIsoDatetime(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATETIME_RE.test(value)) return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  if (value.endsWith("Z")) {
    const millis = value.includes(".")
      ? value.slice(value.indexOf("."), value.length - 1)
      : "";
    const normalized = `${value.slice(0, 19)}${millis}Z`;
    return new Date(parsed).toISOString().startsWith(normalized.slice(0, 19));
  }
  return true;
}

function isValidPin(pin: ScreenshotPin): boolean {
  return (
    isNonEmptyString(pin.tenantId) &&
    isNonEmptyString(pin.chatId) &&
    isNonEmptyString(pin.versionId) &&
    isNonEmptyString(pin.filesRevision) &&
    isValidArtifactId(pin.artifactId) &&
    isHex64(pin.contentSha256) &&
    isIsoDatetime(pin.capturedAt)
  );
}

export function getPreviewScreenshot(input: {
  job: ScreenshotIdentity;
  requester: ScreenshotIdentity;
  pin: ScreenshotPin | null;
}): PreviewScreenshotResult {
  const { job, requester, pin } = input;

  if (identityMismatch(job, requester)) {
    return { ok: false, code: "identity_mismatch" };
  }
  if (revisionMismatch(job, requester)) {
    return { ok: false, code: "revision_mismatch" };
  }
  if (pin == null) {
    return { ok: false, code: "not_found" };
  }
  if (identityMismatch(job, pin)) {
    return { ok: false, code: "identity_mismatch" };
  }
  if (revisionMismatch(job, pin)) {
    return { ok: false, code: "revision_mismatch" };
  }
  if (!isValidPin(pin)) {
    return { ok: false, code: "invalid_pin" };
  }

  return {
    ok: true,
    tool: "preview.screenshot",
    artifactId: pin.artifactId,
    contentSha256: pin.contentSha256,
    capturedAt: pin.capturedAt,
    pinned: true,
  };
}
