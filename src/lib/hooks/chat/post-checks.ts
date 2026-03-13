import type { UiMessagePart } from "@/lib/builder/types";
import type { PreviewPreflightState } from "@/lib/gen/preview-diagnostics";
import { runProjectSanityChecks } from "@/lib/gen/validation/project-sanity";
import { DESIGN_TOKEN_FILES, POST_CHECK_MARKER } from "./constants";
import type {
  DesignTokenSummary,
  FileEntry,
  SetMessages,
  StreamQualitySignal,
  VersionEntry,
  VersionErrorLogPayload,
} from "./types";
import { appendToolPartToMessage, hashString } from "./helpers";

// ---------------------------------------------------------------------------
// Version / file fetching
// ---------------------------------------------------------------------------

export async function fetchChatVersions(
  chatId: string,
  signal?: AbortSignal,
): Promise<VersionEntry[]> {
  const response = await fetch(`/api/v0/chats/${encodeURIComponent(chatId)}/versions`, { signal });
  const data = (await response.json().catch(() => null)) as { versions?: VersionEntry[] } | null;
  if (!response.ok) {
    throw new Error(
      (data as { error?: string } | null)?.error ||
        `Failed to fetch versions (HTTP ${response.status})`,
    );
  }
  return Array.isArray(data?.versions) ? data?.versions : [];
}

export async function fetchChatFiles(
  chatId: string,
  versionId: string,
  signal?: AbortSignal,
  waitForReady = false,
): Promise<FileEntry[]> {
  const waitParam = waitForReady ? "&wait=1" : "";
  const response = await fetch(
    `/api/v0/chats/${encodeURIComponent(chatId)}/files?versionId=${encodeURIComponent(
      versionId,
    )}${waitParam}`,
    { signal },
  );
  const data = (await response.json().catch(() => null)) as {
    files?: FileEntry[];
    error?: string;
  } | null;
  if (!response.ok) {
    throw new Error(data?.error || `Failed to fetch files (HTTP ${response.status})`);
  }
  return Array.isArray(data?.files) ? data.files : [];
}

function inferLanguage(fileName: string): string {
  const normalized = fileName.toLowerCase();
  if (normalized.endsWith(".tsx")) return "tsx";
  if (normalized.endsWith(".ts")) return "ts";
  if (normalized.endsWith(".jsx")) return "jsx";
  if (normalized.endsWith(".js")) return "js";
  if (normalized.endsWith(".css")) return "css";
  if (normalized.endsWith(".json")) return "json";
  return "text";
}

// ---------------------------------------------------------------------------
// Version diffing
// ---------------------------------------------------------------------------

export function resolvePreviousVersionId(
  currentVersionId: string,
  versions: VersionEntry[],
): string | null {
  const byDate = [...versions].sort((a, b) => {
    const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
    return bTime - aTime;
  });
  const index = byDate.findIndex(
    (entry) => entry.versionId === currentVersionId || entry.id === currentVersionId,
  );
  if (index === -1) {
    return byDate[0]?.versionId || byDate[0]?.id || null;
  }
  return byDate[index + 1]?.versionId || byDate[index + 1]?.id || null;
}

function buildFileHashMap(files: FileEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  files.forEach((file) => {
    map.set(file.name, hashString(file.content ?? ""));
  });
  return map;
}

export function diffFiles(previous: FileEntry[], current: FileEntry[]) {
  const prevMap = buildFileHashMap(previous);
  const nextMap = buildFileHashMap(current);
  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];

  nextMap.forEach((hash, name) => {
    if (!prevMap.has(name)) {
      added.push(name);
      return;
    }
    if (prevMap.get(name) !== hash) {
      modified.push(name);
    }
  });

  prevMap.forEach((_hash, name) => {
    if (!nextMap.has(name)) removed.push(name);
  });

  return { added, removed, modified };
}

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

export function extractDesignTokens(files: FileEntry[]): DesignTokenSummary | null {
  const candidate = files.find((file) =>
    DESIGN_TOKEN_FILES.some((path) => file.name.endsWith(path)),
  );
  if (!candidate?.content) return null;

  const tokens: Array<{ name: string; value: string }> = [];
  const regex = /--([a-zA-Z0-9-_]+)\s*:\s*([^;\n]+);/g;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(candidate.content)) && tokens.length < 24) {
    tokens.push({ name: `--${match[1]}`, value: match[2].trim() });
  }
  if (tokens.length === 0) return null;

  return { source: candidate.name, tokens };
}

// ---------------------------------------------------------------------------
// Suspicious use() calls
// ---------------------------------------------------------------------------

export function findSuspiciousUseCalls(files: FileEntry[]) {
  const results: Array<{ file: string; line: number; snippet: string }> = [];
  const pattern = /\b(?:React\.)?use\s*\(/g;
  files.forEach((file) => {
    if (!file.content) return;
    const lines = file.content.split(/\r?\n/);
    lines.forEach((line, index) => {
      let match: RegExpExecArray | null;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(line))) {
        const after = line.slice(match.index + match[0].length);
        const nextChar = after.trim()[0];
        if (nextChar && ("{[\"'`".includes(nextChar) || /[0-9]/.test(nextChar))) {
          results.push({ file: file.name, line: index + 1, snippet: line.trim() });
          break;
        }
      }
    });
  });
  return results;
}

// ---------------------------------------------------------------------------
// Route & link analysis
// ---------------------------------------------------------------------------

function normalizeInternalHref(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;
  if (trimmed.startsWith("/api")) return null;
  if (trimmed.startsWith("/_next")) return null;
  if (trimmed.startsWith("/favicon")) return null;
  if (trimmed.startsWith("/robots")) return null;
  if (trimmed.startsWith("/sitemap")) return null;
  if (trimmed.includes("${")) return null;
  const cleaned = trimmed.split("#")[0].split("?")[0];
  if (!cleaned) return null;
  return cleaned === "" ? "/" : cleaned;
}

export function extractStaticInternalLinks(files: FileEntry[]): string[] {
  const results = new Set<string>();
  const hrefRegex = /href\s*=\s*(?:"([^"]+)"|'([^']+)'|\{\s*["']([^"']+)["']\s*\})/g;
  for (const file of files) {
    if (!file?.content) continue;
    const content = file.content;
    let match: RegExpExecArray | null = null;
    hrefRegex.lastIndex = 0;
    while ((match = hrefRegex.exec(content))) {
      const raw = match[1] || match[2] || match[3] || "";
      const normalized = normalizeInternalHref(raw);
      if (normalized) results.add(normalized);
    }
  }
  return Array.from(results);
}

export function extractAppRoutePaths(files: FileEntry[]): string[] {
  const routes = new Set<string>();
  for (const file of files) {
    const rawName = file.name.replace(/^\/+/, "");
    if (/^page\.(t|j)sx?$/.test(rawName)) {
      routes.add("/");
      continue;
    }
    let rest: string | null = null;
    if (rawName.startsWith("src/app/")) rest = rawName.slice("src/app/".length);
    if (rawName.startsWith("app/")) rest = rawName.slice("app/".length);
    if (!rest) continue;
    if (!/page\.(t|j)sx?$/.test(rest)) continue;
    const parts = rest.split("/");
    parts.pop();
    const segments = parts
      .filter(Boolean)
      .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")))
      .filter((segment) => !segment.startsWith("@"));
    const route = `/${segments.join("/")}`;
    routes.add(route === "/" ? "/" : route.replace(/\/+$/, ""));
  }
  return Array.from(routes);
}

function routePatternToRegex(route: string): RegExp {
  const cleaned = route.replace(/\/+$/, "") || "/";
  if (cleaned === "/") return /^\/$/;
  const segments = cleaned.split("/").filter(Boolean);
  let pattern = "^";
  for (const segment of segments) {
    if (segment.startsWith("[[...") && segment.endsWith("]]")) {
      pattern += "(?:/.*)?";
      break;
    }
    if (segment.startsWith("[...") && segment.endsWith("]")) {
      pattern += "/.+";
      continue;
    }
    if (segment.startsWith("[") && segment.endsWith("]")) {
      pattern += "/[^/]+";
      continue;
    }
    const escaped = segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    pattern += `/${escaped}`;
  }
  pattern += "$";
  return new RegExp(pattern);
}

export function findMissingRoutes(links: string[], routes: string[]): string[] {
  if (routes.length === 0) return links;
  const matchers = routes.map(routePatternToRegex);
  return links.filter((link) => !matchers.some((matcher) => matcher.test(link)));
}

function findLucideLinkMisuse(files: FileEntry[]): string[] {
  const affected = new Set<string>();
  const lucideLinkImport =
    /import\s*\{[^}]*\bLink\b[^}]*\}\s*from\s*["']lucide-react["'];?/;
  const hrefUsage = /<Link\b[^>]*\bhref=/;

  for (const file of files) {
    if (!file?.content) continue;
    if (!lucideLinkImport.test(file.content)) continue;
    if (!hrefUsage.test(file.content)) continue;
    affected.add(file.name);
  }

  return Array.from(affected);
}

// ---------------------------------------------------------------------------
// SEO readiness
// ---------------------------------------------------------------------------

type SeoIssue = {
  severity: "warning" | "error";
  code:
    | "missing-metadata"
    | "missing-title"
    | "missing-description"
    | "missing-open-graph"
    | "missing-twitter"
    | "missing-robots"
    | "missing-sitemap"
    | "missing-json-ld"
    | "missing-h1"
    | "multiple-h1";
  message: string;
  file?: string | null;
};

type SeoReview = {
  passed: boolean;
  issues: SeoIssue[];
  signals: {
    metadata: boolean;
    title: boolean;
    description: boolean;
    openGraph: boolean;
    twitter: boolean;
    robots: boolean;
    sitemap: boolean;
    jsonLd: boolean;
    homeH1Count: number | null;
  };
};

function findFileBySuffix(files: FileEntry[], suffixes: string[]): FileEntry | null {
  return (
    files.find((file) =>
      suffixes.some((suffix) => file.name === suffix || file.name.endsWith(`/${suffix}`)),
    ) ?? null
  );
}

function countMatches(content: string, regex: RegExp): number {
  return (content.match(regex) || []).length;
}

function buildSeoReview(files: FileEntry[]): SeoReview {
  const layoutFile = findFileBySuffix(files, ["app/layout.tsx", "src/app/layout.tsx"]);
  const homePageFile = findFileBySuffix(files, ["app/page.tsx", "src/app/page.tsx"]);
  const robotsFile = findFileBySuffix(files, ["app/robots.ts", "src/app/robots.ts"]);
  const sitemapFile = findFileBySuffix(files, ["app/sitemap.ts", "src/app/sitemap.ts"]);

  const layoutContent = layoutFile?.content ?? "";
  const metadata = /\bexport\s+const\s+metadata\b/.test(layoutContent);
  const title = metadata && /\btitle\s*:/.test(layoutContent);
  const description = metadata && /\bdescription\s*:/.test(layoutContent);
  const openGraph = metadata && /\bopenGraph\s*:/.test(layoutContent);
  const twitter = metadata && /\btwitter\s*:/.test(layoutContent);
  const robots = Boolean(robotsFile);
  const sitemap = Boolean(sitemapFile);
  const jsonLd = files.some((file) =>
    /application\/ld\+json|json-ld/i.test(file.content ?? ""),
  );
  const homeH1Count = homePageFile?.content ? countMatches(homePageFile.content, /<h1\b/gi) : null;

  const issues: SeoIssue[] = [];

  if (!metadata) {
    issues.push({
      severity: "warning",
      code: "missing-metadata",
      message: "Layouten saknar export av metadata för title/description.",
      file: layoutFile?.name ?? null,
    });
  }
  if (metadata && !title) {
    issues.push({
      severity: "warning",
      code: "missing-title",
      message: "Metadata saknar title.",
      file: layoutFile?.name ?? null,
    });
  }
  if (metadata && !description) {
    issues.push({
      severity: "warning",
      code: "missing-description",
      message: "Metadata saknar description.",
      file: layoutFile?.name ?? null,
    });
  }
  if (metadata && !openGraph) {
    issues.push({
      severity: "warning",
      code: "missing-open-graph",
      message: "Metadata saknar Open Graph-falt.",
      file: layoutFile?.name ?? null,
    });
  }
  if (metadata && !twitter) {
    issues.push({
      severity: "warning",
      code: "missing-twitter",
      message: "Metadata saknar Twitter-kort.",
      file: layoutFile?.name ?? null,
    });
  }
  if (!robots) {
    issues.push({
      severity: "warning",
      code: "missing-robots",
      message: "Projektet saknar app/robots.ts.",
      file: null,
    });
  }
  if (!sitemap) {
    issues.push({
      severity: "warning",
      code: "missing-sitemap",
      message: "Projektet saknar app/sitemap.ts.",
      file: null,
    });
  }
  if (!jsonLd) {
    issues.push({
      severity: "warning",
      code: "missing-json-ld",
      message: "Ingen JSON-LD/schema.org-markup hittades.",
      file: null,
    });
  }
  if (homeH1Count === 0) {
    issues.push({
      severity: "warning",
      code: "missing-h1",
      message: "Startsidan saknar h1-rubrik.",
      file: homePageFile?.name ?? null,
    });
  } else if (homeH1Count !== null && homeH1Count > 1) {
    issues.push({
      severity: "warning",
      code: "multiple-h1",
      message: "Startsidan har flera h1-rubriker.",
      file: homePageFile?.name ?? null,
    });
  }

  return {
    passed: issues.length === 0,
    issues,
    signals: {
      metadata,
      title,
      description,
      openGraph,
      twitter,
      robots,
      sitemap,
      jsonLd,
      homeH1Count,
    },
  };
}

// ---------------------------------------------------------------------------
// Post-check summary formatting
// ---------------------------------------------------------------------------

function formatChangeSteps(label: string, items: string[], prefix: string, limit = 8) {
  if (items.length === 0) return [];
  const head = items.slice(0, limit).map((item) => `${prefix} ${item}`);
  const suffix = items.length > limit ? [`${label}: +${items.length - limit} till...`] : [];
  return [...head, ...suffix];
}

function isLikelyQuestionOrPrompt(content: string) {
  const lower = content.toLowerCase();
  if (content.includes("?")) return true;
  return [
    "vill du",
    "vill ni",
    "ska vi",
    "ska jag",
    "kan du",
    "kan ni",
    "kan jag",
    "behöver du",
    "behöver ni",
    "vill jag",
    "installera",
    "integrera",
    "supabase",
    "redis",
    "environment variable",
    "miljövariabel",
    "api-nyckel",
    "nyckel",
  ].some((token) => lower.includes(token));
}

function shouldAppendPostCheckSummary(content: string) {
  const trimmed = content.trim();
  if (!trimmed) return true;
  if (isLikelyQuestionOrPrompt(trimmed)) return false;
  if (trimmed.endsWith(":")) return true;
  const tail = trimmed.slice(-160).toLowerCase();
  if (
    ["summera", "sammanfatta", "ändring", "changes", "summary"].some((token) =>
      tail.includes(token),
    )
  ) {
    return true;
  }
  return trimmed.length >= 24;
}

function buildPostCheckSummary(params: {
  changes: { added: string[]; modified: string[]; removed: string[] } | null;
  warnings: string[];
  demoUrl: string | null;
  previewBlockingReason?: string | null;
  provisional?: boolean;
  qualityGatePending?: boolean;
  autoFixQueued?: boolean;
}) {
  const {
    changes,
    warnings,
    demoUrl,
    previewBlockingReason = null,
    provisional = false,
    qualityGatePending = false,
    autoFixQueued = false,
  } = params;
  const lines: string[] = [];

  if (changes) {
    lines.push(
      `${POST_CHECK_MARKER} Ändringar: +${changes.added.length} ~${changes.modified.length} -${changes.removed.length}`,
    );
    lines.push(...formatChangeSteps("Tillagda", changes.added, "+", 4));
    lines.push(...formatChangeSteps("Ändrade", changes.modified, "~", 4));
    lines.push(...formatChangeSteps("Borttagna", changes.removed, "-", 4));
  } else {
    lines.push(`${POST_CHECK_MARKER} Ingen tidigare version att jämföra.`);
  }

  if (!demoUrl) {
    lines.push(
      previewBlockingReason
        ? `Varning: Preview blockerades i preflight. ${previewBlockingReason}`
        : "Varning: Ingen preview-länk hittades för versionen.",
    );
  }

  if (autoFixQueued) {
    lines.push(
      "Obs: Den här versionen är preliminär eftersom autofix redan har köats efter efterkontrollerna.",
    );
  } else if (qualityGatePending) {
    lines.push("Obs: Quality gate körs fortfarande för den här versionen.");
  } else if (provisional) {
    lines.push(
      "Obs: Den här versionen är preliminär medan efterkontroller eller autofix fortfarande arbetar.",
    );
  }

  warnings.forEach((warning) => {
    lines.push(`Varning: ${warning}`);
  });

  return lines.length > 0 ? lines.join("\n") : "";
}

function appendPostCheckSummaryToMessage(
  setMessages: SetMessages,
  messageId: string,
  summary: string,
) {
  if (!summary) return;
  setMessages((prev) =>
    prev.map((message) => {
      if (message.id !== messageId) return message;
      const content = message.content || "";
      if (content.includes(POST_CHECK_MARKER)) return message;
      if (!shouldAppendPostCheckSummary(content)) return message;
      const separator = content.trim() ? "\n" : "";
      return { ...message, content: `${content}${separator}${summary}`.trimEnd() };
    }),
  );
}

// ---------------------------------------------------------------------------
// Error log persistence
// ---------------------------------------------------------------------------

async function persistVersionErrorLogs(params: {
  chatId: string;
  versionId: string;
  logs: VersionErrorLogPayload[];
}) {
  const { chatId, versionId, logs } = params;
  if (!logs.length) return;
  try {
    await fetch(
      `/api/v0/chats/${encodeURIComponent(chatId)}/versions/${encodeURIComponent(versionId)}/error-log`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logs }),
      },
    );
  } catch {
    // Best-effort only
  }
}

// ---------------------------------------------------------------------------
// Image materialization
// ---------------------------------------------------------------------------

export async function triggerImageMaterialization(params: {
  chatId: string;
  versionId: string;
  enabled: boolean;
}): Promise<void> {
  if (!params.enabled) return;
  const { chatId, versionId } = params;
  try {
    const url = `/api/v0/chats/${encodeURIComponent(chatId)}/files?versionId=${encodeURIComponent(
      versionId,
    )}&materialize=1`;
    await fetch(url, { method: "GET" });
  } catch {
    // best-effort only
  }
}

// ---------------------------------------------------------------------------
// Main post-generation check runner
// ---------------------------------------------------------------------------

export async function runPostGenerationChecks(params: {
  chatId: string;
  versionId: string;
  demoUrl?: string | null;
  preflight?: PreviewPreflightState | null;
  assistantMessageId: string;
  setMessages: SetMessages;
  streamQuality?: StreamQualitySignal;
  onAutoFix?: (payload: {
    chatId: string;
    versionId: string;
    reasons: string[];
    meta?: Record<string, unknown>;
  }) => void;
}) {
  const {
    chatId,
    versionId,
    demoUrl,
    preflight,
    assistantMessageId,
    setMessages,
    streamQuality,
    onAutoFix,
  } =
    params;
  const toolCallId = `post-check:${versionId}`;
  const controller = new AbortController();

  try {
    const [currentFiles, versions] = await Promise.all([
      fetchChatFiles(chatId, versionId, controller.signal, true),
      fetchChatVersions(chatId, controller.signal),
    ]);
    const previousVersionId = resolvePreviousVersionId(versionId, versions);
    const previousFiles = previousVersionId
      ? await fetchChatFiles(chatId, previousVersionId, controller.signal, true)
      : [];
    const changes = previousVersionId ? diffFiles(previousFiles, currentFiles) : null;
    const suspiciousUseCalls = findSuspiciousUseCalls(currentFiles);
    const warnings: string[] = [];
    if (suspiciousUseCalls.length > 0) {
      warnings.push(
        `Möjlig React use()-missbruk i ${
          new Set(suspiciousUseCalls.map((entry) => entry.file)).size
        } fil(er).`,
      );
    }
    const routePaths = extractAppRoutePaths(currentFiles);
    const internalLinks = extractStaticInternalLinks(currentFiles);
    const missingRoutes = findMissingRoutes(internalLinks, routePaths);
    const lucideLinkMisuse = findLucideLinkMisuse(currentFiles);
    const seoReview = buildSeoReview(currentFiles);
    const sanity = runProjectSanityChecks(
      currentFiles.map((file) => ({
        path: file.name,
        content: file.content ?? "",
        language: inferLanguage(file.name),
      })),
    );
    const sanityErrors = sanity.issues.filter((issue) => issue.severity === "error");
    const sanityWarnings = sanity.issues.filter((issue) => issue.severity === "warning");
    if (missingRoutes.length > 0) {
      const preview = missingRoutes.slice(0, 6).join(", ");
      const suffix = missingRoutes.length > 6 ? " …" : "";
      warnings.push(`Saknar route för ${preview}${suffix}.`);
    }
    if (lucideLinkMisuse.length > 0) {
      const preview = lucideLinkMisuse.slice(0, 6).join(", ");
      const suffix = lucideLinkMisuse.length > 6 ? " …" : "";
      warnings.push(`Fel Link-import i ${preview}${suffix}. Använd \`next/link\`, inte \`lucide-react\`.`);
    }
    if (sanityErrors.length > 0 || sanityWarnings.length > 0) {
      const summary = `Kodsanity: ${sanityErrors.length} error, ${sanityWarnings.length} warning.`;
      warnings.push(summary);
    }
    if (!seoReview.passed) {
      const preview = seoReview.issues
        .slice(0, 4)
        .map((issue) => issue.message)
        .join(" | ");
      const suffix = seoReview.issues.length > 4 ? " …" : "";
      warnings.push(`SEO: ${preview}${suffix}`);
    }
    const versionEntry = versions.find(
      (entry) => entry.versionId === versionId || entry.id === versionId,
    );
    const resolvedDemoUrl = demoUrl ?? versionEntry?.demoUrl ?? null;
    const previewBlockingReason =
      preflight?.previewBlocked && preflight.previewBlockingReason
        ? preflight.previewBlockingReason
        : null;
    const designTokens = extractDesignTokens(currentFiles);

    if (preflight?.verificationBlocked && resolvedDemoUrl) {
      warnings.push("Preview är tillgänglig, men versionen har verifieringsblockerande preflightfel.");
    }

    const steps: string[] = [];
    if (changes) {
      steps.push(
        `Ändringar: +${changes.added.length} ~${changes.modified.length} -${changes.removed.length}`,
      );
      steps.push(...formatChangeSteps("Tillagda", changes.added, "+"));
      steps.push(...formatChangeSteps("Ändrade", changes.modified, "~"));
      steps.push(...formatChangeSteps("Borttagna", changes.removed, "-"));
    } else {
      steps.push("Ingen tidigare version att jämföra.");
    }
    if (warnings.length > 0) {
      steps.push(...warnings);
    }
    if (sanityErrors.length > 0) {
      const preview = sanityErrors
        .slice(0, 6)
        .map((issue) => `${issue.file}: ${issue.message}`)
        .join(" | ");
      const suffix = sanityErrors.length > 6 ? " …" : "";
      steps.push(`Kodsanity errors: ${preview}${suffix}`);
    }
    if (sanityWarnings.length > 0) {
      const preview = sanityWarnings
        .slice(0, 6)
        .map((issue) => `${issue.file}: ${issue.message}`)
        .join(" | ");
      const suffix = sanityWarnings.length > 6 ? " …" : "";
      steps.push(`Kodsanity warnings: ${preview}${suffix}`);
    }
    if (designTokens) {
      const names = designTokens.tokens.map((token) => token.name);
      const preview = names.slice(0, 8).join(", ");
      const suffix = names.length > 8 ? " …" : "";
      steps.push(`Design tokens (${designTokens.source}): ${preview}${suffix}`);
    }
    if (seoReview.passed) {
      steps.push("SEO: metadata, robots, sitemap och grundlaggande struktur ser bra ut.");
    } else {
      steps.push(`SEO: ${seoReview.issues.length} launch-varning(ar) hittades.`);
      steps.push(
        ...seoReview.issues.slice(0, 6).map((issue) =>
          issue.file ? `${issue.message} (${issue.file})` : issue.message,
        ),
      );
    }

    let imageValidation: {
      valid?: boolean;
      total?: number;
      broken?: {
        url: string;
        alt: string;
        file: string;
        status: number | string;
        replacementUrl: string | null;
      }[];
      replacedCount?: number;
      warnings?: string[];
      fixed?: boolean;
      demoUrl?: string;
    } | null = null;
    try {
      const imgRes = await fetch(
        `/api/v0/chats/${encodeURIComponent(chatId)}/validate-images`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ versionId, autoFix: true }),
          signal: controller.signal,
        },
      );
      if (imgRes.ok) {
        imageValidation = await imgRes.json();
        if (imageValidation?.warnings?.length) {
          warnings.push(...imageValidation.warnings);
        }
        if (imageValidation?.broken?.length) {
          const brokenCount = imageValidation.broken.length;
          const fixedCount = imageValidation.replacedCount ?? 0;
          steps.push(
            `Bilder: ${brokenCount} trasig(a) URL:er hittade${fixedCount > 0 ? `, ${fixedCount} ersatt(a) med Unsplash-alternativ` : ""}`,
          );
        } else if (imageValidation?.total && imageValidation.total > 0) {
          steps.push(`Bilder: alla ${imageValidation.total} URL:er giltiga ✓`);
        }
      }
    } catch {
      // Image validation is best-effort
    }

    const finalDemoUrl = imageValidation?.demoUrl || resolvedDemoUrl;
    if (!finalDemoUrl) {
      steps.push(
        previewBlockingReason
          ? `Preview blockerades i preflight: ${previewBlockingReason}`
          : "Preview-länk saknas för versionen.",
      );
    }

    const changedFilesCount = changes
      ? changes.added.length + changes.modified.length + changes.removed.length
      : 1;
    const qualityGateFailures: string[] = [];
    if (changedFilesCount === 0) {
      qualityGateFailures.push("no_file_changes");
    }
    if (!finalDemoUrl) {
      qualityGateFailures.push(
        preflight?.previewBlocked ? "preflight_preview_blocked" : "missing_preview_url",
      );
    }
    if (streamQuality?.hasCriticalAnomaly) {
      qualityGateFailures.push(`stream_anomaly:${streamQuality.reasons.join(",")}`);
    }
    if (lucideLinkMisuse.length > 0) {
      qualityGateFailures.push("invalid_link_import");
    }
    if (sanityErrors.length > 0) {
      qualityGateFailures.push("project_sanity_errors");
    }
    const qualityGatePassed = qualityGateFailures.length === 0;
    const autoFixReasons: string[] = [];
    if (!finalDemoUrl) {
      autoFixReasons.push(
        previewBlockingReason ? "preview blockerad i preflight" : "preview saknas",
      );
    }
    if (missingRoutes.length > 0) autoFixReasons.push("saknade routes");
    if (lucideLinkMisuse.length > 0) autoFixReasons.push("fel Link-import");
    if (suspiciousUseCalls.length > 0) autoFixReasons.push("misstankt use()");
    if (sanityErrors.length > 0) autoFixReasons.push("kodsanity error");
    if (imageValidation?.broken?.length) autoFixReasons.push("trasiga bilder");
    if (imageValidation?.warnings?.some((warning) => warning.includes("[semantic-image]"))) {
      autoFixReasons.push("misstankt irrelevanta bilder");
    }
    const autoFixQueued = autoFixReasons.length > 0;
    const qualityGatePending = !autoFixQueued;
    const provisionalVersion = !qualityGatePassed || qualityGatePending || autoFixQueued;
    steps.push(
      qualityGatePassed
        ? "Quality gate: PASS (changes + preview + stream quality)."
        : `Quality gate: FAIL (${qualityGateFailures.join(" | ")}).`,
    );

    const regressionMatrix = [
      {
        id: "A_long_prompt_plan_mode",
        status: "manual",
        expectation: "No aggressive truncation; plan remains concise and complete.",
      },
      {
        id: "B_model_tier_change_mid_session",
        status: "manual",
        expectation: "Model resolution stays deterministic without stale custom overrides.",
      },
      {
        id: "C_images_on_off_and_blob_on_off",
        status:
          imageValidation?.broken?.length && imageValidation.broken.length > 0 ? "fail" : "pass",
        expectation: "Image flow reflects AI toggle + blob availability in preview.",
      },
      {
        id: "D_missing_version_or_demo_from_stream",
        status: finalDemoUrl ? "pass" : "fail",
        expectation: "Stream finalization surfaces explicit fallback/retry state.",
      },
    ] as const;

    const output = {
      steps,
      summary: {
        files: currentFiles.length,
        added: changes?.added.length ?? 0,
        modified: changes?.modified.length ?? 0,
        removed: changes?.removed.length ?? 0,
        warnings: warnings.length,
        provisional: provisionalVersion,
        qualityGatePending,
        autoFixQueued,
      },
      preflight,
      warnings,
      sanityIssues: sanity.issues,
      missingRoutes,
      lucideLinkMisuse,
      suspiciousUseCalls,
      designTokens,
      imageValidation,
      previousVersionId,
      demoUrl: finalDemoUrl,
      provisional: provisionalVersion,
      qualityGatePending,
      autoFixQueued,
      qualityGate: {
        passed: qualityGatePassed,
        failures: qualityGateFailures,
      },
      seoReview,
      regressionMatrix,
    };

    const logItems: VersionErrorLogPayload[] = [];
    if (!finalDemoUrl) {
      logItems.push({
        level: "error",
        category: "preview",
        message: previewBlockingReason
          ? `Preview blockerades i preflight: ${previewBlockingReason}`
          : "Preview-länk saknas för versionen.",
        meta: {
          versionId,
          previewCode: preflight?.previewBlocked ? "preflight_preview_blocked" : "preview_missing_url",
          previewStage: preflight?.previewBlocked ? "preflight" : "iframe",
          previewSource: preflight?.previewBlocked ? "finalize-preflight" : "post-check",
          previewBlocked: preflight?.previewBlocked ?? false,
          verificationBlocked: preflight?.verificationBlocked ?? false,
          previewBlockingReason,
        },
      });
    }
    if (missingRoutes.length > 0) {
      logItems.push({
        level: "warning",
        category: "routes",
        message: "Saknade interna routes.",
        meta: { missingRoutes },
      });
    }
    if (suspiciousUseCalls.length > 0) {
      logItems.push({
        level: "warning",
        category: "react",
        message: "Misstankt React use()-anvandning.",
        meta: { suspiciousUseCalls },
      });
    }
    if (lucideLinkMisuse.length > 0) {
      logItems.push({
        level: "warning",
        category: "navigation",
        message: "Felaktig Link-import upptackt.",
        meta: { files: lucideLinkMisuse },
      });
    }
    if (sanityErrors.length > 0 || sanityWarnings.length > 0) {
      logItems.push({
        level: sanityErrors.length > 0 ? "error" : "warning",
        category: "project-sanity",
        message: "Kodsanity rapporterade problem.",
        meta: { issues: sanity.issues.slice(0, 20) },
      });
    }
    if (!seoReview.passed) {
      logItems.push({
        level: "warning",
        category: "seo",
        message: `SEO review hittade ${seoReview.issues.length} launch-varning(ar).`,
        meta: {
          issues: seoReview.issues,
          signals: seoReview.signals,
        },
      });
    }
    if (imageValidation?.broken?.length) {
      logItems.push({
        level: "warning",
        category: "images",
        message: "Trasiga bild-URL:er hittade.",
        meta: {
          broken: imageValidation.broken,
          replacedCount: imageValidation.replacedCount ?? 0,
        },
      });
    }
    if (imageValidation?.warnings?.length) {
      logItems.push({
        level: "warning",
        category: "images",
        message: "Bildvalidering rapporterade varningar.",
        meta: { warnings: imageValidation.warnings },
      });
    }
    if (!qualityGatePassed) {
      logItems.push({
        level: "error",
        category: "quality-gate",
        message: "Quality gate failed after generation.",
        meta: { failures: qualityGateFailures },
      });
    }

    void persistVersionErrorLogs({ chatId, versionId, logs: logItems });

    if (autoFixReasons.length > 0) {
      onAutoFix?.({
        chatId,
        versionId,
        reasons: autoFixReasons,
        meta: {
          previousVersionId,
          missingRoutes,
          lucideLinkMisuse,
          suspiciousUseCalls,
          sanityIssues: sanity.issues,
          imageValidation,
          demoUrl: finalDemoUrl,
        },
      });
    }

    appendToolPartToMessage(setMessages, assistantMessageId, {
      type: "tool:post-check",
      toolName: "Post-check",
      toolCallId,
      state: "output-available",
      input: { chatId, versionId, previousVersionId },
      output,
    });

    appendPostCheckSummaryToMessage(
      setMessages,
      assistantMessageId,
      buildPostCheckSummary({
        changes,
        warnings,
        demoUrl: finalDemoUrl,
        previewBlockingReason,
        provisional: provisionalVersion,
        qualityGatePending,
        autoFixQueued,
      }),
    );

    if (autoFixReasons.length === 0) {
      void runSandboxQualityGate({
        chatId,
        versionId,
        assistantMessageId,
        setMessages,
        onAutoFix,
      });
    } else {
      appendToolPartToMessage(setMessages, assistantMessageId, {
        type: "tool:quality-gate",
        toolName: "Quality gate",
        toolCallId: `quality-gate:${versionId}`,
        state: "output-available",
        output: {
          skipped: true,
          reason: "Skippad eftersom autofix redan har köats från post-check.",
          autoFixQueued: true,
        },
      } as UiMessagePart);
    }
  } catch (error) {
    void persistVersionErrorLogs({
      chatId,
      versionId,
      logs: [
        {
          level: "error",
          category: "post-check",
          message: error instanceof Error ? error.message : "Post-check failed",
        },
      ],
    });
    appendToolPartToMessage(setMessages, assistantMessageId, {
      type: "tool:post-check",
      toolName: "Post-check",
      toolCallId,
      state: "output-error",
      input: { chatId, versionId },
      errorText: error instanceof Error ? error.message : "Post-check failed",
    });
  } finally {
    controller.abort();
  }
}

// ---------------------------------------------------------------------------
// Sandbox quality gate (non-blocking, best-effort)
// ---------------------------------------------------------------------------

type QualityGateCheckResult = {
  check: string;
  passed: boolean;
  exitCode: number;
  output: string;
};

async function runSandboxQualityGate(params: {
  chatId: string;
  versionId: string;
  assistantMessageId: string;
  setMessages: SetMessages;
  onAutoFix?: (payload: {
    chatId: string;
    versionId: string;
    reasons: string[];
    meta?: Record<string, unknown>;
  }) => void;
}) {
  const { chatId, versionId, assistantMessageId, setMessages, onAutoFix } = params;
  const toolCallId = `quality-gate:${versionId}`;

  appendToolPartToMessage(setMessages, assistantMessageId, {
    type: "tool:quality-gate",
    toolName: "Quality gate",
    toolCallId,
    state: "input-streaming",
    input: { chatId, versionId, checks: ["typecheck", "build"] },
  } as UiMessagePart);

  try {
    const res = await fetch(
      `/api/v0/chats/${encodeURIComponent(chatId)}/quality-gate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId, checks: ["typecheck", "build"] }),
      },
    );

    if (res.status === 501) {
      appendToolPartToMessage(setMessages, assistantMessageId, {
        type: "tool:quality-gate",
        toolName: "Quality gate",
        toolCallId,
        state: "output-available",
        output: { skipped: true, reason: "Sandbox not configured" },
      } as UiMessagePart);
      return;
    }

    const data = (await res.json().catch(() => null)) as {
      passed?: boolean;
      checks?: QualityGateCheckResult[];
      sandboxDurationMs?: number;
      error?: string;
    } | null;

    if (!res.ok || !data) {
      appendToolPartToMessage(setMessages, assistantMessageId, {
        type: "tool:quality-gate",
        toolName: "Quality gate",
        toolCallId,
        state: "output-error",
        errorText: data?.error || `Quality gate request failed (HTTP ${res.status})`,
      } as UiMessagePart);
      return;
    }

    const steps: string[] = [];
    const failedChecks: string[] = [];
    for (const check of data.checks ?? []) {
      const icon = check.passed ? "PASS" : "FAIL";
      steps.push(`${check.check}: ${icon} (exit ${check.exitCode})`);
      if (!check.passed) failedChecks.push(check.check);
    }
    if (data.sandboxDurationMs) {
      steps.push(`Duration: ${Math.round(data.sandboxDurationMs / 1000)}s`);
    }

    appendToolPartToMessage(setMessages, assistantMessageId, {
      type: "tool:quality-gate",
      toolName: "Quality gate",
      toolCallId,
      state: "output-available",
      output: {
        passed: data.passed,
        steps,
        checks: data.checks,
        sandboxDurationMs: data.sandboxDurationMs,
      },
    } as UiMessagePart);

    if (!data.passed && failedChecks.length > 0 && onAutoFix) {
      const failedOutputs: Record<string, string> = {};
      for (const c of data.checks ?? []) {
        if (!c.passed) failedOutputs[c.check] = c.output.slice(0, 2000);
      }
      onAutoFix({
        chatId,
        versionId,
        reasons: failedChecks.map((c) => `${c} failed`),
        meta: { qualityGate: failedOutputs },
      });
    }
  } catch {
    appendToolPartToMessage(setMessages, assistantMessageId, {
      type: "tool:quality-gate",
      toolName: "Quality gate",
      toolCallId,
      state: "output-error",
      errorText: "Quality gate request failed (network error)",
    } as UiMessagePart);
  }
}
