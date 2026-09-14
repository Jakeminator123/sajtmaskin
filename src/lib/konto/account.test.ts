import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  kontoOlderHistoryNotice,
  loginMethodLabel,
  mergeKontoTransactions,
  parseKontoHistoryQuery,
  shouldApplyKontoResponse,
  sliceKontoHistory,
  transactionLabel,
} from "./account";

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

describe("shouldApplyKontoResponse", () => {
  it("keeps a response only for the same signed-in user", () => {
    expect(shouldApplyKontoResponse("user_a", "user_a")).toBe(true);
    expect(shouldApplyKontoResponse("user_a", "user_b")).toBe(false);
    expect(shouldApplyKontoResponse("user_a", null)).toBe(false);
    expect(shouldApplyKontoResponse(null, "user_a")).toBe(false);
    expect(shouldApplyKontoResponse(undefined, undefined)).toBe(false);
  });
});

describe("parseKontoHistoryQuery", () => {
  it("defaults, caps limit at 50 and treats invalid offset as 0", () => {
    expect(parseKontoHistoryQuery(new URLSearchParams())).toEqual({
      limit: 50,
      offset: 0,
    });
    expect(parseKontoHistoryQuery(new URLSearchParams("limit=999&offset=25"))).toEqual({
      limit: 50,
      offset: 25,
    });
    expect(parseKontoHistoryQuery(new URLSearchParams("limit=10&offset=-4"))).toEqual({
      limit: 10,
      offset: 0,
    });
    expect(parseKontoHistoryQuery(new URLSearchParams("userId=user_other"))).toEqual({
      limit: 50,
      offset: 0,
    });
  });
});

describe("sliceKontoHistory", () => {
  it("uses the extra row as a hasMore signal", () => {
    expect(sliceKontoHistory(["a", "b", "c"], 2)).toEqual({
      rows: ["a", "b"],
      hasMore: true,
    });
    expect(sliceKontoHistory(["a", "b"], 2)).toEqual({
      rows: ["a", "b"],
      hasMore: false,
    });
  });
});

describe("mergeKontoTransactions", () => {
  it("appends unseen ids and skips duplicates", () => {
    expect(
      mergeKontoTransactions([{ id: "tx_1" }, { id: "tx_2" }], [{ id: "tx_2" }, { id: "tx_3" }]),
    ).toEqual([{ id: "tx_1" }, { id: "tx_2" }, { id: "tx_3" }]);
  });
});

describe("kontoOlderHistoryNotice", () => {
  it("names the visible window instead of hiding older purchases", () => {
    expect(kontoOlderHistoryNotice(50)).toBe("Visar de 50 senaste. Äldre poster finns.");
  });
});
