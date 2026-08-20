import { describe, expect, it } from "vitest";
import type { BuildSpec } from "@/lib/gen/build-spec";
import { renderF2ContractBlock } from "@/lib/gen/system-prompt/sections/session-contracts";
import { evaluateProductDomSnapshot, type ProductDomEvaluation } from "./product-postcheck";

function codes(evaluation: ProductDomEvaluation): string[] {
  return evaluation.warnings.map((warning) => warning.code).sort();
}

function formWithoutAction(demoOnly: boolean) {
  return evaluateProductDomSnapshot(
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
          demoOnly,
          text: "Kontakta oss",
        },
      ],
    },
    { status: "not_applicable" },
  );
}

describe("SM-060 fake_form in designläge", () => {
  it("ber generatorn i F2 att märka demoformulär med data-demo-only", () => {
    const f2 = { previewPolicy: "fidelity2" } as BuildSpec;
    const block = renderF2ContractBlock(f2).join("\n");

    expect(block).toContain("data-demo-only");
    expect(block).toMatch(/<form>/);
  });

  it("ber inte F3 att märka formulär som demo", () => {
    const f3 = { previewPolicy: "fidelity3" } as BuildSpec;
    expect(renderF2ContractBlock(f3).join("\n")).not.toContain("data-demo-only");
  });

  it("spärrar inte ett F2-demoformulär som snapshoten redan markerat", () => {
    const evaluation = formWithoutAction(true);

    expect(codes(evaluation)).not.toContain("fake_form");
    expect(evaluation.productBlocked).toBe(false);
  });

  it("flaggar fortfarande ett omärkt formulär utan action", () => {
    const evaluation = formWithoutAction(false);

    expect(codes(evaluation)).toEqual(["fake_form"]);
    expect(evaluation.productBlocked).toBe(false);
  });
});
