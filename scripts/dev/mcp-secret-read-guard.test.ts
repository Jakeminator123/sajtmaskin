import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Körs som Cursor kör den — eget nodeanrop med JSON på stdin — precis som
 * heredoc-guard-testet. Kontraktet är svaret på stdout, inte en importerad
 * funktion.
 */
const HOOK = resolve(process.cwd(), ".cursor/hooks/mcp-secret-read-guard.mjs");
const MCP_PATH = "C:\\Users\\x\\dev\\sajtmaskin\\.cursor\\mcp.json";

function ask(input: unknown): { permission: string; user_message?: string } {
  const stdout = execFileSync(process.execPath, [HOOK], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf8",
  });
  return JSON.parse(stdout);
}

const CLEAN = JSON.stringify({
  mcpServers: {
    vercel: { url: "https://mcp.vercel.com/team/app", note: "OAuth i Cursor" },
    shadcn: { command: "cmd", args: ["/c", "x.cmd"], headers: { "User-Agent": "sajtmaskin" } },
  },
});

describe("mcp-secret-read-guard hook", () => {
  it("släpper igenom alla andra filer utan att titta på innehållet", () => {
    // Hooken körs på VARJE Read. Ett secret-format i en vanlig fil är inte
    // dess sak — annars hade den nekat läsning av t.ex. ett test som citerar
    // en tokenprefix.
    expect(
      ask({ file_path: "C:\\repo\\src\\lib\\auth.ts", content: 'const k = "sk-abcdefgh";' })
        .permission,
    ).toBe("allow");
  });

  it("släpper igenom en ren mcp.json — det är hela poängen med ägarbeslutet", () => {
    expect(ask({ file_path: MCP_PATH, content: CLEAN }).permission).toBe("allow");
  });

  it("känner igen sökvägen oavsett separator och skiftläge", () => {
    expect(ask({ file_path: "/home/x/sajtmaskin/.cursor/mcp.json", content: CLEAN }).permission).toBe(
      "allow",
    );
    const dirty = JSON.stringify({ mcpServers: { a: { headers: { Authorization: "Bearer zzz" } } } });
    expect(ask({ file_path: "/home/x/sajtmaskin/.Cursor/MCP.json", content: dirty }).permission).toBe(
      "deny",
    );
  });

  it("nekar när mcp.json bär en auth-header, och namnger fältet men inte värdet", () => {
    const verdict = ask({
      file_path: MCP_PATH,
      content: JSON.stringify({
        mcpServers: {
          context7: { url: "https://mcp.context7.com/mcp", headers: { Authorization: "Bearer superhemligt" } },
        },
      }),
    });
    expect(verdict.permission).toBe("deny");
    expect(verdict.user_message).toContain("context7.headers.Authorization");
    expect(verdict.user_message).not.toContain("superhemligt");
  });

  it("nekar tokenformade värden under ett oskyldigt nyckelnamn", () => {
    const verdict = ask({
      file_path: MCP_PATH,
      content: JSON.stringify({ mcpServers: { x: { url: "https://x.invalid?t=ghp_abcdefghijklmnop" } } }),
    });
    expect(verdict.permission).toBe("deny");
    expect(verdict.user_message).not.toContain("ghp_abcdefghijklmnop");
  });

  it("nekar en mcp.json som inte går att tolka — verdiktet kan inte räknas ut", () => {
    expect(ask({ file_path: MCP_PATH, content: "{ not json" }).permission).toBe("deny");
  });

  it("failar öppet på obegriplig hook-input i stället för att låsa alla Read", () => {
    expect(ask("").permission).toBe("allow");
    expect(ask("not json").permission).toBe("allow");
    expect(ask({}).permission).toBe("allow");
  });
});
