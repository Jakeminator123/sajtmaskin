import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { chats, versions } from "@/lib/db/schema";
import { nanoid } from "nanoid";
import { withRateLimit } from "@/lib/rateLimit";
import { z } from "zod/v4";
import { ensureProjectForRequest } from "@/lib/tenant";
import { initFromRegistry, type QualityLevel } from "@/lib/v0/v0-generator";
import { isRegistryUrl, parseRegistryUrl } from "@/lib/v0/v0-url-parser";

export const runtime = "nodejs";
export const maxDuration = 120; // Registry init can take time

// Validation schema for init from registry
const initRegistrySchema = z.object({
  // Registry URL (e.g., https://ui.shadcn.com/r/styles/new-york-v4/login-01.json)
  registryUrl: z.string().url("Invalid registry URL"),
  // Quality level for generation
  quality: z
    .enum(["light", "standard", "pro", "premium", "max"])
    .default("max") as z.ZodType<QualityLevel>,
  // Optional name for the chat
  name: z.string().optional(),
  // Optional project ID
  projectId: z.string().optional(),
});

/**
 * POST /api/v0/chats/init-registry
 *
 * Initialize a chat from a shadcn/custom registry URL.
 *
 * This allows users to:
 * 1. Open any component from shadcn/ui or community registries
 * 2. Have v0 load the component code and dependencies
 * 3. Iterate on the component with natural language
 *
 * Registry URLs follow the shadcn registry spec:
 * - https://ui.shadcn.com/r/styles/new-york-v4/{component}.json
 * - https://custom-registry.com/r/{component}.json
 */
export async function POST(req: Request) {
  return withRateLimit(req, "chat:create", async () => {
    try {
      const body = await req.json().catch(() => ({}));

      // Validate input
      const validationResult = initRegistrySchema.safeParse(body);
      if (!validationResult.success) {
        return NextResponse.json(
          { error: "Validation failed", details: validationResult.error.issues },
          { status: 400 },
        );
      }

      const { registryUrl, quality, name, projectId } = validationResult.data;

      // Validate that it's actually a registry URL
      if (!isRegistryUrl(registryUrl)) {
        return NextResponse.json(
          {
            error: "Invalid registry URL",
            details:
              "The URL does not appear to be a valid registry URL. Registry URLs typically end with .json and contain /r/ in the path.",
          },
          { status: 400 },
        );
      }

      // Parse registry URL for metadata
      const parsed = parseRegistryUrl(registryUrl);
      const componentName = parsed.componentName || "component";
      const chatName = name || `Registry: ${componentName}`;

      console.log("[init-registry] Initializing from registry:", {
        registryUrl,
        componentName,
        style: parsed.style,
        quality,
      });

      // Initialize from registry using v0 Platform API
      const result = await initFromRegistry(registryUrl, {
        quality,
        name: chatName,
      });

      // Save chat and version to database
      let internalChatId: string | null = null;
      try {
        internalChatId = nanoid();
        const v0ProjectId = projectId || `registry:${componentName}:${Date.now()}`;

        // Create or find project (tenant-scoped if x-user-id is present)
        const project = await ensureProjectForRequest({
          req,
          v0ProjectId,
          name: chatName,
        });

        // Save chat
        await db.insert(chats).values({
          id: internalChatId,
          v0ChatId: result.chatId,
          v0ProjectId,
          projectId: project.id,
          webUrl: result.webUrl || null,
        });

        // Save initial version if available
        if (result.versionId) {
          await db.insert(versions).values({
            id: nanoid(),
            chatId: internalChatId,
            v0VersionId: result.versionId,
            v0MessageId: null,
            demoUrl: result.demoUrl || null,
            metadata: {
              componentName,
              registryUrl,
              style: parsed.style,
              quality,
            },
          });
        }
      } catch (dbError) {
        console.error("Failed to save registry chat to database:", dbError);
        return NextResponse.json(
          {
            error: "Failed to save registry chat",
            details: "Database error while persisting chat metadata.",
          },
          { status: 500 },
        );
      }

      if (!internalChatId) {
        return NextResponse.json(
          {
            error: "Failed to save registry chat",
            details: "No internal chat ID could be created.",
          },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        chatId: result.chatId,
        internalChatId,
        demoUrl: result.demoUrl,
        versionId: result.versionId,
        webUrl: result.webUrl,
        files: result.files,
        code: result.code,
        model: result.model,
        registry: {
          url: registryUrl,
          componentName,
          style: parsed.style,
        },
      });
    } catch (err) {
      console.error("Init registry error:", err);

      const msg = err instanceof Error ? err.message : "";

      // Registry not found
      if (msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("404")) {
        return NextResponse.json(
          {
            error: "Registry item not found",
            details:
              "The specified registry URL could not be found. Check that the URL is correct.",
          },
          { status: 404 },
        );
      }

      // Rate limit
      if (msg.toLowerCase().includes("rate limit") || msg.toLowerCase().includes("429")) {
        return NextResponse.json(
          {
            error: "Rate limit exceeded",
            details: "Too many requests. Please wait before trying again.",
          },
          { status: 429 },
        );
      }

      // Auth error
      if (msg.toLowerCase().includes("unauthorized") || msg.toLowerCase().includes("401")) {
        return NextResponse.json(
          {
            error: "Authentication failed",
            details: "V0_API_KEY is missing or invalid.",
          },
          { status: 401 },
        );
      }

      // Server error
      if (
        msg.includes("500") ||
        msg.includes("502") ||
        msg.includes("503") ||
        msg.includes("504")
      ) {
        return NextResponse.json(
          {
            error: "v0 API temporarily unavailable",
            details: "The v0 service is experiencing issues. Please try again.",
          },
          { status: 503 },
        );
      }

      return NextResponse.json({ error: msg || "Unknown error" }, { status: 500 });
    }
  });
}
