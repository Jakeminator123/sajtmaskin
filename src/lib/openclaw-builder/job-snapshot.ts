/**
 * Read-only `job.get` + `project.snapshot` against a caller-supplied frozen
 * job and file manifest. No I/O: no env, no fs, no fetch. Never invents a
 * GenerationInputPackage — only the frozen job fields are returned.
 */

export const HEX64_RE = /^[0-9a-f]{64}$/;
export const MAX_SNAPSHOT_FILES = 500;
export const MAX_SNAPSHOT_PATH_LENGTH = 200;

export const BUILDER_JOB_LANES = [
  "classic",
  "openclaw_shadow",
  "openclaw_candidate",
] as const;

export const BUILDER_JOB_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
  "stale",
  "cancelled",
  "superseded",
  "expired",
] as const;

export type BuilderJobLane = (typeof BUILDER_JOB_LANES)[number];
export type BuilderJobStatus = (typeof BUILDER_JOB_STATUSES)[number];

export type FrozenBuilderJob = {
  jobId: string;
  tenantId: string;
  projectId: string;
  chatId: string;
  baseVersionId: string;
  baseFilesRevision: string;
  generationInputPackageHash: string;
  lineageHash: string;
  lane: BuilderJobLane;
  allowedTools: string[];
  status: BuilderJobStatus;
};

export type SnapshotFile = {
  path: string;
  bytes: number;
  language: string;
  sha256: string;
};

export type BuilderJobGetResult =
  | { ok: true; job: FrozenBuilderJob }
  | { ok: false; code: "job_not_found" | "identity_mismatch" | "invalid_job" };

export type ProjectSnapshotResult =
  | {
      ok: true;
      versionId: string;
      filesRevision: string;
      fileCount: number;
      files: SnapshotFile[];
    }
  | {
      ok: false;
      code:
        | "identity_mismatch"
        | "stale_revision"
        | "stale_version"
        | "invalid_snapshot"
        | "job_not_running";
    };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isHex64(value: unknown): value is string {
  return typeof value === "string" && HEX64_RE.test(value);
}

function isBuilderJobLane(value: unknown): value is BuilderJobLane {
  return (
    typeof value === "string" &&
    (BUILDER_JOB_LANES as readonly string[]).includes(value)
  );
}

function isBuilderJobStatus(value: unknown): value is BuilderJobStatus {
  return (
    typeof value === "string" &&
    (BUILDER_JOB_STATUSES as readonly string[]).includes(value)
  );
}

function isValidAllowedTools(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((tool) => typeof tool === "string");
}

function isValidFrozenJob(job: FrozenBuilderJob): boolean {
  return (
    isNonEmptyString(job.jobId) &&
    isNonEmptyString(job.tenantId) &&
    isNonEmptyString(job.projectId) &&
    isNonEmptyString(job.chatId) &&
    isNonEmptyString(job.baseVersionId) &&
    isNonEmptyString(job.baseFilesRevision) &&
    isHex64(job.generationInputPackageHash) &&
    isHex64(job.lineageHash) &&
    isBuilderJobLane(job.lane) &&
    isBuilderJobStatus(job.status) &&
    isValidAllowedTools(job.allowedTools)
  );
}

/** Return only the frozen job fields — never a reconstructed package. */
function publicJob(job: FrozenBuilderJob): FrozenBuilderJob {
  return {
    jobId: job.jobId,
    tenantId: job.tenantId,
    projectId: job.projectId,
    chatId: job.chatId,
    baseVersionId: job.baseVersionId,
    baseFilesRevision: job.baseFilesRevision,
    generationInputPackageHash: job.generationInputPackageHash,
    lineageHash: job.lineageHash,
    lane: job.lane,
    allowedTools: [...job.allowedTools],
    status: job.status,
  };
}

function publicSnapshotFile(file: SnapshotFile): SnapshotFile {
  return {
    path: file.path,
    bytes: file.bytes,
    language: file.language,
    sha256: file.sha256,
  };
}

const RESTRICTED_SNAPSHOT_BASENAMES = new Set([
  ".env",
  ".npmrc",
  ".netrc",
  ".yarnrc.yml",
  ".pypirc",
  "id_rsa",
  "id_ed25519",
  "credentials.json",
  "service-account.json",
]);

function isSafeSnapshotPath(path: string): boolean {
  if (!isNonEmptyString(path) || path.length > MAX_SNAPSHOT_PATH_LENGTH) return false;
  if (path.includes("\\") || path.includes("\0")) return false;
  if (path.startsWith("/") || /^[a-zA-Z]:/.test(path)) return false;
  const segments = path.split("/");
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") return false;
  }
  const basename = (segments[segments.length - 1] ?? "").toLowerCase();
  if (!basename) return false;
  if (basename === ".env" || basename.startsWith(".env.")) return false;
  if (RESTRICTED_SNAPSHOT_BASENAMES.has(basename)) return false;
  if (basename.endsWith(".pem") || basename.endsWith(".key")) return false;
  if (basename.includes("secret") || basename.includes("credential")) return false;
  return true;
}

function isValidSnapshotFile(file: SnapshotFile): boolean {
  return (
    isSafeSnapshotPath(file.path) &&
    typeof file.bytes === "number" &&
    Number.isInteger(file.bytes) &&
    file.bytes >= 0 &&
    typeof file.language === "string" &&
    isHex64(file.sha256)
  );
}

function snapshotFilesValid(files: SnapshotFile[]): boolean {
  if (!Array.isArray(files) || files.length > MAX_SNAPSHOT_FILES) return false;
  const seen = new Set<string>();
  for (const file of files) {
    if (!isValidSnapshotFile(file)) return false;
    if (seen.has(file.path)) return false;
    seen.add(file.path);
  }
  return true;
}

export function getBuilderJob(input: {
  job: FrozenBuilderJob;
  requestedJobId: string;
  requester: { tenantId: string; projectId: string; chatId: string };
}): BuilderJobGetResult {
  if (!isValidFrozenJob(input.job)) {
    return { ok: false, code: "invalid_job" };
  }
  if (input.requestedJobId !== input.job.jobId) {
    return { ok: false, code: "job_not_found" };
  }
  const { requester, job } = input;
  if (
    requester.tenantId !== job.tenantId ||
    requester.projectId !== job.projectId ||
    requester.chatId !== job.chatId
  ) {
    return { ok: false, code: "identity_mismatch" };
  }
  return { ok: true, job: publicJob(job) };
}

export function getProjectSnapshot(input: {
  job: FrozenBuilderJob;
  requester: {
    tenantId: string;
    projectId: string;
    chatId: string;
    jobId: string;
    baseVersionId: string;
    baseFilesRevision: string;
  };
  files: SnapshotFile[];
}): ProjectSnapshotResult {
  if (!isValidFrozenJob(input.job)) {
    return { ok: false, code: "invalid_snapshot" };
  }
  const { job, requester, files } = input;
  if (
    requester.tenantId !== job.tenantId ||
    requester.projectId !== job.projectId ||
    requester.chatId !== job.chatId ||
    requester.jobId !== job.jobId
  ) {
    return { ok: false, code: "identity_mismatch" };
  }
  if (requester.baseVersionId !== job.baseVersionId) {
    return { ok: false, code: "stale_version" };
  }
  if (requester.baseFilesRevision !== job.baseFilesRevision) {
    return { ok: false, code: "stale_revision" };
  }
  if (job.status !== "running") {
    return { ok: false, code: "job_not_running" };
  }
  if (!snapshotFilesValid(files)) {
    return { ok: false, code: "invalid_snapshot" };
  }
  const sorted = files
    .map(publicSnapshotFile)
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return {
    ok: true,
    versionId: job.baseVersionId,
    filesRevision: job.baseFilesRevision,
    fileCount: sorted.length,
    files: sorted,
  };
}
