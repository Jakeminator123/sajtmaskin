import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyFollowUp, createInitialVersion } from "../_lib/mock-data";
import type { Studio } from "../_lib/use-studio";
import { BuilderLab } from "./builder-lab";

// JSDOM verifierar vyernas montering och beteende, utan överlappande exit-animationer.
vi.mock("framer-motion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("framer-motion")>()),
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/lib/hooks/use-media-query", () => ({
  LG_UP_MEDIA_QUERY: "(min-width: 1024px)",
  useMediaQuery: () => true,
}));

vi.mock("./launch-stage", () => ({
  LaunchStage: ({ studio }: { studio: Studio }) => (
    <button
      onClick={() => {
        const first = createInitialVersion("Ett kafé som heter Kaffekoppen", "auto");
        const second = applyFollowUp(first, "Ny rubrik", null, 2);
        studio.set({
          versions: [first, second],
          activeVersionId: second.id,
          messages: [{ id: "seed", role: "user", text: "Ett kafé", target: null }],
        });
      }}
    >
      Starta testprojekt
    </button>
  ),
}));

afterEach(() => vi.restoreAllMocks());

function start() {
  const view = render(<BuilderLab />);
  fireEvent.click(screen.getByRole("button", { name: "Starta testprojekt" }));
  return view;
}

describe("builder-lab interaktionsregressioner", () => {
  it("behåller samma chattutkast mellan panel, kub och fokus och tömmer det efter skickat", async () => {
    start();
    fireEvent.change(screen.getByRole("textbox", { name: "Beskriv en ändring" }), {
      target: { value: "Lägg till dagens meny" },
    });

    for (const mode of ["Kub", "Fokus", "Panel"]) {
      fireEvent.click(screen.getByRole("radio", { name: mode, exact: true }));
      await waitFor(() => {
        const inputs = screen.getAllByRole<HTMLTextAreaElement>("textbox", {
          name: "Beskriv en ändring",
        });
        expect(inputs).toHaveLength(1);
        expect(inputs[0].value).toBe("Lägg till dagens meny");
      });
    }

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Beskriv en ändring" }), {
      key: "Enter",
    });
    expect(
      screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Beskriv en ändring" }).value,
    ).toBe("");
    expect(screen.getByText("Lägg till dagens meny")).toBeTruthy();
  });

  it("återför fokus till sektionen när Esc stänger redigeraren och avslutar inspektion först vid nästa Esc", async () => {
    start();
    fireEvent.keyDown(window, { key: "e" });
    const section = screen.getByRole("button", { name: "Ändra startbild", exact: true });
    act(() => section.focus());
    fireEvent.keyDown(section, { key: "Enter" });
    const input = await screen.findByRole("textbox", { name: "Ändring för Startbild" });
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("textbox", { name: "Ändring för Startbild" })).toBeNull();
    expect(document.activeElement).toBe(section);
    expect(screen.getByRole("button", { name: "Ändra startbild", exact: true })).toBe(section);
    fireEvent.keyDown(section, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Ändra startbild", exact: true })).toBeNull();
  });

  it("förankrar jämförelselinjen i enhetsramen och använder bildytans bredd", async () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(370);
    start();
    fireEvent.keyDown(window, { key: "3" });
    fireEvent.click(screen.getByRole("button", { name: "Jämför", exact: true }));
    const slider = screen.getByRole("slider", { name: "Jämför versioner" });
    const track = slider.parentElement!;
    const deviceFrame = track.parentElement!;
    expect(track.style.width).toBe("370px");
    expect(deviceFrame.contains(document.querySelector("[data-theme-key]"))).toBe(true);
    expect(deviceFrame.className).toContain("border-[10px]");
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(slider.getAttribute("aria-valuenow")).toBe("54");
    expect(deviceFrame.style.getPropertyValue("--lab-split")).toBe("54%");
    expect(document.documentElement.style.getPropertyValue("--lab-split")).toBe("");
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(deviceFrame.style.getPropertyValue("--lab-split")).toBe(""));
  });
});
