import { describe, expect, it } from "vitest";
import { buildAutoFixPrompt } from "./helpers-autofix-prompt";

describe("buildAutoFixPrompt — product postcheck findings", () => {
  it("renderar DOM-fynden med selector/text och beter-dig-rätt-instruktion", () => {
    const prompt = buildAutoFixPrompt({
      chatId: "chat_1",
      versionId: "ver_1",
      reasons: ["Product Postcheck hittade 2 blockerande produktfynd på den körande sajten"],
      repair: {
        productFindings: [
          {
            code: "cta_no_handler",
            message: "CTA-knapp saknar tydlig handling.",
            selector: "button",
            text: "09:00",
          },
          {
            code: "mobile_menu_failed",
            message:
              "Mobilmeny kunde inte verifieras: hamburger_button_did_not_change_dom_or_aria",
          },
        ],
      },
    });

    expect(prompt).toContain("Product Postcheck findings (observed on the RUNNING site, blocking):");
    expect(prompt).toContain(
      '- cta_no_handler: CTA-knapp saknar tydlig handling. (selector: button, text: "09:00")',
    );
    expect(prompt).toContain("- mobile_menu_failed: Mobilmeny kunde inte verifieras");
    // Fixaren ska koppla riktiga handlers — aldrig "fixa" genom att ta bort element.
    expect(prompt).toContain("instead of removing the elements");
    expect(prompt).toContain(
      "Issues detected: Product Postcheck hittade 2 blockerande produktfynd på den körande sajten.",
    );
  });

  it("utelämnar blocket helt utan fynd", () => {
    const prompt = buildAutoFixPrompt({
      chatId: "chat_1",
      versionId: "ver_1",
      reasons: ["typecheck failed"],
      repair: {},
    });
    expect(prompt).not.toContain("Product Postcheck findings");
  });
});
