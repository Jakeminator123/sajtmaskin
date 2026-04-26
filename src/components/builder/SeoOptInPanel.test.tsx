/**
 * UI-tests for the SEO opt-in panel in the deploy ("Bygg") dialog.
 *
 * The panel is a controlled component, so most behavior is tested by
 * driving the `value` prop directly (mirrors how DeployNameDialog uses
 * it). Radix Switch's click flow relies on PointerEvent APIs that
 * jsdom doesn't fully implement, so we don't try to trigger the switch
 * via a synthetic click — it's well-tested by Radix upstream.
 *
 * Covers the PR-B contract:
 * - Default OFF; URL-input hidden
 * - optIn=true exposes URL-input
 * - Empty URL while opted in → invalid (parent's button should disable)
 * - Invalid URL string while opted in → invalid + visual error
 * - Valid https URL → valid + onChange contains entered value
 * - Persisted preferences seed parent state on mount
 * - projectId=null → no fetch
 * - optIn=false is always reported as valid
 */

import { fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { SeoOptInPanel, type SeoFormValue } from "./SeoOptInPanel";

function Harness({
  projectId = "proj_1",
  onChangeSpy,
  onValiditySpy,
  initial,
}: {
  projectId?: string | null;
  onChangeSpy?: (next: SeoFormValue) => void;
  onValiditySpy?: (valid: boolean) => void;
  initial?: SeoFormValue;
}) {
  const [value, setValue] = useState<SeoFormValue>(
    initial ?? { optIn: false, siteUrl: "" },
  );
  return (
    <SeoOptInPanel
      projectId={projectId}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChangeSpy?.(next);
      }}
      onValidityChange={onValiditySpy}
    />
  );
}

describe("SeoOptInPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Default fetch: empty preferences (no persisted seo).
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, preferences: {} }), {
        status: 200,
      }),
    ) as unknown as typeof fetch;
  });

  it("defaults to OFF with no URL input visible", () => {
    render(<Harness />);
    const sw = screen.getByRole("switch");
    expect(sw.getAttribute("data-state")).toBe("unchecked");
    expect(screen.queryByLabelText(/Sajtens URL/i)).toBeNull();
  });

  it("optIn=true reveals URL input and reports invalid when empty", () => {
    const onValidity = vi.fn<(valid: boolean) => void>();
    render(
      <Harness
        initial={{ optIn: true, siteUrl: "" }}
        onValiditySpy={onValidity}
      />,
    );
    expect(screen.getByLabelText(/Sajtens URL/i)).toBeTruthy();
    expect(onValidity).toHaveBeenLastCalledWith(false);
    expect(screen.getByText(/Ange URL för att aktivera SEO/i)).toBeTruthy();
  });

  it("rejects invalid URL strings with a visible error", () => {
    const onValidity = vi.fn<(valid: boolean) => void>();
    render(
      <Harness
        initial={{ optIn: true, siteUrl: "not a url" }}
        onValiditySpy={onValidity}
      />,
    );
    expect(onValidity).toHaveBeenLastCalledWith(false);
    expect(screen.getByText(/Ogiltig URL/i)).toBeTruthy();
  });

  it("rejects non-http(s) schemes like ftp://", () => {
    const onValidity = vi.fn<(valid: boolean) => void>();
    render(
      <Harness
        initial={{ optIn: true, siteUrl: "ftp://example.com" }}
        onValiditySpy={onValidity}
      />,
    );
    expect(onValidity).toHaveBeenLastCalledWith(false);
  });

  it("accepts a valid https URL and reports valid", () => {
    const onValidity = vi.fn<(valid: boolean) => void>();
    render(
      <Harness
        initial={{ optIn: true, siteUrl: "https://example.com" }}
        onValiditySpy={onValidity}
      />,
    );
    expect(onValidity).toHaveBeenLastCalledWith(true);
    expect(screen.queryByText(/Ogiltig URL/i)).toBeNull();
    expect(screen.queryByText(/Ange URL för att aktivera SEO/i)).toBeNull();
  });

  it("input edits propagate via onChange with the new value", () => {
    const onChange = vi.fn<(next: SeoFormValue) => void>();
    render(
      <Harness
        initial={{ optIn: true, siteUrl: "" }}
        onChangeSpy={onChange}
      />,
    );
    const input = screen.getByLabelText(/Sajtens URL/i);
    fireEvent.change(input, { target: { value: "https://example.com" } });
    expect(onChange).toHaveBeenLastCalledWith({
      optIn: true,
      siteUrl: "https://example.com",
    });
  });

  it("seeds parent state from persisted preferences on mount", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          preferences: {
            seo: {
              optIn: true,
              siteUrl: "https://persisted.example.com",
            },
          },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const onChange = vi.fn<(next: SeoFormValue) => void>();
    render(<Harness onChangeSpy={onChange} />);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        optIn: true,
        siteUrl: "https://persisted.example.com",
      });
    });
  });

  it("does not fetch preferences when projectId is null", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    render(<Harness projectId={null} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("OFF is always reported as valid, even with garbage in siteUrl", () => {
    const onValidity = vi.fn<(valid: boolean) => void>();
    render(
      <Harness
        onValiditySpy={onValidity}
        initial={{ optIn: false, siteUrl: "garbage" }}
      />,
    );
    expect(onValidity).toHaveBeenLastCalledWith(true);
  });
});
