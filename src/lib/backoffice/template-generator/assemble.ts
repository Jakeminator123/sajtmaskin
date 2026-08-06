import type { ContentManifest } from "../content-extractor";
import type { BackofficeFile, BackofficeFileSet } from "./types";
import {
  generateLoginPage,
  generateDashboardPage,
  generateContentPage,
  generateImagesPage,
  generateColorsPage,
  generateLayout,
} from "./pages";
import { generateAuthRoute, generateContentRoute, generateColorsRoute } from "./api-routes";
import { generateStorageLib } from "./storage";
/**
 * Main generator function - creates all backoffice files
 * @param manifest - Content manifest extracted from the site
 * @param password - Optional password for backoffice (uses placeholder if not provided)
 */
export function generateBackofficeFiles(
  manifest: ContentManifest,
  password?: string,
): BackofficeFileSet {
  const files: BackofficeFile[] = [
    // Pages
    { path: "app/backoffice/page.tsx", content: generateLoginPage() },
    { path: "app/backoffice/layout.tsx", content: generateLayout() },
    {
      path: "app/backoffice/dashboard/page.tsx",
      content: generateDashboardPage(manifest),
    },
    {
      path: "app/backoffice/content/page.tsx",
      content: generateContentPage(manifest),
    },
    { path: "app/backoffice/images/page.tsx", content: generateImagesPage() },
    {
      path: "app/backoffice/colors/page.tsx",
      content: generateColorsPage(manifest),
    },

    // API routes
    { path: "app/api/backoffice/auth/route.ts", content: generateAuthRoute() },
    { path: "app/api/backoffice/_lib/storage.ts", content: generateStorageLib() },
    {
      path: "app/api/backoffice/content/route.ts",
      content: generateContentRoute(),
    },
    {
      path: "app/api/backoffice/colors/route.ts",
      content: generateColorsRoute(),
    },

    // Content manifest
    { path: "data/manifest.json", content: JSON.stringify(manifest, null, 2) },
  ];

  // Use provided password or placeholder
  const passwordValue = password || "your-secure-password-here";
  const passwordComment = password
    ? "# Your chosen backoffice password (keep this secret!)"
    : "# Set a secure password for the backoffice admin panel";

  const envExample = `# Backoffice Configuration
# ======================
${passwordComment}
BACKOFFICE_PASSWORD=${passwordValue}

# Session version for forced logout/revocation.
# Increase this value (e.g. 1 -> 2) to invalidate all active sessions.
BACKOFFICE_SESSION_VERSION=1

# Data directory for content/color changes (default: ./data)
# On Vercel/serverless, set to /tmp/data (ephemeral - resets on redeploy)
# DATA_DIR=/tmp/data

# Storage backend for backoffice edits:
# - fs: writes to DATA_DIR (default)
# - json-blob: stores JSON in Vercel Blob (recommended on Vercel)
# STORAGE_BACKEND=fs

# Required when STORAGE_BACKEND=json-blob
# BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
# Defaults are environment-scoped:
# - dev => backoffice/dev/content.json
# - preview => backoffice/preview/content.json
# - prod => backoffice/prod/content.json
# BLOB_CONTENT_KEY=backoffice/prod/content.json
# BLOB_COLORS_KEY=backoffice/prod/colors.json

# For image uploads (optional - uses local storage by default)
# CLOUDINARY_URL=cloudinary://...
# or
# AWS_S3_BUCKET=your-bucket-name
`;

  // Generate setup instructions based on whether password was provided
  const passwordSetupStep = password
    ? `1. Kopiera .env.example till .env (lösenordet är redan satt):
   \`\`\`
   cp .env.example .env
   \`\`\``
    : `1. Kopiera .env.example och sätt ett lösenord:
   \`\`\`
   cp .env.example .env
   # Redigera .env och sätt BACKOFFICE_PASSWORD
   \`\`\``;

  const setupInstructions = `# Backoffice Setup
================

Din sajt inkluderar ett backoffice-system för enkel redigering.

## Snabbstart

${passwordSetupStep}

2. Starta sajten:
   \`\`\`
   npm run dev
   \`\`\`

3. Gå till /backoffice och logga in

## Vad kan du redigera?

- **Texter**: Rubriker, beskrivningar, knappar
- **Bilder**: Byt ut bilder direkt
- **Färger**: Ändra färgtema (primär, sekundär, accent)
${manifest.products.length > 0 ? "- **Produkter**: Hantera produkter och priser" : ""}

## Deployment

### Vercel
1. Lägg till miljövariabler i Vercel-dashboarden
2. Välj lagring:
   - **Enklast (ephemeral):** \`STORAGE_BACKEND=fs\` + \`DATA_DIR=/tmp/data\`
   - **Persistent:** \`STORAGE_BACKEND=json-blob\` + \`BLOB_READ_WRITE_TOKEN\`
3. För \`json-blob\`, installera beroendet i projektet:
   \`\`\`
   npm install @vercel/blob
   \`\`\`
4. Standardnycklarna blir miljöspecifika för att undvika krockar mellan dev,
   preview och prod:
   - \`backoffice/dev/content.json\`, \`backoffice/dev/colors.json\`
   - \`backoffice/preview/content.json\`, \`backoffice/preview/colors.json\`
   - \`backoffice/prod/content.json\`, \`backoffice/prod/colors.json\`
5. Sätt \`BLOB_CONTENT_KEY\` och \`BLOB_COLORS_KEY\` bara om du medvetet vill
   skriva till egna blob-paths.

### Render, Railway eller liknande
1. Lägg till miljövariabler i din hosting-dashboard
2. Konfigurera build-kommando: \`npm run build\`
3. Konfigurera start-kommando: \`npm start\`

### Egen server
1. Kopiera alla filer till din server
2. Kör \`npm install\` och \`npm run build\`
3. Starta med \`npm start\` eller använd PM2

## Säkerhet

- Sessioner hanteras via HttpOnly-cookies (ej synliga för JavaScript)
- För att tvinga utloggning av alla: öka \`BACKOFFICE_SESSION_VERSION\` i .env och redeploya
- Byt lösenord regelbundet
- Använd ett starkt lösenord (12+ tecken)
- Dela aldrig lösenordet i klartext

`;

  return {
    files,
    envExample,
    setupInstructions,
  };
}
