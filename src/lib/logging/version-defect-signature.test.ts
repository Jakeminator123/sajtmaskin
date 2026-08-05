import { describe, expect, it } from "vitest";
import {
  buildDefectSignature,
  classifyVersionDefect,
  classifyVersionDefectKind,
  extractDefectLocation,
  normalizeDefectMessage,
} from "./version-defect-signature";

describe("classifyVersionDefectKind", () => {
  it("läser produktkoden ur product_postcheck-kategorin", () => {
    const kind = (category: string) => classifyVersionDefectKind({ category, message: "x" });
    expect(kind("product_postcheck.hydration_mismatch")).toBe("hydration");
    expect(kind("product_postcheck.runtime_crash")).toBe("runtime");
    expect(kind("product_postcheck.console_error")).toBe("runtime");
    expect(kind("product_postcheck.request_failed")).toBe("network");
    expect(kind("product_postcheck.http_error")).toBe("network");
    expect(kind("product_postcheck.broken_anchor")).toBe("product");
    expect(kind("product_postcheck.mobile_menu_failed")).toBe("product");
  });

  it("läser preview:client-error ur metan, inte kategorin", () => {
    const base = { category: "preview:client-error", message: "x" };
    expect(classifyVersionDefectKind({ ...base, meta: { kind: "hydration" } })).toBe("hydration");
    expect(classifyVersionDefectKind({ ...base, meta: { kind: "uncaught" } })).toBe("runtime");
    expect(classifyVersionDefectKind({ ...base, meta: { kind: "unhandledrejection" } })).toBe("runtime");
  });

  it("skiljer readiness-sondens byggfel från annan preview-diagnostik", () => {
    expect(
      classifyVersionDefectKind({
        category: "preview",
        message: "Failed to compile",
        meta: { source: "preview_readiness_probe" },
      }),
    ).toBe("compile");
    // Samma kategori utan sondens källa ska inte tolkas som kompileringsfel.
    expect(classifyVersionDefectKind({ category: "preview", message: "session hibernated" })).toBe(
      "other",
    );
  });

  it("mappar kompilerings- och env-kategorier", () => {
    expect(classifyVersionDefectKind({ category: "quality-gate:typecheck", message: "x" })).toBe("compile");
    expect(classifyVersionDefectKind({ category: "quality-gate:build", message: "x" })).toBe("compile");
    expect(classifyVersionDefectKind({ category: "syntax", message: "x" })).toBe("compile");
    expect(classifyVersionDefectKind({ category: "f3-readiness:missing-env", message: "x" })).toBe("env");
  });

  it("faller tillbaka på texten bara vid entydiga formuleringar", () => {
    expect(classifyVersionDefectKind({ category: "post-check", message: "Module not found: './Hero'" })).toBe(
      "compile",
    );
    expect(
      classifyVersionDefectKind({ category: "post-check", message: "Hydration failed because ..." }),
    ).toBe("hydration");
    // Otydligt ⇒ `other`. En felaktig hink är värre än ingen hink.
    expect(classifyVersionDefectKind({ category: "post-check", message: "något gick fel" })).toBe("other");
  });
});

describe("normalizeDefectMessage", () => {
  it("kortar URL:er till sökväg så miljöskillnader inte skapar nya signaturer", () => {
    expect(normalizeDefectMessage("404 https://vm-fly-jakem.fly.dev/assets/logo.png?v=3")).toBe(
      "<n> /assets/logo.png",
    );
  });

  it("maskar id:n och tal men behåller modulnamnet", () => {
    const normalized = normalizeDefectMessage(
      "Module not found: Can't resolve './components/Hero' at line 42",
    );
    expect(normalized).toContain("./components/hero");
    expect(normalized).toContain("<n>");
  });

  it("kortar absoluta sökvägar men lämnar relativa orörda", () => {
    expect(normalizeDefectMessage("Error in /home/runner/work/src/app/page.tsx")).toContain(
      "src/app/page.tsx",
    );
    // Regressionen: mönstret åt separatorn i ett relativt importnamn och slog
    // ihop alla saknade moduler till en signatur.
    expect(normalizeDefectMessage("Can't resolve './components/Hero'")).toContain(
      "./components/hero",
    );
  });

  it("returnerar tom sträng för tomt meddelande", () => {
    expect(normalizeDefectMessage("   ")).toBe("");
  });
});

describe("signaturens stabilitet", () => {
  const hydrationMessage =
    "Hydration failed because the server rendered text didn't match the client.";

  it("ger SAMMA signatur för samma fel i två olika chattar", () => {
    const a = classifyVersionDefect({
      category: "preview:client-error",
      message: `[/chat_a1b2c3d4e5/om-oss] ${hydrationMessage}`,
      meta: { kind: "hydration" },
    });
    const b = classifyVersionDefect({
      category: "preview:client-error",
      message: `[/chat_z9y8x7w6v5/om-oss] ${hydrationMessage}`,
      meta: { kind: "hydration" },
    });

    expect(a?.signature).toBeTruthy();
    expect(a?.signature).toBe(b?.signature);
    expect(a?.kind).toBe("hydration");
  });

  it("ändras INTE när felet flyttar några rader", () => {
    const at = (line: number) =>
      classifyVersionDefect({
        category: "syntax",
        message: `Unexpected token at src/components/Hero.tsx:${line}`,
      })?.signature;

    expect(at(42)).toBe(at(87));
  });

  it("skiljer samma meddelande i olika filer", () => {
    const inFile = (file: string) =>
      classifyVersionDefect({ category: "syntax", message: "Unexpected token", meta: { file } })
        ?.signature;

    expect(inFile("src/a.tsx")).not.toBe(inFile("src/b.tsx"));
  });

  it("skiljer olika felklasser även vid identisk text", () => {
    const message = "något hände";
    const a = buildDefectSignature("compile", normalizeDefectMessage(message));
    const b = buildDefectSignature("network", normalizeDefectMessage(message));
    expect(a).not.toBe(b);
  });

  it("returnerar null när meddelandet saknas — annars blir tomma rader en jättehink", () => {
    expect(classifyVersionDefect({ category: "syntax", message: "" })).toBeNull();
    expect(classifyVersionDefect({ category: "syntax", message: null })).toBeNull();
  });
});

describe("extractDefectLocation", () => {
  it("låter strukturerad meta vinna över textmatchning", () => {
    expect(
      extractDefectLocation({
        message: "trasigt i src/other.tsx:9",
        meta: { file: "src/canonical.tsx", line: 3 },
      }),
    ).toEqual({ file: "src/canonical.tsx", line: 3 });
  });

  it("plockar fil och rad ur meddelandet när meta saknas", () => {
    expect(extractDefectLocation({ message: "Error at src/components/Hero.tsx:42" })).toEqual({
      file: "src/components/Hero.tsx",
      line: 42,
    });
  });

  it("ger tomt när ingen fil kan utläsas", () => {
    expect(extractDefectLocation({ message: "något gick fel" })).toEqual({});
  });
});
