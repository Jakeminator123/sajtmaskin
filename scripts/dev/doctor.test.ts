import { describe, expect, it } from "vitest";

import {
  checkMcp,
  checkMcpSecrets,
  checkNode,
  checkPluginCost,
  checkRtk,
  checkSkillDuplication,
} from "./doctor.mjs";

/**
 * The doctor reports machine-local drift, so its own logic cannot be verified by
 * running it here — this machine is only ever one of the states. These tests
 * drive the pure decisions with both states instead.
 */
describe("doctor — node pin", () => {
  it("accepterar exakt pin och flaggar avvikelse", () => {
    expect(checkNode("22.23.1", "v22.23.1").level).toBe("ok");
    const drift = checkNode("22.23.1", "v20.11.0");
    expect(drift.level).toBe("warn");
    expect(drift.message).toContain("22.23.1");
  });
});

describe("doctor — RTK", () => {
  it("är tyst när RTK inte är installerad alls", () => {
    // Motprov: annars hade varje maskin utan RTK fått en varning att åtgärda
    // något den medvetet inte har.
    expect(checkRtk({ binaryPresent: false, hooks: null }).level).toBe("ok");
  });

  it("varnar när binären finns men hooken saknas", () => {
    // Exakt läget efter Cursor-ominstallationen 2026-09-11: rtk.exe och
    // config.toml kvar, hooks.json borta, output tyst ofiltrerad.
    const verdict = checkRtk({ binaryPresent: true, hooks: null });
    expect(verdict.level).toBe("warn");
    expect(verdict.fix).toContain("--agent cursor");
  });

  it("godkänner en korrekt registrerad Cursor-hook", () => {
    expect(
      checkRtk({
        binaryPresent: true,
        hooks: { hooks: { preToolUse: [{ command: "rtk hook cursor", matcher: "Shell" }] } },
      }).level,
    ).toBe("ok");
  });

  it("godkänner inte en hook som pekar på ett annat verktyg", () => {
    expect(
      checkRtk({
        binaryPresent: true,
        hooks: { hooks: { preToolUse: [{ command: "rtk hook claude" }] } },
      }).level,
    ).toBe("warn");
  });
});

describe("doctor — MCP", () => {
  it("är tyst när live och mall har samma servrar", () => {
    expect(checkMcp({ live: ["vercel", "supabase"], template: ["supabase", "vercel"] }).level).toBe(
      "ok",
    );
  });

  it("namnger servrar som saknas lokalt", () => {
    const verdict = checkMcp({ live: ["vercel"], template: ["vercel", "context7"] });
    expect(verdict.level).toBe("note");
    expect(verdict.message).toContain("context7");
  });

  it("varnar när live-filen saknas helt", () => {
    expect(checkMcp({ live: null, template: ["vercel"] }).level).toBe("warn");
  });
});

describe("doctor — secrets i mcp.json", () => {
  // Den här ersätter .cursorignore-blocket: filen är läsbar igen, så kontrollen
  // måste fånga just det blocket skyddade mot.
  it("godkänner en fil med bara url och note", () => {
    expect(
      checkMcpSecrets({
        vercel: { url: "https://mcp.vercel.com/team/app", note: "OAuth i Cursor" },
        supabase: { url: "https://mcp.supabase.com/mcp?project_ref=abc&read_only=true" },
      }).level,
    ).toBe("ok");
  });

  it("flaggar en auth-header oavsett hur djupt den ligger", () => {
    const verdict = checkMcpSecrets({
      x: { url: "https://example.invalid", headers: { Authorization: "Bearer abc" } },
    });
    expect(verdict.level).toBe("warn");
    expect(verdict.message).toContain("x.headers.Authorization");
  });

  it("flaggar inte en ofarlig header — bara secret-formade barn", () => {
    // Extern granskning: `header` i nyckelregexen flaggade hela containern, så
    // `headers: { "User-Agent": … }` gav ett falskt warn vid varje predev.
    expect(
      checkMcpSecrets({ ok: { url: "https://x.invalid", headers: { "User-Agent": "sajtmaskin/1" } } })
        .level,
    ).toBe("ok");
    const mixed = checkMcpSecrets({
      m: { headers: { "User-Agent": "sajtmaskin/1", "X-Api-Key": "abc" } },
    });
    expect(mixed.level).toBe("warn");
    expect(mixed.message).toContain("m.headers.X-Api-Key");
    expect(mixed.message).not.toContain("User-Agent");
  });

  it("flaggar tokenformade värden under ett oskyldigt nyckelnamn", () => {
    const verdict = checkMcpSecrets({ y: { url: "https://x.invalid?k=ghp_abcdefghijklmnop" } });
    expect(verdict.level).toBe("warn");
  });

  it("fångar nyckelnamn som bara slutar på key, och Bearer-värden", () => {
    // Reviewfynd: `api[_-]?key` missade openai_key / private_key, och ett
    // oskyldigt nyckelnamn med `Bearer <slump>` slank igenom.
    expect(checkMcpSecrets({ a: { openai_key: "x" } }).level).toBe("warn");
    expect(checkMcpSecrets({ b: { private_key: "x" } }).level).toBe("warn");
    expect(checkMcpSecrets({ c: { apiKey: "x" } }).level).toBe("warn");
    expect(checkMcpSecrets({ d: { note: "Bearer abcdefghijklmnop" } }).level).toBe("warn");
    // Men inte ord som bara innehåller bokstäverna: `monkey` i en note är prosa.
    expect(checkMcpSecrets({ e: { note: "monkey business", url: "https://x.invalid" } }).level).toBe(
      "ok",
    );
  });

  it("läcker aldrig själva värdet i meddelandet", () => {
    const verdict = checkMcpSecrets({ z: { apiKey: "sk-superhemligt-varde" } });
    expect(verdict.message).not.toContain("superhemligt");
    expect(verdict.message).toContain("z.apiKey");
  });
});

describe("doctor — dubblerade skills", () => {
  it("hittar samma skill i två användarrötter", () => {
    const findings = checkSkillDuplication({
      cursorSkills: ["canvas", "share"],
      agentSkills: ["canvas", "share"],
      commandMirrors: [],
    });
    expect(findings[0].level).toBe("warn");
    expect(findings[0].message).toContain("2 skills");
  });

  it("hittar source-command-speglingar som warn, så --quiet visar dem", () => {
    // Nivån är inte kosmetik: `--quiet` i predev visar bara warn/note. Ett
    // byte till `info` hade tystat speglingarna vid varje dev-start utan att
    // meddelandetestet märkte det.
    const findings = checkSkillDuplication({
      cursorSkills: [],
      agentSkills: [],
      commandMirrors: ["source-command-818", "source-command-logg"],
    });
    expect(findings[0].level).toBe("warn");
    expect(findings[0].message).toContain("2 source-command");
  });

  it("är tyst när rötterna inte överlappar", () => {
    const findings = checkSkillDuplication({
      cursorSkills: ["canvas"],
      agentSkills: ["nagot-annat"],
      commandMirrors: [],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].level).toBe("ok");
  });
});

describe("doctor — plugin-kostnad", () => {
  it("rapporterar tunga kataloger som info, inte som driv", () => {
    // `info` är avsiktligt: kostnaden är ett stående faktum, och --quiet i
    // predev ska bara tala om det som faktiskt ändrats.
    const verdict = checkPluginCost([{ name: "vercel", skills: 51, approximateTokens: 4428 }]);
    expect(verdict.level).toBe("info");
    expect(verdict.message).toContain("4428");
  });

  it("säger ok när ingen katalog är tung", () => {
    expect(checkPluginCost([{ name: "docs-canvas", skills: 1, approximateTokens: 124 }]).level).toBe(
      "ok",
    );
  });
});
