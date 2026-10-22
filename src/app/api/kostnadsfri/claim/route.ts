import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { getCurrentUser } from "@/lib/auth/auth";
import { expireCookieSetOptions, requestUsesSecureCookies } from "@/lib/auth/host-cookies";
import {
  transferKostnadsfriCampaignAccount,
  type CampaignAccountTransferResult,
} from "@/lib/db/services/kostnadsfri-account";
import {
  acquireUserGenerationLock,
  releaseChatGenerationLock,
} from "@/lib/gen/stream/generation-lock";
import {
  CAMPAIGN_CLAIM_MARKER_COOKIE,
  isCampaignAccountProvider,
  isUnclaimedCampaignAccount,
} from "@/lib/kostnadsfri/campaign-account";
import {
  CAMPAIGN_CLAIM_MAX_AGE,
  campaignClaimCookieName,
  createCampaignClaimTicket,
  kostnadsfriCampaignEmail,
  readCampaignClaimTicket,
} from "@/lib/kostnadsfri/campaign-account-ticket";
import {
  KOSTNADSFRI_CAMPAIGN_COOKIE,
  readSignedKostnadsfriCampaignReceipt,
} from "@/lib/kostnadsfri/campaign-receipt";
import { withRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/kostnadsfri/claim — «Spara kontot» för ett kampanjkonto.
 *
 * `start` kräver att anroparen är inloggad som ett osparat kampanjkonto och
 * sätter en signerad biljett. Kunden loggar sedan in eller registrerar sig som
 * vanligt; `complete` kräver ett eget (icke-kampanj) konto plus biljetten och
 * flyttar kampanjkontots projekt dit. Båda identiteterna bevisas av
 * serversignerade cookies i samma webbläsare — inget id kommer från bodyn.
 */
const bodySchema = z.object({ action: z.enum(["start", "complete"]) });

type ClaimTransferResult =
  | CampaignAccountTransferResult
  | { status: "generation_in_progress" }
  | { status: "generation_lock_unavailable" };

async function transferAfterGenerationSettles(input: {
  campaignUserId: string;
  targetUserId: string;
}): Promise<ClaimTransferResult> {
  const admission = await acquireUserGenerationLock(input.campaignUserId);
  if (admission.status === "held") return { status: "generation_in_progress" };
  if (admission.status !== "acquired") return { status: "generation_lock_unavailable" };
  try {
    return await transferKostnadsfriCampaignAccount(input);
  } finally {
    await releaseChatGenerationLock(admission.lock);
  }
}

function claimMarkerCookie(secure: boolean, maxAge: number) {
  return {
    name: CAMPAIGN_CLAIM_MARKER_COOKIE,
    value: maxAge > 0 ? "1" : "",
    httpOnly: false,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

function withExpiredTicket(response: NextResponse, secure: boolean): NextResponse {
  response.cookies.set({
    name: campaignClaimCookieName(secure),
    value: "",
    ...expireCookieSetOptions(secure),
  });
  response.cookies.set(claimMarkerCookie(secure, 0));
  return response;
}

export async function POST(request: NextRequest) {
  return withRateLimit(request, "kostnadsfri:claim", async () => {
    try {
      const parsed = bodySchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) {
        return NextResponse.json({ success: false, error: "Ogiltig förfrågan." }, { status: 400 });
      }
      const user = await getCurrentUser(request);
      if (!user) {
        return NextResponse.json(
          { success: false, error: "Du måste vara inloggad." },
          { status: 401 },
        );
      }
      const secure = requestUsesSecureCookies(request);

      if (parsed.data.action === "start") {
        if (!isUnclaimedCampaignAccount(user)) {
          return NextResponse.json(
            { success: false, error: "Kontot är redan sparat." },
            { status: 409 },
          );
        }
        const receipt = readSignedKostnadsfriCampaignReceipt(
          request.cookies.get(KOSTNADSFRI_CAMPAIGN_COOKIE)?.value,
        );
        if (!receipt || user.email !== kostnadsfriCampaignEmail(receipt.slug)) {
          return NextResponse.json(
            {
              success: false,
              error: "Öppna inbjudan igen och tryck Spara kontot.",
              code: "campaign_session_mismatch",
            },
            { status: 409 },
          );
        }
        const response = NextResponse.json({ success: true, slug: receipt.slug });
        response.cookies.set({
          name: campaignClaimCookieName(secure),
          value: createCampaignClaimTicket(user.id, receipt.slug),
          httpOnly: true,
          secure,
          sameSite: "lax",
          path: "/",
          maxAge: CAMPAIGN_CLAIM_MAX_AGE,
        });
        response.cookies.set(claimMarkerCookie(secure, CAMPAIGN_CLAIM_MAX_AGE));
        return response;
      }

      if (isCampaignAccountProvider(user.provider)) {
        return NextResponse.json(
          { success: false, error: "Logga in med ditt eget konto för att spara.", code: "still_campaign" },
          { status: 409 },
        );
      }
      const ticket = readCampaignClaimTicket(
        request.cookies.get(campaignClaimCookieName(secure))?.value,
      );
      const receipt = readSignedKostnadsfriCampaignReceipt(
        request.cookies.get(KOSTNADSFRI_CAMPAIGN_COOKIE)?.value,
      );
      if (!ticket || !receipt || ticket.slug !== receipt.slug) {
        return withExpiredTicket(
          NextResponse.json(
            {
              success: false,
              error: ticket
                ? "Sparandet gäller inte den här inbjudan. Öppna länken och tryck Spara kontot igen."
                : "Sparandet hann gå ut. Öppna länken från mejlet igen och tryck Spara kontot.",
              code: ticket ? "ticket_stale" : "ticket_invalid",
            },
            { status: 400 },
          ),
          secure,
        );
      }

      const result = await transferAfterGenerationSettles({
        campaignUserId: ticket.campaignUserId,
        targetUserId: user.id,
      });
      if (result.status === "generation_in_progress" || result.status === "generation_lock_unavailable") {
        return NextResponse.json(
          {
            success: false,
            error:
              result.status === "generation_in_progress"
                ? "En generering pågår fortfarande. Försök igen när den är klar."
                : "Kontot kunde inte sparas just nu.",
            code: result.status,
          },
          { status: 503 },
        );
      }
      if (result.status !== "transferred") {
        return withExpiredTicket(
          NextResponse.json(
            {
              success: false,
              error:
                result.status === "already_claimed"
                  ? "Inbjudan är redan sparad till ett konto."
                  : "Kontot kunde inte sparas.",
              code: result.status,
            },
            { status: 409 },
          ),
          secure,
        );
      }
      return withExpiredTicket(
        NextResponse.json({ success: true, projects: result.projects }),
        secure,
      );
    } catch (error) {
      const kind = error instanceof Error ? error.name : typeof error;
      console.error(`[API/kostnadsfri/claim] Failed (${kind})`);
      return NextResponse.json(
        { success: false, error: "Kontot kunde inte sparas just nu." },
        { status: 500 },
      );
    }
  });
}
