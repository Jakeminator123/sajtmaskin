import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CHAT_DISPLAY_TITLE_EXCERPT_LENGTH,
  chatDisplayTitleSql,
  excerptFirstUserPrompt,
  firstUserPromptLateralSql,
  resolveChatDisplayTitle,
} from "./chat-display-title.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const latestSiteSource = readFileSync(join(here, "..", "latest-site.mjs"), "utf8");
const dumpLogsSource = readFileSync(join(here, "..", "dump-logs.mjs"), "utf8");
const billingSource = readFileSync(
  join(here, "..", "..", "..", "src/lib/db/services/generation-billing.ts"),
  "utf8",
);

describe("resolveChatDisplayTitle", () => {
  it("prefers title, then app_projects.name, then first user prompt", () => {
    expect(
      resolveChatDisplayTitle({
        title: "  Sparad titel  ",
        projectName: "Stilla Rum",
        firstUserPrompt: "Bygg en sajt",
      }),
    ).toBe("Sparad titel");
    expect(
      resolveChatDisplayTitle({
        title: null,
        projectName: "Stilla Rum",
        firstUserPrompt: "Bygg en sajt",
      }),
    ).toBe("Stilla Rum");
    expect(
      resolveChatDisplayTitle({
        title: " ",
        projectName: "",
        firstUserPrompt: "  Bygg en sajt för stillhet\noch meditation  ",
      }),
    ).toBe("Bygg en sajt för stillhet och meditation");
    expect(resolveChatDisplayTitle({})).toBeNull();
  });

  it("truncates long first-user prompts", () => {
    const excerpt = excerptFirstUserPrompt("x".repeat(CHAT_DISPLAY_TITLE_EXCERPT_LENGTH + 20));
    expect(excerpt).toHaveLength(CHAT_DISPLAY_TITLE_EXCERPT_LENGTH);
    expect(excerpt?.endsWith("…")).toBe(true);
  });
});

describe("chat-display-title SQL helpers", () => {
  it("emits the title → app_projects.name → first user-prompt order", () => {
    const sql = chatDisplayTitleSql();
    expect(sql).toContain("c.title");
    expect(sql).toContain("p.name");
    expect(sql).toContain("first_user.content");
    expect(sql.indexOf("c.title")).toBeLessThan(sql.indexOf("p.name"));
    expect(sql.indexOf("p.name")).toBeLessThan(sql.indexOf("first_user.content"));
    expect(firstUserPromptLateralSql()).toContain("FROM engine_messages");
    expect(firstUserPromptLateralSql()).toContain("role = 'user'");
  });

  it("is used by latest-site, dump-logs chats kind, and generation-billing", () => {
    expect(latestSiteSource).toContain("chat-display-title.mjs");
    expect(latestSiteSource).toContain("chatDisplayTitleSql");
    expect(latestSiteSource).toContain("app_projects");
    expect(dumpLogsSource).toContain("chat-display-title.mjs");
    expect(dumpLogsSource).toContain("chatDisplayTitleSql");
    expect(billingSource).toContain("resolveChatDisplayTitle");
    expect(billingSource).toContain("first_user");
    expect(billingSource).toContain("engine_messages");
  });
});
