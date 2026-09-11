import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/auth/admin";
import { DEFAULT_CREDIT_ACTION_PRICES, resolveCreditActionPrices } from "@/lib/credits/pricing";
import { DEFAULT_DOMAIN_PRICING } from "@/lib/domains/pricing";
import {
  getPricingSettings,
  updatePricingSettings,
} from "@/lib/db/services/pricing-settings";

function adminPayload(settings: Awaited<ReturnType<typeof getPricingSettings>>) {
  return {
    settings,
    defaults: {
      domain: DEFAULT_DOMAIN_PRICING,
      creditActionPrices: DEFAULT_CREDIT_ACTION_PRICES,
    },
    effective: {
      domain: settings.domain,
      creditActionPrices: resolveCreditActionPrices(settings.creditActionPrices),
    },
  };
}

export async function GET(req: NextRequest) {
  const admin = await requireAdminAccess(req);
  if (!admin.ok) return admin.response;

  try {
    const settings = await getPricingSettings();
    return NextResponse.json({ success: true, ...adminPayload(settings) });
  } catch (error) {
    console.error("[API/admin/pricing-settings] GET failed:", error);
    return NextResponse.json(
      { success: false, error: "Kunde inte hämta prisinställningarna." },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdminAccess(req);
  if (!admin.ok) return admin.response;

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const input: {
      domainMarkup?: number;
      domainUsdToSek?: number;
      creditActionPrices?: unknown;
      updatedBy: string;
    } = { updatedBy: admin.user.id };

    if (Object.prototype.hasOwnProperty.call(body, "domainMarkup")) {
      const domainMarkup = Number(body.domainMarkup);
      if (!Number.isFinite(domainMarkup)) {
        return NextResponse.json(
          { success: false, error: "Domänpåslaget måste vara ett giltigt tal." },
          { status: 400 },
        );
      }
      input.domainMarkup = domainMarkup;
    }

    if (Object.prototype.hasOwnProperty.call(body, "domainUsdToSek")) {
      const domainUsdToSek = Number(body.domainUsdToSek);
      if (!Number.isFinite(domainUsdToSek)) {
        return NextResponse.json(
          { success: false, error: "USD/SEK för domäner måste vara ett giltigt tal." },
          { status: 400 },
        );
      }
      input.domainUsdToSek = domainUsdToSek;
    }

    if (Object.prototype.hasOwnProperty.call(body, "creditActionPrices")) {
      input.creditActionPrices = body.creditActionPrices;
    }

    const settings = await updatePricingSettings(input);
    return NextResponse.json({ success: true, ...adminPayload(settings) });
  } catch (error) {
    if (error instanceof RangeError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error("[API/admin/pricing-settings] PATCH failed:", error);
    return NextResponse.json(
      { success: false, error: "Kunde inte spara prisinställningarna." },
      { status: 500 },
    );
  }
}
