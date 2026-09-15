import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/auth/auth";
import { ensureSessionIdFromRequest } from "@/lib/auth/session";
import { recordPageView } from "@/lib/db/services/analytics";
import { createPromptHandoff, getProjectByIdForOwner } from "@/lib/db/services/projects";
import { bindVerifiedKostnadsfriCampaign } from "@/lib/db/services/kostnadsfri-campaign";
import { cachePromptHandoff } from "@/lib/data/redis";
import { MAX_PROMPT_HANDOFF_CHARS } from "@/lib/builder/prompt-limits";
import { kostnadsfriEventPath } from "@/lib/kostnadsfri/analytics-paths";
import { readKostnadsfriCampaignReceipt } from "@/lib/kostnadsfri/campaign-receipt";

const createPromptSchema = z.object({
  prompt: z
    .string()
    .min(1, "Prompt is required")
    .max(MAX_PROMPT_HANDOFF_CHARS, `Prompt too long (max ${MAX_PROMPT_HANDOFF_CHARS} chars)`),
  source: z.string().optional(),
  projectId: z.string().optional(),
  /** Kostnadsfri flow only: the invited slug, so "skapad" is recorded server-side. */
  kostnadsfriSlug: z
    .string()
    .regex(/^[a-z0-9-]{1,120}$/, "Invalid slug")
    .optional(),
});

/**
 * The kostnadsfri funnel's last step. Recorded here — where the handoff row is
 * actually created — instead of by a browser beacon, so the admin column
 * "Skapade" cannot be inflated by opening a URL (see lib/kostnadsfri/analytics-paths).
 */
function recordKostnadsfriCompleted(
  request: NextRequest,
  slug: string,
  sessionId: string | null,
  userId: string | null,
) {
  const ip =
    request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for") || undefined;
  const userAgent = request.headers.get("user-agent") || undefined;
  after(async () => {
    try {
      await recordPageView(
        kostnadsfriEventPath(slug, "skapad"),
        sessionId ?? undefined,
        userId ?? undefined,
        ip,
        userAgent,
      );
    } catch (error) {
      console.error("[API/prompts] Failed to record kostnadsfri completion:", error);
    }
  });
}

export async function POST(request: NextRequest) {
  const session = ensureSessionIdFromRequest(request);
  const attachSessionCookie = (response: Response) => {
    const setCookies =
      session.setCookies ?? (session.setCookie ? [session.setCookie] : []);
    for (const setCookie of setCookies) {
      response.headers.append("Set-Cookie", setCookie);
    }
    return response;
  };
  return withRateLimit(request, "prompt:create", async () => {
    try {
      const body = await request.json().catch(() => ({}));
      const validation = createPromptSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          { success: false, error: "Validation failed", details: validation.error.issues },
          { status: 400 },
        );
      }

      const { prompt, source, projectId, kostnadsfriSlug } = validation.data;
      const trimmedPrompt = prompt.trim();
      if (!trimmedPrompt) {
        return NextResponse.json({ success: false, error: "Prompt is required" }, { status: 400 });
      }

      const user = await getCurrentUser(request);
      const sessionId = session.sessionId;
      if (!user?.id && !sessionId) {
        return attachSessionCookie(
          NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }),
        );
      }

      if (source === "kostnadsfri") {
        if (!user?.id) {
          return attachSessionCookie(
            NextResponse.json(
              { success: false, error: "Logga in för att bygga hemsidan.", requiresAuth: true },
              { status: 401 },
            ),
          );
        }
        if (!kostnadsfriSlug || !projectId) {
          return attachSessionCookie(
            NextResponse.json({ success: false, error: "Ogiltig inbjudan." }, { status: 403 }),
          );
        }
        const project = await getProjectByIdForOwner(projectId, {
          userId: user.id,
          sessionId,
        });
        if (!project) {
          return attachSessionCookie(
            NextResponse.json({ success: false, error: "Ogiltig inbjudan." }, { status: 403 }),
          );
        }
        const benefit = await bindVerifiedKostnadsfriCampaign({
          receipt: readKostnadsfriCampaignReceipt(request),
          invitationSlug: kostnadsfriSlug,
          projectId: project.id,
          userId: user?.id ?? null,
          sessionId,
        });
        if (!benefit) {
          return attachSessionCookie(
            NextResponse.json(
              { success: false, error: "Inbjudan kunde inte verifieras." },
              { status: 403 },
            ),
          );
        }
      }

      const created = await createPromptHandoff({
        prompt: trimmedPrompt,
        source: source || null,
        projectId: projectId || null,
        userId: user?.id || null,
        sessionId: sessionId || null,
      });

      if (source === "kostnadsfri" && kostnadsfriSlug) {
        recordKostnadsfriCompleted(request, kostnadsfriSlug, sessionId || null, user?.id || null);
      }

      await cachePromptHandoff({
        id: created.id,
        prompt: created.prompt,
        source: created.source || null,
        projectId: created.project_id || null,
        userId: created.user_id || null,
        sessionId: created.session_id || null,
        createdAt: created.created_at ? String(created.created_at) : null,
      });

      return attachSessionCookie(NextResponse.json({ success: true, promptId: created.id }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[API/prompts] Failed to create prompt handoff:", error);
      return attachSessionCookie(
        NextResponse.json({ success: false, error: message }, { status: 500 }),
      );
    }
  });
}
