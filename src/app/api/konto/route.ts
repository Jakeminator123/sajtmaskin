import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { getUserTransactions } from "@/lib/db/services/transactions";
import {
  loginMethodLabel,
  parseKontoHistoryQuery,
  sliceKontoHistory,
} from "@/lib/konto/account";

/**
 * GET /api/konto — account, credit balance and ledger for the signed-in user.
 *
 * Authority is the session from `getCurrentUser()`. A `userId` query parameter
 * is ignored so the client cannot ask for another user's history.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Du måste vara inloggad." },
        { status: 401 },
      );
    }

    const { limit, offset } = parseKontoHistoryQuery(request.nextUrl.searchParams);
    const fetched = await getUserTransactions(user.id, limit + 1, offset);
    const { rows, hasMore } = sliceKontoHistory(fetched, limit);

    return NextResponse.json({
      success: true,
      account: {
        name: user.name,
        email: user.email,
        loginMethod: loginMethodLabel(user.provider),
      },
      credits: {
        balance: user.diamonds,
      },
      transactions: rows.map((row) => ({
        id: row.id,
        type: row.type,
        amount: row.amount,
        balanceAfter: row.balance_after,
        description: row.description,
        createdAt: row.created_at.toISOString(),
      })),
      hasMore,
      limit,
      offset,
    });
  } catch (error) {
    console.error("[API/konto] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Kunde inte hämta kontot." },
      { status: 500 },
    );
  }
}
