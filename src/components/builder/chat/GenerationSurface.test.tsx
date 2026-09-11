import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { toAIElementsFormat } from "@/lib/builder/message-adapter";
import type { UiMessagePart } from "@/lib/builder/types";
import type { ToolPart } from "./tooling/types";
import { GenerationSurface } from "./GenerationSurface";
import { hasGenerationWarnings, isGenerationReviewPart } from "./generation-surface-state";

vi.mock("streamdown", () => ({
  Streamdown: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

const code = '```tsx file="app/page.tsx"\nconst CODE_BODY = 1;\n```';
const base = { content: "", isStreaming: true, isActive: true, items: [], toolParts: [] };

function toolPart(part: UiMessagePart): ToolPart {
  return toAIElementsFormat({
    id: "assistant",
    role: "assistant",
    content: "",
    uiParts: [part],
  }).parts.find((entry): entry is ToolPart => entry.type === "tool")!;
}

describe("GenerationSurface", () => {
  it("keeps the same card and the user's detail choice through text, files, done and postchecks", () => {
    const { rerender } = render(<GenerationSurface {...base} />);
    const surface = screen.getByTestId("generation-surface");
    expect(screen.getByText("Förbereder underlaget…")).toBeTruthy();

    rerender(
      <GenerationSurface
        {...base}
        content="Jag bygger startsidan."
        reasoning="Ett ljust uttryck."
      />,
    );
    expect(screen.getByTestId("generation-surface")).toBe(surface);
    expect(screen.queryByText("Ett ljust uttryck.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Visa detaljer" }));
    expect(screen.getByText("Ett ljust uttryck.")).toBeTruthy();

    rerender(<GenerationSurface {...base} content={code} reasoning="Ett ljust uttryck." />);
    expect(screen.getByTestId("generation-surface")).toBe(surface);
    expect(
      screen.getByRole("button", { name: "Dölj detaljer" }).getAttribute("aria-expanded"),
    ).toBe("true");
    expect(screen.getByText("1 fil")).toBeTruthy();
    expect(screen.queryByText(/CODE_BODY/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Dölj detaljer" }));
    rerender(<GenerationSurface {...base} content={code} isStreaming={false} isActive={false} />);
    rerender(
      <GenerationSurface
        {...base}
        content={code}
        isStreaming={false}
        activeLabel="Kontrollerar förhandsvisningen…"
      />,
    );
    expect(screen.getByTestId("generation-surface")).toBe(surface);
    expect(
      screen.getByRole("button", { name: "Visa detaljer" }).getAttribute("aria-expanded"),
    ).toBe("false");
    expect(surface.getAttribute("data-active")).toBe("true");
    expect(screen.queryByText("Klart")).toBeNull();

    rerender(<GenerationSurface {...base} content={code} isStreaming={false} isActive={false} />);
    expect(surface.getAttribute("data-active")).toBe("false");
    expect(
      screen.getByRole("button", { name: "Visa detaljer" }).getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("keeps review panels and reasoning in one drawer while approvals stay visible", () => {
    render(
      <GenerationSurface
        {...base}
        reasoning="Modellens överväganden."
        reviews={<div>Kontrollpanel</div>}
        actions={<button>Godkänn förslag</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Godkänn förslag" })).toBeTruthy();
    expect(screen.queryByText("Kontrollpanel")).toBeNull();
    expect(screen.queryByText("Modellens överväganden.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Visa detaljer" }));
    const surface = screen.getByTestId("generation-surface");
    expect(within(surface).getByText("Kontrollpanel")).toBeTruthy();
    expect(within(surface).getByText("Modellens överväganden.")).toBeTruthy();
  });

  it("shows a warning outside the closed drawer for an advisory gate", () => {
    const gate = toolPart({
      type: "tool-quality-gate",
      state: "output-available",
      output: {
        passed: true,
        designAdvisory: true,
        checks: [
          { check: "typecheck", passed: false, advisory: true, exitCode: 1, output: "TS2322" },
        ],
      },
    });
    render(
      <GenerationSurface
        {...base}
        content={code}
        isStreaming={false}
        isActive={false}
        toolParts={[gate]}
        reviews={<div>Typvarningen i detalj</div>}
      />,
    );
    expect(screen.getByText("Kontroller att se över")).toBeTruthy();
    expect(screen.getByTestId("generation-surface").getAttribute("data-attention")).toBe("true");
    expect(screen.queryByText("Typvarningen i detalj")).toBeNull();
  });

  it("shows the final prose once and only reveals raw code on request", () => {
    render(
      <GenerationSurface
        {...base}
        content={`Startsidan har fått en ny meny.\n${code}\n${code}`}
        isStreaming={false}
        isActive={false}
      />,
    );
    expect(screen.getAllByText("Startsidan har fått en ny meny.")).toHaveLength(1);
    expect(screen.getByText("1 fil")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Visa detaljer" }));
    expect(screen.queryByText(/CODE_BODY/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Visa råtext" }));
    expect(screen.getByText(/CODE_BODY/)).toBeTruthy();
  });

  it("stops activity while a user answer is required", () => {
    render(<GenerationSurface {...base} awaitingReply />);
    expect(screen.getByText("Ditt svar behövs")).toBeTruthy();
    expect(screen.getByTestId("generation-surface").getAttribute("data-active")).toBe("false");
  });
});

describe("generation review presentation", () => {
  it("accepts both event spellings without hiding a requested approval", () => {
    for (const type of [
      "tool-quality-gate",
      "tool:quality-gate",
      "tool-post-check",
      "tool:live-review",
    ]) {
      expect(isGenerationReviewPart(toolPart({ type, state: "output-available" }))).toBe(true);
      expect(isGenerationReviewPart(toolPart({ type, state: "approval-requested" }))).toBe(false);
    }
    expect(
      isGenerationReviewPart(
        toolPart({ type: "tool:integration-suggestion", state: "input-available" }),
      ),
    ).toBe(false);
  });

  it("preserves failures and postcheck warnings without treating skipped checks as failures", () => {
    expect(
      hasGenerationWarnings([toolPart({ type: "tool:engine-preview", state: "output-error" })]),
    ).toBe(true);
    expect(
      hasGenerationWarnings([
        toolPart({
          type: "tool-post-check",
          state: "output-available",
          output: { warnings: ["Bild saknas"] },
        }),
      ]),
    ).toBe(true);
    expect(
      hasGenerationWarnings([
        toolPart({
          type: "tool-quality-gate",
          state: "output-available",
          output: { passed: false, skipped: true, checks: [] },
        }),
      ]),
    ).toBe(false);
    expect(
      hasGenerationWarnings([toolPart({ type: "tool-quality-gate", state: "input-streaming" })]),
    ).toBe(false);
  });
});
