import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { getUserTransactions } from "@/lib/db/services/transactions";
import { loginMethodLabel } from "@/lib/konto/account";

const HISTORY_LIMIT = 50;

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

    const transactions = await getUserTransactions(user.id, HISTORY_LIMIT);

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
      transactions: transactions.map((row) => ({
        id: row.id,
        type: row.type,
        amount: row.amount,
        balanceAfter: row.balance_after,
        description: row.description,
        createdAt: row.created_at.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[API/konto] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Kunde inte hämta kontot." },
      { status: 500 },
    );
  }
}
