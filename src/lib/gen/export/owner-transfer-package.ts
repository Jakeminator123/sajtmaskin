import path from "node:path";
import type { CodeFile } from "@/lib/gen/parser";
import type { ProjectExportMedia } from "@/lib/projects/project-export-media";
import { sanitizeEnvSecretsForPublicExport } from "./sanitize-public-export";
import type { GitHubExportSourceFile } from "./github-tree-plan";

export const EXPORT_GUIDE_PATH = "SAJTMASKIN-EXPORT.md";
const PLATFORM_SITE_ORIGIN_RE = /https?:\/\/(?:[a-z0-9-]+\.)?sites\.sajtmaskin\.se/gi;
const ENV_REFERENCE_RE = /\bprocess\.env\.([A-Z][A-Z0-9_]*)\b/g;
const ENV_BRACKET_REFERENCE_RE = /\bprocess\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g;
const PUBLIC_ENV_REFERENCE_RE = /\bimport\.meta\.env\.([A-Z][A-Z0-9_]*)\b/g;
const PUBLIC_ENV_BRACKET_REFERENCE_RE = /\bimport\.meta\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g;
const ENV_DESTRUCTURE_RE = /\b(?:const|let|var)\s*\{([^{}]+)\}\s*=\s*(?:process|import\.meta)\.env\b/g;
const ENV_ASSIGN_RE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm;

const PROVIDERS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /^(?:NEXT_PUBLIC_)?SUPABASE_/, label: "Supabase (databas/auth/storage)" },
  { pattern: /^(?:NEXT_PUBLIC_)?STRIPE_/, label: "Stripe (betalningar)" },
  { pattern: /^RESEND_/, label: "Resend (e-post)" },
  { pattern: /^CONTENTFUL_/, label: "Contentful (CMS)" },
  { pattern: /^SANITY_/, label: "Sanity (CMS)" },
  { pattern: /^OPENAI_/, label: "OpenAI" },
];

export class OwnerTransferSiteUrlRequiredError extends Error {
  constructor() {
    super("Ange sajtens nya webbaddress för att ersätta en tidigare publiceringsadress.");
    this.name = "OwnerTransferSiteUrlRequiredError";
  }
}

function safeMediaName(name: string, id: number | string): string {
  const basename = name.replace(/\\/g, "/").split("/").pop() || "media.bin";
  const parsed = path.posix.parse(basename);
  const stem =
    parsed.name
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "media";
  const ext = parsed.ext
    .toLowerCase()
    .replace(/[^.a-z0-9]/g, "")
    .slice(0, 12);
  return `${id}-${stem}${ext || ".bin"}`;
}

function replaceAllLiteral(content: string, search: string, replacement: string): string {
  return search ? content.split(search).join(replacement) : content;
}

function originPattern(origin: string): RegExp {
  const escaped = origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}(?![a-zA-Z0-9.-])`, "g");
}

function collectEnvNames(files: ReadonlyArray<{ path: string; content: string }>): string[] {
  const names = new Set<string>();
  for (const file of files) {
    for (const match of file.content.matchAll(ENV_REFERENCE_RE)) names.add(match[1]);
    for (const match of file.content.matchAll(ENV_BRACKET_REFERENCE_RE)) names.add(match[1]);
    for (const match of file.content.matchAll(PUBLIC_ENV_REFERENCE_RE)) names.add(match[1]);
    for (const match of file.content.matchAll(PUBLIC_ENV_BRACKET_REFERENCE_RE)) names.add(match[1]);
    for (const match of file.content.matchAll(ENV_DESTRUCTURE_RE)) {
      for (const binding of match[1].split(",")) {
        const name = binding.trim().split(/[:=]/, 1)[0]?.trim();
        if (name && /^[A-Z][A-Z0-9_]*$/.test(name)) names.add(name);
      }
    }
    if (/(^|\/)\.env(?:\.|$)|(^|\/)env\.(?:example|env)$/i.test(file.path)) {
      for (const match of file.content.matchAll(ENV_ASSIGN_RE)) names.add(match[1].toUpperCase());
    }
  }
  names.add("NEXT_PUBLIC_SITE_URL");
  return Array.from(names).sort();
}

function packageCommands(files: ReadonlyArray<{ path: string; content: string }>): {
  install: string;
  build: string;
  dev: string;
} {
  const packageJson = files.find((file) => file.path === "package.json");
  let scripts: Record<string, unknown> = {};
  try {
    const parsed = packageJson ? (JSON.parse(packageJson.content) as Record<string, unknown>) : {};
    scripts =
      parsed.scripts && typeof parsed.scripts === "object"
        ? (parsed.scripts as Record<string, unknown>)
        : {};
  } catch {
    scripts = {};
  }
  const hasBuild = typeof scripts.build === "string";
  const hasDev = typeof scripts.dev === "string";
  if (files.some((file) => file.path === "pnpm-lock.yaml")) {
    return {
      install: "pnpm install --frozen-lockfile",
      build: hasBuild ? "pnpm build" : "# Ingen build-script finns i package.json",
      dev: hasDev ? "pnpm dev" : "# Ingen dev-script finns i package.json",
    };
  }
  if (files.some((file) => file.path === "yarn.lock")) {
    return {
      install: "yarn install --immutable",
      build: hasBuild ? "yarn build" : "# Ingen build-script finns i package.json",
      dev: hasDev ? "yarn dev" : "# Ingen dev-script finns i package.json",
    };
  }
  const frozen = files.some((file) => file.path === "package-lock.json");
  return {
    install: frozen ? "npm ci" : "npm install",
    build: hasBuild ? "npm run build" : "# Ingen build-script finns i package.json",
    dev: hasDev ? "npm run dev" : "# Ingen dev-script finns i package.json",
  };
}

function buildGuide(params: {
  files: ReadonlyArray<{ path: string; content: string }>;
  mediaCount: number;
  siteUrl: string | null;
  replacedProviderOrigin: string | null;
}): string {
  const envNames = collectEnvNames(params.files);
  const commands = packageCommands(params.files);
  const providers = Array.from(
    new Set(
      envNames
        .filter((name) => name !== "NEXT_PUBLIC_SITE_URL")
        .map(
          (name) =>
            PROVIDERS.find((provider) => provider.pattern.test(name))?.label ??
            `Extern konfiguration för ${name}`,
        ),
    ),
  );
  const envLines = envNames.map((name) => `- \`${name}\``).join("\n");
  const providerLines = providers.length
    ? providers.map((provider) => `- ${provider}`).join("\n")
    : "Inga obligatoriska externa tjänster upptäcktes.";
  const mediaText =
    params.mediaCount === 1
      ? " och en uppladdad mediafil under `public/media/`"
      : params.mediaCount > 1
        ? ` och ${params.mediaCount} uppladdade mediafiler under \`public/media/\``
        : "";
  const selectedAddress = params.siteUrl
    ? ` Kända adresser för projektets Sajtmaskin-publicering ersattes med \`${params.siteUrl}\`.`
    : "";
  const providerAddress = params.replacedProviderOrigin
    ? ` Den tidigare provider-adressen \`${params.replacedProviderOrigin}\` ingick i ersättningen.`
    : "";

  return `# Flytta den här sajten

Det här repot innehåller den exporterade projektversionen${mediaText}.

## Installera och bygg

Kräver Node-versionen i \`package.json#engines\` när den är angiven.

\`\`\`bash
${commands.install}
${commands.build}
${commands.dev}
\`\`\`

## Webbaddress och canonical

Sätt \`NEXT_PUBLIC_SITE_URL\` till den nya publika origin-adressen, till exempel \`https://www.dindoman.se\`. Exporten innehåller ingen tvingande canonical eller redirect tillbaka till kända adresser för projektets Sajtmaskin-publicering.${selectedAddress}${providerAddress} Andra tredjepartslänkar lämnas oförändrade.

## Miljövariabler

Kopiera \`env.example\` till \`.env.local\` och fyll i egna värden. Exporten innehåller bara variabelnamn; Sajtmaskins lagrade nyckelvärden följer inte med.

${envLines}

## Externa tjänster och rättigheter

${providerLines}

Databasdata, domänregistrering, tredjepartskonton, API-nycklar och licenser överförs inte. Du får använda den exporterade koden enligt de licenser som gäller för projektet och dess beroenden. Tredjepartsbibliotek och AI-genererat material kan ha egna eller icke-exklusiva rättigheter.
`;
}

/** Assemble code, durable media bytes and an honest handoff guide. */
export function buildOwnerTransferPackage(params: {
  projectFiles: CodeFile[];
  media: ProjectExportMedia[];
  siteUrl?: string | null;
  providerOrigin?: string | null;
}): GitHubExportSourceFile[] {
  const safeProjectFiles = sanitizeEnvSecretsForPublicExport(params.projectFiles);
  const requestedOrigin = params.siteUrl?.trim().replace(/\/$/, "") || null;
  const providerOrigin = params.providerOrigin?.trim().replace(/\/$/, "") || null;
  const mediaFiles: GitHubExportSourceFile[] = [];
  const replacements = new Map<string, string>();

  for (const item of params.media) {
    const exportPath = `public/media/${safeMediaName(item.originalName, item.id)}`;
    const publicPath = `/${exportPath.slice("public/".length)}`;
    mediaFiles.push({ path: exportPath, content: item.body });
    for (const sourceUrl of item.sourceUrls) replacements.set(sourceUrl, publicPath);
  }

  const hasHostedOrigin = safeProjectFiles.some(
    (file) =>
      PLATFORM_SITE_ORIGIN_RE.test(file.content) ||
      (providerOrigin ? originPattern(providerOrigin).test(file.content) : false),
  );
  const hasProviderOrigin = Boolean(
    providerOrigin &&
    safeProjectFiles.some((file) => originPattern(providerOrigin).test(file.content)),
  );
  PLATFORM_SITE_ORIGIN_RE.lastIndex = 0;
  if (hasHostedOrigin && !requestedOrigin) throw new OwnerTransferSiteUrlRequiredError();

  const textFiles = safeProjectFiles.map((file) => {
    let content = requestedOrigin
      ? file.content.replace(PLATFORM_SITE_ORIGIN_RE, requestedOrigin)
      : file.content;
    if (requestedOrigin && providerOrigin) {
      content = content.replace(originPattern(providerOrigin), requestedOrigin);
    }
    for (const [sourceUrl, publicPath] of replacements) {
      content = replaceAllLiteral(content, sourceUrl, publicPath);
    }
    return { ...file, content };
  });

  const envNames = collectEnvNames(textFiles);
  const envExample = textFiles.find((file) => file.path === "env.example");
  if (envExample) {
    const missingNames = envNames.filter(
      (name) => !new RegExp(`^\\s*${name}\\s*=`, "m").test(envExample.content),
    );
    if (missingNames.length) {
      envExample.content = `${envExample.content.trimEnd()}\n${missingNames
        .map((name) => `${name}=`)
        .join("\n")}\n`;
    }
  } else {
    textFiles.push({
      path: "env.example",
      content: `${envNames.map((name) => `${name}=`).join("\n")}\n`,
      language: "text",
    });
  }

  const withoutOldGuide = textFiles.filter((file) => file.path !== EXPORT_GUIDE_PATH);
  withoutOldGuide.push({
    path: EXPORT_GUIDE_PATH,
    content: buildGuide({
      files: withoutOldGuide,
      mediaCount: mediaFiles.length,
      siteUrl: params.siteUrl?.trim() || null,
      replacedProviderOrigin: hasProviderOrigin ? providerOrigin : null,
    }),
    language: "markdown",
  });
  return [...withoutOldGuide, ...mediaFiles];
}
