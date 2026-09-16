import {
  MAX_LOCAL_ZIP_UPLOAD_BYTES,
  isImportInitSuccess,
  type ImportErrorCode,
  type ImportErrorStep,
  type ImportInitFailure,
  type ImportInitSuccess,
} from "./import-init-contract";

export const LOCAL_ZIP_LIMIT_LABEL = "2,5 MB";

export type DroppedImport =
  | { kind: "github"; url: string }
  | { kind: "zip"; file: File }
  | { kind: "invalid"; message: string };

export function localZipTooLarge(size: number): boolean {
  return size > MAX_LOCAL_ZIP_UPLOAD_BYTES;
}

export function validateLocalZipFile(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(".zip") && file.type !== "application/zip") {
    return "Välj en ZIP-fil.";
  }
  if (localZipTooLarge(file.size)) {
    return `ZIP-filen är för stor för direktuppladdning (max ${LOCAL_ZIP_LIMIT_LABEL}). Använd en publik ZIP-adress för större arkiv.`;
  }
  return null;
}

function firstNonCommentLine(text: string): string {
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("#")) ?? ""
  );
}

export function parseDroppedImport(data: DataTransfer | null): DroppedImport {
  if (!data) {
    return { kind: "invalid", message: "Inget att släppa." };
  }

  const files = Array.from(data.files ?? []);
  if (files.length > 1) {
    return { kind: "invalid", message: "Släpp bara en ZIP-fil eller en GitHub-länk." };
  }
  if (files.length === 1) {
    const error = validateLocalZipFile(files[0]);
    if (error) return { kind: "invalid", message: error };
    return { kind: "zip", file: files[0] };
  }

  const uriList = data.getData("text/uri-list");
  const plain = data.getData("text/plain");
  const candidate = firstNonCommentLine(uriList || plain);
  if (!candidate) {
    return { kind: "invalid", message: "Släpp en GitHub-adress eller en ZIP-fil." };
  }
  if (!/^https?:\/\/(www\.)?github\.com\//i.test(candidate)) {
    return { kind: "invalid", message: "Bara github.com-adresser eller ZIP-filer kan släppas här." };
  }
  return { kind: "github", url: candidate };
}

export function parseImportInitSuccess(data: unknown): ImportInitSuccess | null {
  if (!isImportInitSuccess(data)) return null;
  const preview = data.preview ?? {
    status: data.previewUrl ? "starting" : "failed",
    runtimeReady: false,
    retryable: !data.previewUrl,
  };
  return {
    ...data,
    preview,
    previewUrl: typeof data.previewUrl === "string" && data.previewUrl.trim() ? data.previewUrl : null,
  };
}

const OVERSIZED_IMPORT_MESSAGE = "Arkivet eller uppladdningen är för stor för import.";

export async function readImportInitFailure(response: Response): Promise<ImportInitFailure> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return {
      success: false,
      error:
        response.status === 413
          ? OVERSIZED_IMPORT_MESSAGE
          : "Importen misslyckades. Servern svarade inte med JSON.",
      code: response.status === 413 ? "zip_too_large" : "import_failed",
      step: "download",
    };
  }

  const data = (await response.json().catch(() => null)) as {
    error?: string;
    details?: string;
    code?: ImportErrorCode;
    step?: ImportErrorStep;
    requiresAuth?: boolean;
  } | null;

  return {
    success: false,
    error: data?.error || data?.details || "Import av projekt misslyckades.",
    code: data?.code || "import_failed",
    step: data?.step || "persist",
    requiresAuth: data?.requiresAuth === true,
  };
}

export const IMPORT_INTENT_STORAGE_KEY = "sajtmaskin:import-intent";

export type StoredImportIntent = {
  sourceType: "github" | "zip";
  githubUrl: string;
  branch: string;
  zipUrl: string;
  message: string;
  lockConfigFiles: boolean;
};

export function readStoredImportIntent(): StoredImportIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(IMPORT_INTENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredImportIntent>;
    return {
      sourceType: parsed.sourceType === "zip" ? "zip" : "github",
      githubUrl: typeof parsed.githubUrl === "string" ? parsed.githubUrl : "",
      branch: typeof parsed.branch === "string" ? parsed.branch : "",
      zipUrl: typeof parsed.zipUrl === "string" ? parsed.zipUrl : "",
      message: typeof parsed.message === "string" ? parsed.message : "",
      lockConfigFiles: parsed.lockConfigFiles === true,
    };
  } catch {
    return null;
  }
}

export function writeStoredImportIntent(intent: StoredImportIntent): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(IMPORT_INTENT_STORAGE_KEY, JSON.stringify(intent));
  } catch {
    /* ignore quota */
  }
}
