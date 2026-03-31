import { describe, expect, it } from "vitest";
import { inferFileLanguage } from "./infer-file-language";

describe("inferFileLanguage", () => {
  it("maps common web extensions", () => {
    expect(inferFileLanguage("app/page.tsx")).toBe("tsx");
    expect(inferFileLanguage("lib/x.ts")).toBe("ts");
    expect(inferFileLanguage("C:\\src\\Foo.TSX")).toBe("tsx");
    expect(inferFileLanguage("x.jsx")).toBe("jsx");
    expect(inferFileLanguage("x.js")).toBe("js");
    expect(inferFileLanguage("e.mjs")).toBe("js");
    expect(inferFileLanguage("e.cjs")).toBe("js");
    expect(inferFileLanguage("globals.css")).toBe("css");
    expect(inferFileLanguage("package.json")).toBe("json");
    expect(inferFileLanguage("README.md")).toBe("md");
    expect(inferFileLanguage("a.html")).toBe("html");
    expect(inferFileLanguage("b.htm")).toBe("html");
    expect(inferFileLanguage("icon.svg")).toBe("svg");
  });

  it("returns text for unknown extensions", () => {
    expect(inferFileLanguage("Dockerfile")).toBe("text");
    expect(inferFileLanguage("x.unknown")).toBe("text");
  });

  it("checks longer extensions before shorter (tsx before ts)", () => {
    expect(inferFileLanguage("file.tsx")).toBe("tsx");
    expect(inferFileLanguage("file.ts")).toBe("ts");
  });
});
