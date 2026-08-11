import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { OpenClawPowersControl } from "./OpenClawPowersControl";
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";

beforeEach(() => {
  act(() => {
    useOpenClawStore.setState({
      editEnabled: false,
      powersOn: false,
      grantedPowers: [],
      armedMandate: null,
      armedContinuation: null,
      preparedFill: null,
    });
  });
});

describe("OpenClawPowersControl", () => {
  // A deployment without OC_EDIT has nothing to grant, so a visible switch
  // would promise something the env forbids.
  it("renders nothing when OC_EDIT is off", () => {
    act(() => {
      useOpenClawStore.setState({ editEnabled: true });
    });
    const { container, rerender } = render(<OpenClawPowersControl />);
    expect(container.firstChild).not.toBeNull();

    act(() => {
      useOpenClawStore.setState({ editEnabled: false });
    });
    rerender(<OpenClawPowersControl />);
    expect(container.firstChild).toBeNull();
  });

  it("starts unpressed and toggles the master switch on click", () => {
    act(() => {
      useOpenClawStore.setState({ editEnabled: true });
    });
    render(<OpenClawPowersControl />);

    const toggle = screen.getByRole("button", { name: "Slå på extra befogenheter" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(toggle);

    expect(useOpenClawStore.getState().powersOn).toBe(true);
    expect(
      screen.getByRole("button", { name: "Stäng av extra befogenheter" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  // Pressing the button alone must not grant anything — the menu selection is
  // the second half of the gate.
  it("grants nothing on press alone", () => {
    act(() => {
      useOpenClawStore.setState({ editEnabled: true });
    });
    render(<OpenClawPowersControl />);

    fireEvent.click(screen.getByRole("button", { name: "Slå på extra befogenheter" }));

    expect(useOpenClawStore.getState().grantedPowers).toEqual([]);
  });
});
