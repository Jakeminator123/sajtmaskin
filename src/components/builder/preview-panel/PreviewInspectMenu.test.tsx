import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PreviewInspectMenu, PreviewInspectRegionMenu } from "./PreviewInspectMenu";
import type { InspectElementActions } from "@/lib/builder/inspect-element-actions";

const bounds = { width: 900, height: 600 };

function actions(overrides: Partial<InspectElementActions> = {}): InspectElementActions {
  return {
    editText: {
      available: true,
      target: {
        filePath: "app/page.tsx",
        lineNumber: 4,
        find: "Hej",
        occurrence: 1,
        current: "Hej",
      },
    },
    replaceImage: { available: false, reason: "Det här elementet är ingen bild." },
    deleteElement: {
      available: true,
      target: { filePath: "app/page.tsx", lineNumber: 4, tagName: "h1" },
    },
    ...overrides,
  };
}

function renderMenu(props: Partial<Parameters<typeof PreviewInspectMenu>[0]> = {}) {
  const handlers = {
    onEditText: vi.fn(),
    onReplaceImage: vi.fn(),
    onDeleteElement: vi.fn(),
    onSendPointToChat: vi.fn(),
    onShowInCode: vi.fn(),
    onClose: vi.fn(),
  };
  render(
    <PreviewInspectMenu
      point={{ x: 120, y: 80 }}
      bounds={bounds}
      tag="h1"
      actions={actions()}
      busy={false}
      canShowInCode
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe("PreviewInspectMenu", () => {
  it("gråar ut omöjliga åtgärder med orsaken synlig i stället för att dölja dem", () => {
    renderMenu();

    const image = screen.getByRole("menuitem", { name: /Byt bild/ });
    expect((image as HTMLButtonElement).disabled).toBe(true);
    expect(image.textContent).toContain("Det här elementet är ingen bild.");
    expect((screen.getByRole("menuitem", { name: /Ändra texten/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("behåller 'Skicka punkt till chatten' som menyval även när inget annat går", () => {
    const handlers = renderMenu({
      canShowInCode: false,
      actions: actions({
        editText: { available: false, reason: "Texten hämtas från en annan del av koden." },
        deleteElement: { available: false, reason: "Vi hittade inte elementet i sidans kod." },
      }),
    });

    const sendPoint = screen.getByRole("menuitem", { name: /Skicka punkt till chatten/ });
    expect((sendPoint as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(sendPoint);
    expect(handlers.onSendPointToChat).toHaveBeenCalledTimes(1);

    expect((screen.getByRole("menuitem", { name: /Visa i koden/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("visar ingen åtgärd för att ta en bild av ytan efter en rektangelmarkering", () => {
    render(
      <PreviewInspectRegionMenu
        point={{ x: 200, y: 200 }}
        bounds={bounds}
        labels={["h1 — Rubrik", "p — Brödtext"]}
        onSendToChat={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("2 element markerade")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /bild av ytan/i })).toBeNull();
  });
});
