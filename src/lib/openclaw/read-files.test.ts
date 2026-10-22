import { describe, expect, it } from "vitest";
import { parseArmingDirective, parseStopDirective } from "./debug/armed-mandate";
import {
  normalizeOpenClawClientMessages,
  OPENCLAW_CHAT_MAX_CONTENT_CHARS,
} from "./message-validation";
import {
  buildReadFilesLimitTurn,
  buildReadFilesTurn,
  normalizeReadPath,
  READ_FILES_MAX_PATHS,
  selectRequestedFiles,
} from "./read-files";

const FILES = [
  { name: "app/page.tsx", content: "export default function Page() {}" },
  { name: "app/layout.tsx", content: "layout" },
  { name: "components/hero.tsx", content: "x".repeat(50) },
];

describe("normalizeReadPath", () => {
  it("tar bort inledande ./ och / samt backslash", () => {
    expect(normalizeReadPath("./app/page.tsx")).toBe("app/page.tsx");
    expect(normalizeReadPath("/app/page.tsx")).toBe("app/page.tsx");
    expect(normalizeReadPath("app\\page.tsx")).toBe("app/page.tsx");
  });
});

describe("selectRequestedFiles", () => {
  it("plockar begärda filer, rapporterar saknade och dedupar", () => {
    const selection = selectRequestedFiles(FILES, [
      "./app/page.tsx",
      "app/page.tsx",
      "app/missing.tsx",
    ]);
    expect(selection.files.map((file) => file.name)).toEqual(["app/page.tsx"]);
    expect(selection.missing).toEqual(["app/missing.tsx"]);
  });

  it("klipper per fil och totalt, och markerar klippningen", () => {
    const selection = selectRequestedFiles(
      FILES,
      ["components/hero.tsx", "app/page.tsx", "app/layout.tsx"],
      { maxCharsPerFile: 20, maxTotalChars: 30 },
    );
    expect(selection.files[0]).toEqual({
      name: "components/hero.tsx",
      content: "x".repeat(20),
      truncated: true,
    });
    // 10 tecken kvar av totalbudgeten → page.tsx klipps, layout hinner inte med.
    expect(selection.files[1].name).toBe("app/page.tsx");
    expect(selection.files[1].truncated).toBe(true);
    expect(selection.files).toHaveLength(2);
  });

  it("respekterar taket på antal sökvägar", () => {
    const selection = selectRequestedFiles(FILES, ["a", "b", "c", "d"], { maxPaths: 2 });
    expect(selection.files).toHaveLength(0);
    expect(selection.missing).toEqual(["a", "b"]);
  });
});

describe("buildReadFilesTurn", () => {
  it("formaterar filer med sökväg och nämner saknade", () => {
    const turn = buildReadFilesTurn(
      selectRequestedFiles(FILES, ["app/page.tsx", "nope.tsx"]),
    );
    expect(turn.startsWith("[Filinnehåll]")).toBe(true);
    expect(turn).toContain("--- app/page.tsx ---\nexport default function Page() {}");
    expect(turn).toContain("Filer som inte finns i versionen: nope.tsx.");
  });

  it("säger ifrån när inget kunde läsas", () => {
    const turn = buildReadFilesTurn({ files: [], missing: ["x.tsx"] });
    expect(turn).toContain("Ingen av de begärda filerna finns");
    expect(turn).toContain("x.tsx");
  });

  it("ryms alltid under chat-transportens tak så inget klipps tyst på vägen till modellen", () => {
    // Värsta fallet: maxantal filer, alla större än budgeten, långa namn, plus
    // saknade sökvägar. Transporten (`normalizeOpenClawClientMessages`) får
    // inte ändra ett enda tecken.
    const big = Array.from({ length: READ_FILES_MAX_PATHS }, (_, index) => ({
      name: `components/sections/some-long-directory-name/${"segment-".repeat(6)}${index}.tsx`,
      content: "y".repeat(50_000),
    }));
    const selection = selectRequestedFiles(big, [
      ...big.map((file) => file.name),
      "app/missing-one.tsx",
      "app/missing-two.tsx",
    ]);
    const turn = buildReadFilesTurn(selection);
    expect(turn.length).toBeLessThanOrEqual(OPENCLAW_CHAT_MAX_CONTENT_CHARS);
    const [normalized] = normalizeOpenClawClientMessages([{ role: "user", content: turn }]);
    expect(normalized.content).toBe(turn);
  });

  it("är interna turer som varken armerar eller stoppar", () => {
    for (const turn of [
      buildReadFilesTurn(selectRequestedFiles(FILES, ["app/page.tsx"])),
      buildReadFilesLimitTurn(),
    ]) {
      expect(parseArmingDirective(turn)).toBeNull();
      expect(parseStopDirective(turn)).toBe(false);
    }
  });
});
