import { describe, expect, it } from "vitest";
import { classifyRequestKind } from "./request-kind";

describe("classifyRequestKind", () => {
  it("returns unclassified for empty input", () => {
    expect(classifyRequestKind("")).toEqual({
      kind: "unclassified",
      source: "regex",
    });
  });

  it("detects integration when setup verb and provider co-occur", () => {
    expect(classifyRequestKind("Sätt upp Stripe checkout").kind).toBe("integration");
    expect(classifyRequestKind("Koppla in Supabase som databas").kind).toBe("integration");
  });

  it("detects redesign from strong phrases", () => {
    expect(classifyRequestKind("Gör om sajten from scratch").kind).toBe("redesign");
    expect(classifyRequestKind("Total redesign av hero").kind).toBe("redesign");
  });

  it("detects external-fetch for URLs or fetch phrasing", () => {
    expect(classifyRequestKind("Hämta färgtema från https://example.com").kind).toBe(
      "external-fetch",
    );
    expect(classifyRequestKind("Scrape pricing från konkurrent").kind).toBe("external-fetch");
  });

  it("detects multi-change with och between verbs", () => {
    expect(classifyRequestKind("Byt hero-bilden och uppdatera footern").kind).toBe(
      "multi-change",
    );
  });

  it("detects multi-change when the leading verb starts with a non-ASCII letter", () => {
    // ASCII \b never matches before `ä` (non-word in default tables), so the
    // previous pattern silently downgraded these to `unclassified`.
    expect(classifyRequestKind("Ändra färg och flytta knappen").kind).toBe("multi-change");
  });

  it("detects qa-or-score without imperative edit verbs", () => {
    expect(classifyRequestKind("Hur promptar jag för parallax?").kind).toBe("qa-or-score");
    expect(classifyRequestKind("Ge ett betyg på designen?").kind).toBe("qa-or-score");
  });

  it("does not label imperative edits as qa", () => {
    expect(classifyRequestKind("Hur ändrar jag färgen till blå?").kind).not.toBe("qa-or-score");
  });

  it("detects page-addition", () => {
    expect(classifyRequestKind("Lägg till en sida /om-oss med teamet").kind).toBe(
      "page-addition",
    );
  });

  it("detects local-layout", () => {
    expect(classifyRequestKind("Flytta features-blocket före pricing").kind).toBe(
      "local-layout",
    );
  });

  it("detects micro-edit for short color-focused prompts", () => {
    expect(classifyRequestKind("Byt primärfärg till #ea580c").kind).toBe("micro-edit");
  });

  it("does not classify any path mention as page-addition", () => {
    expect(classifyRequestKind("Ändra något i /api/foo så att det funkar").kind).not.toBe(
      "page-addition",
    );
  });

  it("treats 'var' positioning prompt as edit-intent, not qa-or-score", () => {
    expect(classifyRequestKind("Var ska jag lägga den här knappen?").kind).not.toBe(
      "qa-or-score",
    );
  });

  it("still classifies real questions starting with 'hur' as qa-or-score", () => {
    expect(classifyRequestKind("Hur fungerar din pipeline?").kind).toBe("qa-or-score");
  });
});
