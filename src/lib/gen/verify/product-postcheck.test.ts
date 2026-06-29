import { describe, expect, it } from "vitest";
import {
  evaluateProductDomSnapshot,
  evaluateRuntimeErrors,
  isAllowedProductPostcheckUrl,
  isAmbiguousRuntimeError,
  isStructuralRenderFatal,
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

describe("isStructuralRenderFatal", () => {
  it("matches React-tree-fatal crashes regardless of render state", () => {
    expect(
      isStructuralRenderFatal(
        "Error: Element type is invalid: expected a string ... but got: object",
      ),
    ).toBe(true);
    expect(isStructuralRenderFatal("Minified React error #130")).toBe(true);
    expect(
      isStructuralRenderFatal("Objects are not valid as a React child (found: object)"),
    ).toBe(true);
  });

  it("does not match ambiguous or benign throws", () => {
    expect(isStructuralRenderFatal("")).toBe(false);
    expect(isStructuralRenderFatal("TypeError: item.icon is not a function")).toBe(false);
    expect(isStructuralRenderFatal("Failed to load resource: 404")).toBe(false);
  });
});

describe("isAmbiguousRuntimeError", () => {
  it("matches generic JS throws that may or may not blank the page", () => {
    expect(isAmbiguousRuntimeError("TypeError: item.icon is not a function")).toBe(true);
    expect(
      isAmbiguousRuntimeError("TypeError: Cannot read properties of undefined (reading 'map')"),
    ).toBe(true);
    expect(isAmbiguousRuntimeError("ReferenceError: Foo is not defined")).toBe(true);
  });

  it("does not match structural-fatal or benign throws", () => {
    expect(isAmbiguousRuntimeError("Element type is invalid ... got: object")).toBe(false);
    expect(isAmbiguousRuntimeError("Failed to load resource: 404")).toBe(false);
  });
});

describe("evaluateRuntimeErrors (M#f2et — never green when the preview is dead)", () => {
  const elementTypeInvalid =
    "Error: Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: object. Check the render method of `IconMark`.";

  it("blocks on a structural React crash regardless of render state", () => {
    const result = evaluateRuntimeErrors([elementTypeInvalid], { renderedEmpty: false });
    expect(result.productBlocked).toBe(true);
    expect(codes(result)).toEqual(["runtime_crash"]);
  });

  it("blocks on an ambiguous throw ONLY when the page actually rendered empty", () => {
    const message = "TypeError: Cannot read properties of undefined (reading 'map')";
    const blankedResult = evaluateRuntimeErrors([message], { renderedEmpty: true });
    expect(blankedResult.productBlocked).toBe(true);
    expect(codes(blankedResult)).toEqual(["runtime_crash"]);

    // Same throw, but the page rendered content (e.g. a third-party script
    // threw) → not fatal, do not over-block F2.
    const renderedResult = evaluateRuntimeErrors([message], { renderedEmpty: false });
    expect(renderedResult.productBlocked).toBe(false);
    expect(renderedResult.warnings).toEqual([]);
  });

  it("does NOT block on a benign uncaught error (F2 stays fast)", () => {
    const result = evaluateRuntimeErrors(
      ["Failed to load resource: the server responded with 404"],
      { renderedEmpty: true },
    );
    expect(result.productBlocked).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it("returns a clean result when there were no runtime errors", () => {
    expect(evaluateRuntimeErrors([])).toEqual({ warnings: [], productBlocked: false });
  });

  it("dedupes repeated structural messages and still blocks", () => {
    const result = evaluateRuntimeErrors([elementTypeInvalid, elementTypeInvalid, elementTypeInvalid]);
    expect(result.productBlocked).toBe(true);
    expect(result.warnings).toHaveLength(1);
  });
});
