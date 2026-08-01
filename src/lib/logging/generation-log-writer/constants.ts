import path from "node:path";

export const ROOT_DIR = path.join(process.cwd(), "logs", "generationslogg");
export const SITE_OBSERVABILITY_DIR = path.join(process.cwd(), "logs", "site-observability");
export const LEGACY_INDEX_DIR = path.join(process.cwd(), "logs", "llm-segmentts-and-index");
export const RUN_INDEX_DIR = path.join(ROOT_DIR, "_index");
export const CHAT_TO_RUN_INDEX_FILE = path.join(RUN_INDEX_DIR, "chat-to-run.json");
export const UNROUTED_DIR = path.join(ROOT_DIR, "_unrouted");
export const TIMELINE_FILE = "timeline.ndjson";
export const SUMMARY_FILE = "summary.md";
export const META_FILE = "meta.json";
export const OBSERVABILITY_FILE = "observability.json";
export const FIX_PATTERNS_FILE = "fix-patterns.json";
export const LATEST_FILE = "_latest.txt";
export const FAULT_FIX_FILE = "fault-fix-index.md";
export const FAULT_FIX_CSV_FILE = "fault-fix-index.csv";
export const GLOBAL_ERROR_LOG_CSV_FILE = "error-log.csv";
export const SITE_HISTORY_FILE = "history.ndjson";
export const SITE_LATEST_DIR = "latest";
// Per-run-mappar under generationslogg/. Hålls låg för att undvika bred
// Turbopack/NFT-trace i lokala builds och hålla observability-mapparna smala.
export const MAX_RUN_DIRS = 5;
export const MAX_TIMELINE_ENTRIES_PER_RUN = 1_000;
export const MAX_SUMMARY_TIMELINE_ROWS = 180;
// Per-chat history.ndjson cappar till 5 rader per chat. Det här
// är OCAPAT antalet *chat-mappar* under site-observability/. Med LRU-prune
// nedan kommer äldsta chats att rensas bort när vi går över taket.
//
// Cap sänkt 30 → 5 (2026-04-21): durable chat/version-data ligger i Postgres,
// medan dessa per-chat-mappar bara används för (a) LLM-fixerns kortminne om
// återkommande fel inom en aktiv session och (b) telemetri-snapshots. 5
// senaste räcker för normal arbetsbelastning och håller Cursor-indexet smalt.
export const MAX_SITE_HISTORY_RUNS = 5;
export const MAX_SITE_OBSERVABILITY_CHATS = 5;
// _unrouted/ är fallback-bucketar för events som saknar runId/chatId/slug.
// Förut kunde de ackumuleras för evigt; vi cappar dem på samma sätt.
export const MAX_UNROUTED_BUCKETS = 5;
// Legacy global CSV (logs/llm-segmentts-and-index/error-log.csv) läses av
// backoffice (Autofix & Kvalitet, llm_config.py). Förut växte den utan tak.
// 2000 senaste rader räcker för fix-statistiken; äldre rader trunkeras.
export const MAX_GLOBAL_ERROR_LOG_ROWS = 2_000;
