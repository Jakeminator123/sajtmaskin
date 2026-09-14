import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { loginMethodLabel, transactionLabel } from "./account";

describe("loginMethodLabel", () => {
  it("maps users.provider without inventing a third method", () => {
    expect(loginMethodLabel("google")).toBe("Google");
    expect(loginMethodLabel("email")).toBe("E-post och lösenord");
    expect(loginMethodLabel(null)).toBe("E-post och lösenord");
  });
});

describe("transactionLabel", () => {
  it("prefers the stored description over a hardcoded invoice", () => {
    expect(transactionLabel({ type: "purchase", description: "Köp: starter" })).toBe(
      "Köp: starter",
    );
    expect(transactionLabel({ type: "purchase", description: null })).toBe("Köp av credits");
    expect(transactionLabel({ type: "wizard_enrich", description: "  " })).toBe("wizard_enrich");
  });
});

describe("konto page copy — no invented subscription", () => {
  it("does not render a plan, invoice or subscription section", () => {
    const src = readFileSync(join(__dirname, "../../app/konto/page.tsx"), "utf8");

    expect(src).not.toMatch(/abonnemang/i);
    expect(src).not.toMatch(/Ingen plan/);
    expect(src).not.toMatch(/faktur/i);
    expect(src).not.toMatch(/10 credits\/månad/);
  });
});
