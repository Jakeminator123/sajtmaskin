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

  // Ägarbeslut Ö10b (2026-07-26) sköt bild-av-ytan och ett test låste fast att
  // knappen inte fanns. Beslutet är omvänt: ägaren beställde funktionen
  // uttryckligen 2026-08-01, så testerna nedan låser fast den i stället.
  it("erbjuder bild av ytan när bildfångst är tillgänglig", () => {
    const onSendImageToChat = vi.fn();
    render(
      <PreviewInspectRegionMenu
        point={{ x: 200, y: 200 }}
        bounds={bounds}
        labels={["h1 — Rubrik", "p — Brödtext"]}
        onSendToChat={vi.fn()}
        onSendImageToChat={onSendImageToChat}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("2 element markerade")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /bild av ytan/i }));
    expect(onSendImageToChat).toHaveBeenCalledTimes(1);
  });

  it("döljer bildåtgärden när inspektorn inte kan ta bilder", () => {
    // Utan inspektor-backend finns ingen bild att hämta, och en knapp som
    // alltid failar är sämre än ingen knapp.
    render(
      <PreviewInspectRegionMenu
        point={{ x: 200, y: 200 }}
        bounds={bounds}
        labels={["h1 — Rubrik"]}
        onSendToChat={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /bild av ytan/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Skicka elementen/ })).toBeTruthy();
  });

  it("spärrar bildknappen medan bilden tas, så en dubbelklickning inte ger två fångster", () => {
    const onSendImageToChat = vi.fn();
    render(
      <PreviewInspectRegionMenu
        point={{ x: 200, y: 200 }}
        bounds={bounds}
        labels={["h1 — Rubrik"]}
        onSendToChat={vi.fn()}
        onSendImageToChat={onSendImageToChat}
        imagePending
        onClose={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: /Tar bild/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onSendImageToChat).not.toHaveBeenCalled();
  });
});
