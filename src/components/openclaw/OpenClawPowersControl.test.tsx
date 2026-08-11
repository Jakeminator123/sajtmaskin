import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OpenClawPowersControl } from "./OpenClawPowersControl";
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";

function stubHealth(payload: { editEnabled?: boolean } | "reject") {
  const impl =
    payload === "reject"
      ? vi.fn(async () => {
          throw new Error("offline");
        })
      : vi.fn(async () => ({
          ok: true,
          json: async () => payload,
        }));
  vi.stubGlobal("fetch", impl);
  return impl;
}

beforeEach(() => {
  // Pressing the shield re-validates the env gate; default answer keeps it on.
  stubHealth({ editEnabled: true });
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

afterEach(() => {
  vi.unstubAllGlobals();
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

  // The mount-time health check is the panel's only other read and the panel
  // stays mounted for the whole session — pressing ON is the moment authority
  // is granted, so the env gate is re-checked right there.
  it("withdraws the grant when the press-time health check says OC_EDIT is off", async () => {
    const fetchMock = stubHealth({ editEnabled: false });
    act(() => {
      useOpenClawStore.setState({ editEnabled: true, grantedPowers: ["armed_autonomy"] });
    });
    const { container } = render(<OpenClawPowersControl />);

    fireEvent.click(screen.getByRole("button", { name: "Slå på extra befogenheter" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/openclaw/health");
    await waitFor(() => {
      expect(useOpenClawStore.getState().editEnabled).toBe(false);
    });
    // Withdrawal clears the whole grant and unmounts the control.
    expect(useOpenClawStore.getState().powersOn).toBe(false);
    expect(useOpenClawStore.getState().grantedPowers).toEqual([]);
    expect(container.firstChild).toBeNull();
  });

  // A network blip proves nothing — it must not kill a legitimately enabled
  // control for the rest of the session. Only a definitive false revokes.
  it("keeps the grant when the press-time health check fails transiently", async () => {
    const fetchMock = stubHealth("reject");
    act(() => {
      useOpenClawStore.setState({ editEnabled: true });
    });
    render(<OpenClawPowersControl />);

    fireEvent.click(screen.getByRole("button", { name: "Slå på extra befogenheter" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/openclaw/health");
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(useOpenClawStore.getState().editEnabled).toBe(true);
    expect(useOpenClawStore.getState().powersOn).toBe(true);
  });
});
