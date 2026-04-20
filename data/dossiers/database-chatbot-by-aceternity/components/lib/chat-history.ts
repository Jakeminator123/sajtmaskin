import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

export type ChatHistoryRow = {
  id: number;
  user_message: string;
  assistant_message: string;
  created_at: string;
};

export async function insertChatHistory(params: {
  userMessage: string;
  assistantMessage: string;
}) {
  const { userMessage, assistantMessage } = params;

  await sql`
    INSERT INTO chat_history (
      user_message,
      assistant_message,
      created_at
    ) VALUES (
      ${userMessage},
      ${assistantMessage},
      NOW()
    )
  `;
}

export async function listChatHistory(limit = 50): Promise<ChatHistoryRow[]> {
  const rows = await sql<ChatHistoryRow[]>`
    SELECT id, user_message, assistant_message, created_at
    FROM chat_history
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;

  return rows;
}
