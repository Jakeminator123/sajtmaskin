import { NextResponse } from "next/server";
import { listChatHistory } from "@/lib/chat-history";

export async function GET() {
  try {
    const history = await listChatHistory();
    return NextResponse.json({ history });
  } catch (error) {
    console.error("Failed to load chat history", error);
    return NextResponse.json(
      { error: "Failed to load chat history" },
      { status: 500 }
    );
  }
}
