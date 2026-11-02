import { describe, expect, it } from "vitest";
import ts from "typescript";
import {
  BUSINESS_FACTS_MODULE_MARKER,
  BUSINESS_FACTS_MODULE_PATH,
  applyBusinessFactsToFiles,
  isBusinessFactsModulePath,
  renderBusinessFactsModule,
} from "./business-facts-module";
import type { BusinessFactsPersisted } from "./business-facts-schema";

const FACTS: BusinessFactsPersisted = {
  hours: {
    mode: "regular",
    week: {
      mon: { closed: false, open: "09:00", close: "17:00" },
      tue: { closed: false, open: "09:00", close: "17:00" },
      wed: { closed: false, open: "09:00", close: "17:00" },
      thu: { closed: false, open: "09:00", close: "17:00" },
      fri: { closed: false, open: "09:00", close: "15:00" },
      sat: { closed: false, open: "22:00", close: "02:00" },
      sun: { closed: true },
    },
  },
  contact: {
    phone: "08-123 45 67",
    email: "info@kund.se",
    orgNumber: "556677-8899",
    address: { street: "Storgatan 1", postalCode: "123 45", city: "Staden" },
  },
  lastSetAt: "2026-10-22T08:00:00.000Z",
};

type RenderedModule = {
  businessFacts: BusinessFactsPersisted;
  openingHoursLines: readonly string[];
  addressLine: string | null;
  hasOpeningHours: () => boolean;
  hasContact: () => boolean;
  isOpenNow: (now?: Date) => boolean | null;
  openingHoursSpecification: () => Array<Record<string, unknown>>;
};

/**
 * Compile the rendered module with the real TypeScript compiler (so a type
 * error in the template fails here, not in a customer's Vercel build) and
 * evaluate it as CommonJS. The module has no imports, so `require` is a trap.
 */
async function loadRenderedModule(facts: BusinessFactsPersisted): Promise<RenderedModule> {
  const source = renderBusinessFactsModule(facts);
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      strict: true,
    },
    reportDiagnostics: true,
  });
  const diagnostics = (output.diagnostics ?? []).map((diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
  );
  expect(diagnostics).toEqual([]);
  const moduleRef = { exports: {} as RenderedModule };
  const evaluate = new Function("exports", "module", "require", output.outputText);
  evaluate(moduleRef.exports, moduleRef, () => {
    throw new Error("rendered module must not require anything");
  });
  return moduleRef.exports;
}

describe("renderBusinessFactsModule", () => {
  it("renders a deterministic, import-free module that compiles and carries the facts", async () => {
    const source = renderBusinessFactsModule(FACTS);
    expect(source.startsWith(BUSINESS_FACTS_MODULE_MARKER)).toBe(true);
    expect(source).not.toMatch(/^import /m);
    expect(source).not.toContain("lastSetAt");
    expect(renderBusinessFactsModule(FACTS)).toBe(source);

    const mod = await loadRenderedModule(FACTS);
    expect(mod.businessFacts.contact.phone).toBe("08-123 45 67");
    expect(mod.openingHoursLines).toEqual([
      "Måndag–Torsdag 09:00–17:00",
      "Fredag 09:00–15:00",
      "Lördag 22:00–02:00",
      "Söndag Stängt",
    ]);
    expect(mod.addressLine).toBe("Storgatan 1, 123 45 Staden");
    expect(mod.hasOpeningHours()).toBe(true);
    expect(mod.hasContact()).toBe(true);
  });

  it("answers isOpenNow in Europe/Stockholm, including overnight closing", async () => {
    const mod = await loadRenderedModule(FACTS);
    // Wednesday 2026-10-21 10:00 Stockholm (CEST, UTC+2) → open.
    expect(mod.isOpenNow(new Date("2026-10-21T08:00:00Z"))).toBe(true);
    // Wednesday 18:00 Stockholm → closed.
    expect(mod.isOpenNow(new Date("2026-10-21T16:00:00Z"))).toBe(false);
    // Saturday 23:30 Stockholm → open (22:00–02:00).
    expect(mod.isOpenNow(new Date("2026-10-24T21:30:00Z"))).toBe(true);
    // Sunday 01:00 Stockholm → still Saturday's night opening, even though Sunday is closed.
    expect(mod.isOpenNow(new Date("2026-10-24T23:00:00Z"))).toBe(true);
    // Sunday 02:30 → Saturday's opening has closed.
    expect(mod.isOpenNow(new Date("2026-10-25T00:30:00Z"))).toBe(false);
    // Sunday 10:00 → closed.
    expect(mod.isOpenNow(new Date("2026-10-25T10:00:00Z"))).toBe(false);
    // Saturday 01:00 → Friday closed at 15:00, so the small hours are NOT open
    // even though Saturday itself has an overnight interval later.
    expect(mod.isOpenNow(new Date("2026-10-23T23:00:00Z"))).toBe(false);
  });

  it("returns null for isOpenNow when hours are unknown and renders empty lines", async () => {
    const mod = await loadRenderedModule({
      ...FACTS,
      hours: { mode: "by_appointment", week: null },
    });
    expect(mod.isOpenNow()).toBeNull();
    expect(mod.openingHoursLines).toEqual(["Öppet enligt överenskommelse"]);
    expect(mod.openingHoursSpecification()).toEqual([]);

    const always = await loadRenderedModule({ ...FACTS, hours: { mode: "always_open", week: null } });
    expect(always.isOpenNow()).toBe(true);
    expect(always.openingHoursSpecification()).toHaveLength(1);
  });

  it("emits schema.org openingHoursSpecification for open days only", async () => {
    const mod = await loadRenderedModule(FACTS);
    const spec = mod.openingHoursSpecification();
    expect(spec).toHaveLength(6);
    expect(spec[0]).toEqual({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: "Monday",
      opens: "09:00",
      closes: "17:00",
    });
    expect(spec.some((entry) => entry.dayOfWeek === "Sunday")).toBe(false);
  });
});

describe("applyBusinessFactsToFiles", () => {
  it("rewrites only an existing marked module and leaves other files untouched", () => {
    const files = [
      { name: "app/page.tsx", content: "export default function Page() { return null }" },
      { name: BUSINESS_FACTS_MODULE_PATH, content: `${BUSINESS_FACTS_MODULE_MARKER}\n// stale` },
    ];
    const result = applyBusinessFactsToFiles(files, FACTS);
    expect(result.applied).toBe(true);
    expect(result.skipped).toEqual([]);
    expect(result.files[0]).toBe(files[0]);
    expect(result.files[1].content).toBe(renderBusinessFactsModule(FACTS));
  });

  it("leaves a module the LLM rewrote (marker gone) untouched and reports it", () => {
    const files = [
      { name: BUSINESS_FACTS_MODULE_PATH, content: "export const businessFacts = { custom: true };" },
    ];
    const result = applyBusinessFactsToFiles(files, FACTS);
    expect(result.applied).toBe(false);
    expect(result.skipped).toEqual([BUSINESS_FACTS_MODULE_PATH]);
    expect(result.files[0]).toBe(files[0]);
  });

  it("is a no-op for a site without the module or with identical content", () => {
    const without = applyBusinessFactsToFiles([{ name: "app/page.tsx", content: "x" }], FACTS);
    expect(without.applied).toBe(false);

    const same = applyBusinessFactsToFiles(
      [{ name: `src/${BUSINESS_FACTS_MODULE_PATH}`, content: renderBusinessFactsModule(FACTS) }],
      FACTS,
    );
    expect(same.applied).toBe(false);
  });

  it("recognises root and src module paths with stray prefixes", () => {
    expect(isBusinessFactsModulePath("lib/business-facts.ts")).toBe(true);
    expect(isBusinessFactsModulePath("./src/lib/business-facts.ts")).toBe(true);
    expect(isBusinessFactsModulePath("lib/business-facts.tsx")).toBe(false);
  });
});
