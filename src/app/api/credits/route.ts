/**
 * API Route: Get/Use credits
 * GET /api/credits - Get current balance
 * POST /api/credits - Use credits (internal use)
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { getUserTransactions } from "@/lib/db/services/transactions";

/**
 * GET: Get current credit balance and usage info
 */
export async function GET(req: NextRequest) {
  try {
    // Try to get authenticated user
    const user = await getCurrentUser(req);

    if (user) {
      // Get transaction history
      const transactions = await getUserTransactions(user.id, 10);

      return NextResponse.json({
        success: true,
        authenticated: true,
        balance: user.diamonds,
        freeGenerationAvailable: user.free_generation_available,
        transactions: transactions.map((t) => ({
          id: t.id,
          type: t.type,
          amount: t.amount,
          balanceAfter: t.balance_after,
          description: t.description,
          createdAt: t.created_at,
        })),
      });
    }

    return NextResponse.json({
      success: true,
      authenticated: false,
      guest: {
        generationsUsed: 0,
        refinesUsed: 0,
        canGenerate: false,
        canRefine: false,
      },
    });
  } catch (error) {
    console.error("[API/credits] Error:", error);
    return NextResponse.json(
      { success: false, error: "Kunde inte hämta saldo. Försök ladda om sidan." },
      { status: 500 },
    );
  }
}
