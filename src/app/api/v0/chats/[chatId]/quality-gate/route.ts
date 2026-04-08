/**
 * Legacy compat — implementation lives in the engine route.
 */
export { POST } from "@/app/api/engine/chats/[chatId]/quality-gate/route";
export const runtime = "nodejs";
export const maxDuration = 300;
