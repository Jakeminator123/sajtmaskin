import { STREAM_SAFETY_TIMEOUT_DEFAULT_MS as STREAM_SAFETY_TIMEOUT_MS } from "@/lib/gen/defaults";

export const CREATE_CHAT_LOCK_KEY = "sajtmaskin:createChatLock";
export const CREATE_CHAT_LOCK_TTL_MS = 2 * 60 * 1000;
export const STREAM_SAFETY_TIMEOUT_DEFAULT_MS = STREAM_SAFETY_TIMEOUT_MS;

export const POST_CHECK_MARKER = "[Post-check]";
export const DESIGN_TOKEN_FILES = [
  "src/app/globals.css",
  "app/globals.css",
  "styles/globals.css",
  "globals.css",
];
