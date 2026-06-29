import { describe, expect, it } from "vitest";
import {
  evaluateProductDomSnapshot,
  evaluateRuntimeErrors,
  isAllowedProductPostcheckUrl,
  isRenderFatalError,
  productPostcheckSkipReasonFromError,
  type ProductDomEvaluation,
  type ProductPostcheckWarning,
} from "./product-postcheck";

function codes(input: ProductPostcheckWarning[] | ProductDomEvaluation): string[] {
  const warnings = Array.isArray(input) ? input : input.warnings;
  return warnings.map((warning) => warning.code).sort();
}

describe("isAllowedProductPostcheckUrl", () => {
  it("allows local dev and known Fly preview host", () => {
    expect(isAllowedProductPostcheckUrl("http://localhost:3000/demo")).toBe(true);
    expect(isAllowedProductPostcheckUrl("http://127.0.0.1:3000/demo")).toBe(true);
    expect(isAllowedProductPostcheckUrl("https://vm-fly-jakem.fly.dev/chat_1")).toBe(true);
  });

  it("rejects arbitrary external URLs", () => {
    expect(isAllowedProductPostcheckUrl("https://example.com")).toBe(false);
    expect(isAllowedProductPostcheckUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedProductPostcheckUrl("not a url")).toBe(false);
  });
});

describe("evaluateProductDomSnapshot", () => {
  it("reports broken anchors", () => {
    const evaluation = evaluateProductDomSnapshot(
      {
        anchors: [{ href: "#missing", text: "Till sektion", targetExists: false }],
        images: [],
        ctas: [],
        forms: [],
      },
      { status: "not_applicable" },
    );

    expect(codes(evaluation)).toEqual(["broken_anchor"]);
    expect(evaluation.warnings[0]?.href).toBe("#missing");
    expect(evaluation.productBlocked).toBe(false);
  });

  it("reports broken images with naturalWidth 0", () => {
    const evaluation = evaluateProductDomSnapshot(
      {
        anchors: [],
        images: [
          {
            src: "https://images.unsplash.com/broken.jpg",
            alt: "Porträtt",
            naturalWidth: 0,
            complete: true,
          },
        ],
        ctas: [],
        forms: [],
      },
      { status: "not_applicable" },
    );

    expect(codes(evaluation)).toEqual(["broken_image"]);
    expect(evaluation.warnings[0]?.src).toContain("broken.jpg");
    expect(evaluation.productBlocked).toBe(false);
  });

  it("reports CTA buttons and links without targets/actions", () => {
    const evaluation = evaluateProductDomSnapshot(
      {
        anchors: [],
        images: [],
        ctas: [
          {
            tag: "a",
            text: "Kom igång",
            href: "#",
            disabled: false,
            ariaDisabled: false,
            ariaControls: null,
            ariaExpanded: null,
            type: null,
            inForm: false,
            formAction: null,
            demoOnly: false,
          },
          {
            tag: "button",
            text: "Boka nu",
            href: null,
            disabled: false,
            ariaDisabled: false,
            ariaControls: null,
            ariaExpanded: null,
            type: "button",
            inForm: false,
            formAction: null,
            demoOnly: false,
          },
        ],
        forms: [],
      },
      { status: "not_applicable" },
    );

    expect(codes(evaluation)).toEqual(["cta_no_handler", "cta_no_handler"]);
    expect(evaluation.productBlocked).toBe(false);
  });

  it("reports fake forms", () => {
    const evaluation = evaluateProductDomSnapshot(
      {
        anchors: [],
        images: [],
        ctas: [],
        forms: [
          {
            id: "contact",
            action: null,
            method: null,
            hasSubmitControl: true,
            disabled: false,
            ariaDisabled: false,
            demoOnly: false,
            text: "Kontakta oss",
          },
        ],
      },
      { status: "not_applicable" },
    );

    expect(codes(evaluation)).toEqual(["fake_form"]);
    expect(evaluation.productBlocked).toBe(false);
  });

  it("reports mobile menu failure but ignores not_applicable", () => {
    const failed = evaluateProductDomSnapshot(
      { anchors: [], images: [], ctas: [], forms: [] },
      { status: "failed", reason: "hamburger_button_did_not_change_dom_or_aria" },
    );
    const skipped = evaluateProductDomSnapshot(
      { anchors: [], images: [], ctas: [], forms: [] },
      { status: "not_applicable" },
    );

    expect(codes(failed)).toEqual(["mobile_menu_failed"]);
    expect(failed.productBlocked).toBe(true);
    expect(skipped).toEqual({ warnings: [], productBlocked: false });
  });

  it("blocks when several internal anchors are broken", () => {
    const evaluation = evaluateProductDomSnapshot(
      {
        anchors: [
          { href: "#missing-a", text: "A", targetExists: false },
          { href: "#missing-b", text: "B", targetExists: false },
        ],
        images: [],
        ctas: [],
        forms: [],
      },
      { status: "not_applicable" },
    );

    expect(codes(evaluation)).toEqual(["broken_anchor", "broken_anchor"]);
    expect(evaluation.productBlocked).toBe(true);
  });
});

describe("productPostcheckSkipReasonFromError", () => {
  it("klassificerar Playwright/browser-fel som fail-open skip reasons", () => {
    expect(productPostcheckSkipReasonFromError(new Error("playwright is not installed"))).toBe(
      "playwright_unavailable",
    );
    expect(productPostcheckSkipReasonFromError(new Error("Timeout 30000ms exceeded"))).toBe("timeout");
    expect(productPostcheckSkipReasonFromError(new Error("page.goto: net::ERR_CONNECTION_REFUSED"))).toBe(
      "navigation_failed",
    );
    expect(productPostcheckSkipReasonFromError(new Error("unexpected"))).toBe("runtime_error");
  });
});

describe("isRenderFatalError", () => {
  it("matches React-tree-fatal crashes (white screen)", () => {
    expect(
      isRenderFatalError(
        "Error: Element type is invalid: expected a string ... but got: object",
      ),
    ).toBe(true);
    expect(isRenderFatalError("Minified React error #130")).toBe(true);
    expect(isRenderFatalError("Objects are not valid as a React child (found: object)")).toBe(true);
    expect(isRenderFatalError("Rendered fewer hooks than expected")).toBe(true);
  });

  it("does not match ambiguous/benign throws (no over-blocking)", () => {
    expect(isRenderFatalError("")).toBe(false);
    // Generic JS throws are intentionally NOT treated as render-fatal here —
    // they can be non-fatal/third-party. Catching that class safely needs a
    // robust render-health signal (tracked follow-up).
    expect(isRenderFatalError("TypeError: item.icon is not a function")).toBe(false);
    expect(
      isRenderFatalError("TypeError: Cannot read properties of undefined (reading 'map')"),
    ).toBe(false);
    expect(isRenderFatalError("Failed to load resource: 404")).toBe(false);
  });
});

describe("evaluateRuntimeErrors (M#f2et — never green when the preview is dead)", () => {
  const elementTypeInvalid =
    "Error: Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: object. Check the render method of `IconMark`.";

  it("blocks on a render-fatal React crash (white screen)", () => {
    const result = evaluateRuntimeErrors([elementTypeInvalid]);
    expect(result.productBlocked).toBe(true);
    expect(codes(result)).toEqual(["runtime_crash"]);
  });

  it("does NOT block on benign / ambiguous uncaught errors when the page still rendered (F2 stays fast)", () => {
    const result = evaluateRuntimeErrors([
      "Failed to load resource: the server responded with 404",
      "TypeError: Cannot read properties of undefined (reading 'map')",
    ]);
    expect(result.productBlocked).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it("blocks when the Next.js error overlay is present, even for an ambiguous render crash (Codex #321 P1)", () => {
    // "Cannot read properties of undefined" during render is ambiguous on its
    // own, but if Next shows its error overlay the preview is dead → block.
    const result = evaluateRuntimeErrors(
      ["TypeError: Cannot read properties of undefined (reading 'map')"],
      { nextErrorOverlay: true },
    );
    expect(result.productBlocked).toBe(true);
    expect(codes(result)).toEqual(["runtime_crash"]);
  });

  it("blocks on the Next.js error overlay even with no captured pageerror", () => {
    const result = evaluateRuntimeErrors([], { nextErrorOverlay: true });
    expect(result.productBlocked).toBe(true);
    expect(codes(result)).toEqual(["runtime_crash"]);
  });

  it("returns a clean result when there were no runtime errors and no overlay", () => {
    expect(evaluateRuntimeErrors([])).toEqual({ warnings: [], productBlocked: false });
    expect(evaluateRuntimeErrors([], { nextErrorOverlay: false })).toEqual({
      warnings: [],
      productBlocked: false,
    });
  });

  it("dedupes repeated render-fatal messages and still blocks", () => {
    const result = evaluateRuntimeErrors([elementTypeInvalid, elementTypeInvalid, elementTypeInvalid]);
    expect(result.productBlocked).toBe(true);
    expect(result.warnings).toHaveLength(1);
  });
});
