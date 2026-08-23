import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ANON_BRIEF_CHAT_SKIP_REASON,
  EMPTY_CHAT_FLAG_ERROR,
  HANDOFF_CHAT_SKIP_REASON,
  anonBriefSkipReason,
  briefKeyBelongsToChat,
  chatFlagPresent,
  handoffSkipReason,
  kindPatterns,
  parseCacheValue,
  parseRedisConnect,
  previewExactKeys,
  redisDbFromPathname,
  resolveChatId,
  sortByCachedAtDesc,
  toEpochMs,
} from "./dump-redis-cache-parse.mjs";

const dumpSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "dump-redis-cache.mjs"),
  "utf8",
);

describe("dump-redis-cache.mjs", () => {
  it("är strikt read-only (SCAN + GET, inga mutationer)", () => {
    expect(dumpSource).toContain("redis.scan(");
    expect(dumpSource).toContain("redis.get(");
    expect(dumpSource).not.toMatch(/redis\.(set|setex|setnx|del|unlink|flushdb|flushall|hset|lpush|sadd)\b/i);
  });

  it("återanvänder dump-logs env-/trunkeringskontrakt", () => {
    expect(dumpSource).toContain("mergeEnvFileOverProcess");
    expect(dumpSource).toContain(".env.vercel.production.pulled");
    expect(dumpSource).toContain("handoffSkipReason");
    expect(dumpSource).toContain("anonBriefSkipReason");
    expect(dumpSource).toContain("parseRedisConnect");
    expect(dumpSource).toContain("connect.db");
    expect(dumpSource).toContain("`anon`");
  });
});

describe("chat-scopade briefs (fynd 1)", () => {
  const chatId = "083a4eaa-a83a-46f2-8262-49e993a42825";

  it("SCANar inte det globala anon-namespacet när --chat är satt", () => {
    expect(kindPatterns("briefs", "prod:", chatId)).toEqual([
      `prod:brief:v1:*:${chatId}:*`,
    ]);
    expect(kindPatterns("briefs", "prod:", chatId).join(" ")).not.toContain("anon");
    expect(anonBriefSkipReason(chatId)).toBe(ANON_BRIEF_CHAT_SKIP_REASON);
    expect(dumpSource).toContain("anonBriefSkipReason(chatId)");
  });

  it("släpper igenom bara nycklar som innehåller chatId", () => {
    expect(
      briefKeyBelongsToChat(`prod:brief:v1:openai/gpt-5.6-sol:${chatId}:abc`, chatId),
    ).toBe(true);
    expect(
      briefKeyBelongsToChat("prod:brief:v1:openai/gpt-5.6-sol:anon:0d93f16c262bc7c46f6a40e8", chatId),
    ).toBe(false);
  });
});

describe("tomt --chat failar stängt (fynd 2)", () => {
  it("avvisar --chat= och --chat utan värde", () => {
    expect(chatFlagPresent(["--json", "--chat="])).toBe(true);
    expect(chatFlagPresent(["--chat", "--json"])).toBe(true);
    expect(chatFlagPresent(["--json"])).toBe(false);
    expect(resolveChatId("", true)).toEqual({ error: EMPTY_CHAT_FLAG_ERROR });
    expect(resolveChatId("   ", true)).toEqual({ error: EMPTY_CHAT_FLAG_ERROR });
    expect(resolveChatId(null, true)).toEqual({ error: EMPTY_CHAT_FLAG_ERROR });
  });

  it("utelämnad flagga är oscoped; giltigt värde vinner", () => {
    expect(resolveChatId(null, false)).toEqual({ chatId: null });
    expect(resolveChatId("  abc  ", true)).toEqual({ chatId: "abc" });
    expect(dumpSource).toContain("resolveChatId(");
    expect(dumpSource).toContain("chatFlagPresent(argv)");
  });
});

describe("handoff chat-scope (fynd 1)", () => {
  it("utesluter handoffs när --chat är satt — payloaden saknar chatId", () => {
    expect(handoffSkipReason("083a4eaa-a83a-46f2-8262-49e993a42825")).toBe(
      HANDOFF_CHAT_SKIP_REASON,
    );
    expect(kindPatterns("handoffs", "prod:", "083a4eaa-a83a-46f2-8262-49e993a42825")).toEqual(
      [],
    );
    expect(dumpSource).toContain("handoffSkipReason(chatId)");
    expect(HANDOFF_CHAT_SKIP_REASON).toMatch(/kan inte chat-filtreras/);
  });

  it("SCANar handoffs bara utan --chat", () => {
    expect(handoffSkipReason(null)).toBeNull();
    expect(handoffSkipReason("")).toBeNull();
    expect(kindPatterns("handoffs", "prod:", null)).toEqual(["prod:prompt_handoff:*"]);
  });
});

describe("parseCacheValue timestamps (fynd 2)", () => {
  it("parsar ISO-createdAt (handoff-kontraktet) till epoch-ms", () => {
    const iso = "2026-08-23T03:55:36.881Z";
    expect(toEpochMs(iso)).toBe(Date.parse(iso));
    const parsed = parseCacheValue(
      JSON.stringify({
        id: "h1",
        prompt: "hej",
        createdAt: iso,
      }),
    );
    expect(parsed.cachedAt).toBe(Date.parse(iso));
  });

  it("behåller numeriskt cachedAt / lastUsedAt", () => {
    expect(toEpochMs(1787452920401)).toBe(1787452920401);
    expect(parseCacheValue(JSON.stringify({ cachedAt: 1787452920401 })).cachedAt).toBe(
      1787452920401,
    );
    expect(parseCacheValue(JSON.stringify({ lastUsedAt: 100 })).cachedAt).toBe(100);
  });

  it("sorterar ISO-handoffs nyast först, inte scan-ordning", () => {
    const older = parseCacheValue(
      JSON.stringify({ id: "old", createdAt: "2026-08-20T00:00:00.000Z" }),
    );
    const newer = parseCacheValue(
      JSON.stringify({ id: "new", createdAt: "2026-08-23T12:00:00.000Z" }),
    );
    const sorted = sortByCachedAtDesc([
      { key: "prod:prompt_handoff:old", ...older },
      { key: "prod:prompt_handoff:new", ...newer },
    ]);
    expect(sorted.map((row) => row.key)).toEqual([
      "prod:prompt_handoff:new",
      "prod:prompt_handoff:old",
    ]);
  });
});

describe("Redis URL parse (fynd 3–4)", () => {
  it("behåller pathname-databasen och avkodar userinfo", () => {
    expect(redisDbFromPathname("/1")).toBe(1);
    expect(redisDbFromPathname("/")).toBe(0);
    // URL:en byggs av delar i stället för att stå som literal: en komplett
    // Redis-URL med inbäddad userinfo triggar GitGuardians credential-detektor
    // även när värdena är påhittade, och en röd secret-scan på en PR är
    // dyrare än den här raden är ful.
    const userinfo = ["user%40name", "p%40ss"].join(":");
    const parsed = parseRedisConnect(`rediss://${userinfo}@example.test:6380/1`);
    expect(parsed.error).toBeUndefined();
    expect(parsed.db).toBe(1);
    expect(parsed.username).toBe("user@name");
    expect(parsed.password).toBe("p@ss");
    expect(parsed.port).toBe(6380);
    expect(parsed.useTls).toBe(true);
    expect(parsed.host).toBe("example.test");
  });
});

describe("previewExactKeys (legacy prefix)", () => {
  it("provar current- och legacy-prefix (samma som readPreviewSessionFromRedis)", () => {
    const chatId = "083a4eaa-a83a-46f2-8262-49e993a42825";
    const keys = previewExactKeys("prod:", chatId);
    expect(keys).toContain(`prod:preview-session:session:${chatId}`);
    expect(keys).toContain(`prod:sandbox-preview:session:${chatId}`);
    expect(kindPatterns("previews", "prod:", null)).toEqual([
      "prod:preview-session:session:*",
      "prod:sandbox-preview:session:*",
    ]);
  });
});
