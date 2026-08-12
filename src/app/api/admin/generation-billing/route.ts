import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/auth/admin";
import {
  getGenerationBillingAdminData,
  reconcilePendingGenerationBillings,
  updateGenerationBillingSettings,
} from "@/lib/db/services/generation-billing";
import { fetchOpenAiOrganizationCosts } from "@/lib/openai/organization-costs";

export async function GET(req: NextRequest) {
  const admin = await requireAdminAccess(req);
  if (!admin.ok) return admin.response;

  try {
    const daysParam = Number(req.nextUrl.searchParams.get("days") ?? "30");
    const days = Math.min(
      Math.max(Math.trunc(Number.isFinite(daysParam) ? daysParam : 30), 1),
      365,
    );
    const windowEnd = new Date(Math.floor(Date.now() / 1000) * 1000);
    const [data, openAiReconciliation] = await Promise.all([
      getGenerationBillingAdminData(days, 200, windowEnd),
      fetchOpenAiOrganizationCosts({ days, now: windowEnd }),
    ]);
    return NextResponse.json({ success: true, ...data, openAiReconciliation });
  } catch (error) {
    console.error("[API/admin/generation-billing] GET failed:", error);
    return NextResponse.json(
      { success: false, error: "Kunde inte hämta generationskostnaderna." },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdminAccess(req);
  if (!admin.ok) return admin.response;

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const markupMultiplier = Number(body.markupMultiplier);
    const usdToSek = Number(body.usdToSek);
    const sekPerCredit = Number(body.sekPerCredit);
    if (![markupMultiplier, usdToSek, sekPerCredit].every(Number.isFinite)) {
      return NextResponse.json(
        { success: false, error: "Alla tre prisfält måste vara giltiga tal." },
        { status: 400 },
      );
    }

    const settings = await updateGenerationBillingSettings({
      markupMultiplier,
      usdToSek,
      sekPerCredit,
      updatedBy: admin.user.id,
    });
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    if (error instanceof RangeError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error("[API/admin/generation-billing] PATCH failed:", error);
    return NextResponse.json(
      { success: false, error: "Kunde inte spara prisinställningarna." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminAccess(req);
  if (!admin.ok) return admin.response;

  try {
    const result = await reconcilePendingGenerationBillings();
    return NextResponse.json({ success: true, reconciliation: result });
  } catch (error) {
    console.error("[API/admin/generation-billing] POST reconciliation failed:", error);
    return NextResponse.json(
      { success: false, error: "Kunde inte köra om kostnadsavstämningen." },
      { status: 500 },
    );
  }
}
