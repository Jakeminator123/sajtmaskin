import { fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Relocatable, RelocationOutlet, useRelocationSlot } from "./relocation";

const lifecycle = { mounts: 0, unmounts: 0 };

/** Stands in for the composer: local state that a remount would lose. */
function Draft() {
  const [text, setText] = useState("");
  const [sent, setSent] = useState(0);
  useEffect(() => {
    lifecycle.mounts += 1;
    return () => {
      lifecycle.unmounts += 1;
    };
  }, []);
  return (
    <div data-testid="draft">
      <textarea aria-label="Utkast" value={text} onChange={(event) => setText(event.target.value)} />
      <button type="button" onClick={() => setSent((count) => count + 1)}>
        Skicka
      </button>
      <output>{sent}</output>
    </div>
  );
}

function Harness({ elsewhere, showContent = true }: { elsewhere: boolean; showContent?: boolean }) {
  const slot = useRelocationSlot();
  return (
    <>
      <section aria-label="Panel">
        {showContent ? (
          <Relocatable slot={slot}>
            <Draft />
          </Relocatable>
        ) : null}
      </section>
      {elsewhere ? (
        <section aria-label="Kub">
          <RelocationOutlet slot={slot} className="outlet" />
        </section>
      ) : null}
    </>
  );
}

const panel = () => screen.getByRole("region", { name: "Panel" });
const cube = () => screen.getByRole("region", { name: "Kub" });

describe("Relocatable", () => {
  it("shows the content at home until an outlet is mounted", () => {
    render(<Harness elsewhere={false} />);
    expect(panel().contains(screen.getByTestId("draft"))).toBe(true);
  });

  it("moves the same instance to the outlet and back without remounting it", () => {
    lifecycle.mounts = 0;
    lifecycle.unmounts = 0;
    const { rerender } = render(<Harness elsewhere={false} />);
    const node = screen.getByTestId("draft");
    fireEvent.change(screen.getByLabelText("Utkast"), { target: { value: "Gör rubriken större" } });

    rerender(<Harness elsewhere />);
    expect(cube().contains(node)).toBe(true);
    expect(panel().contains(node)).toBe(false);
    expect(screen.getByTestId("draft")).toBe(node);
    expect((screen.getByLabelText("Utkast") as HTMLTextAreaElement).value).toBe("Gör rubriken större");

    rerender(<Harness elsewhere={false} />);
    expect(panel().contains(node)).toBe(true);
    expect((screen.getByLabelText("Utkast") as HTMLTextAreaElement).value).toBe("Gör rubriken större");
    expect(lifecycle).toEqual({ mounts: 1, unmounts: 0 });
  });

  it("keeps updates and handlers working while the content is in the outlet", () => {
    render(<Harness elsewhere />);
    expect(cube().contains(screen.getByTestId("draft"))).toBe(true);

    fireEvent.change(screen.getByLabelText("Utkast"), { target: { value: "Hej" } });
    fireEvent.click(screen.getByRole("button", { name: "Skicka" }));
    fireEvent.click(screen.getByRole("button", { name: "Skicka" }));

    expect((screen.getByLabelText("Utkast") as HTMLTextAreaElement).value).toBe("Hej");
    expect(screen.getByRole("status").textContent).toBe("2");
    expect(cube().contains(screen.getByRole("status"))).toBe(true);
  });

  it("takes its node along when it is unmounted while in the outlet", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { rerender, unmount } = render(<Harness elsewhere />);
      const outlet = cube().querySelector("[data-relocation-outlet]") as HTMLElement;
      expect(outlet.childElementCount).toBe(1);

      rerender(<Harness elsewhere showContent={false} />);
      expect(outlet.childElementCount).toBe(0);
      expect(screen.queryByTestId("draft")).toBeNull();

      rerender(<Harness elsewhere />);
      expect(cube().contains(screen.getByTestId("draft"))).toBe(true);
      unmount();
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });

  describe("scroll position", () => {
    function Scrolled({ elsewhere }: { elsewhere: boolean }) {
      const slot = useRelocationSlot();
      return (
        <>
          <Relocatable slot={slot}>
            <div data-testid="reading" />
            <div data-testid="following" />
          </Relocatable>
          {elsewhere ? <RelocationOutlet slot={slot} /> : null}
        </>
      );
    }

    // jsdom has no layout: a list gets its scroll position by hand. A real
    // browser resets `scrollTop` when the node moves, which is what `lose()`
    // stands in for; the code has to write the position back.
    function fakeScroll(testId: string, state: { top: number; height: number; client: number }) {
      const element = screen.getByTestId(testId);
      let top = state.top;
      const written = vi.fn((value: number) => {
        top = value;
      });
      Object.defineProperty(element, "scrollTop", { configurable: true, get: () => top, set: written });
      Object.defineProperty(element, "scrollHeight", { configurable: true, get: () => state.height });
      Object.defineProperty(element, "clientHeight", { configurable: true, get: () => state.client });
      return {
        written,
        lose: () => {
          top = 0;
        },
      };
    }

    it("puts a scrolled list back where it stood after the move", () => {
      const { rerender } = render(<Scrolled elsewhere={false} />);
      const reading = fakeScroll("reading", { top: 120, height: 900, client: 300 });
      const following = fakeScroll("following", { top: 600, height: 900, client: 300 });

      rerender(<Scrolled elsewhere />);
      // Mid-history stays at the same offset; a list at its end follows the end.
      expect(reading.written).toHaveBeenLastCalledWith(120);
      expect(following.written).toHaveBeenLastCalledWith(900);
    });

    it("keeps the last known position when it leaves a surface that cannot be read", () => {
      const { rerender } = render(<Scrolled elsewhere={false} />);
      const reading = fakeScroll("reading", { top: 120, height: 900, client: 300 });

      rerender(<Scrolled elsewhere />);
      expect(reading.written).toHaveBeenLastCalledWith(120);

      // The outlet is a cube face that is not in front: nothing is laid out
      // there, so the list answers 0 wherever the reader stood.
      const outlet = document.querySelector("[data-relocation-outlet]") as HTMLElement;
      outlet.checkVisibility = () => false;
      reading.lose();
      reading.written.mockClear();

      rerender(<Scrolled elsewhere={false} />);
      // Home again at the place it had, not at its first row.
      expect(reading.written).toHaveBeenLastCalledWith(120);
    });

    it("reads the position afresh from a surface that is laid out", () => {
      const { rerender } = render(<Scrolled elsewhere={false} />);
      const reading = fakeScroll("reading", { top: 120, height: 900, client: 300 });

      rerender(<Scrolled elsewhere />);
      // The reader scrolls on while the list is in the outlet.
      reading.written(480);
      reading.written.mockClear();

      rerender(<Scrolled elsewhere={false} />);
      expect(reading.written).toHaveBeenLastCalledWith(480);
    });
  });
});
