import "server-only";

import { auth } from "@/auth";
import { ChatbotError } from "@/lib/errors";

export async function requireSession() {
  const session = await auth();

  if (!session?.user) {
    throw new ChatbotError("unauthorized:auth");
  }

  return session;
}
