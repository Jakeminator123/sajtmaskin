import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SeoOptInPanel } from "./SeoOptInPanel";

describe("SeoOptInPanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("toggles SEO without accepting an arbitrary URL", async () => {
    const onChange = vi.fn();
    render(
      <SeoOptInPanel
        projectId={null}
        value={{ optIn: false, siteUrl: "" }}
        onChange={onChange}
      />,
    );

    expect(screen.queryByLabelText(/Reservadress/i)).toBeNull();
    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({ optIn: true, siteUrl: "" });
    });
    expect(screen.getByText(/verifierade domän/i)).toBeTruthy();
  });

  it("hydrates only the persisted opt-in state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ preferences: { seo: { optIn: true, siteUrl: "https://legacy.example" } } }),
      ),
    );
    const onChange = vi.fn();
    render(
      <SeoOptInPanel
        projectId="project_1"
        value={{ optIn: false, siteUrl: "" }}
        onChange={onChange}
      />,
    );

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        optIn: true,
        siteUrl: "https://legacy.example",
      });
    });
  });

  it("allows canonical-only SEO but validates a supplied fallback URL", async () => {
    const onValidityChange = vi.fn();
    const { rerender } = render(
      <SeoOptInPanel
        projectId={null}
        value={{ optIn: true, siteUrl: "" }}
        onChange={vi.fn()}
        onValidityChange={onValidityChange}
      />,
    );
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(true));

    rerender(
      <SeoOptInPanel
        projectId={null}
        value={{ optIn: true, siteUrl: "http://unsafe.example" }}
        onChange={vi.fn()}
        onValidityChange={onValidityChange}
      />,
    );
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(false));
    expect(screen.getByText(/fullständig https-adress/i)).toBeTruthy();
  });

  it("marks only user interaction dirty, not preference hydration", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ preferences: { seo: { optIn: true, siteUrl: "https://saved.example" } } }),
      ),
    );
    const onDirtyChange = vi.fn();
    const onChange = vi.fn();
    const { rerender } = render(
      <SeoOptInPanel
        projectId="project_1"
        value={{ optIn: false, siteUrl: "" }}
        onChange={onChange}
        onDirtyChange={onDirtyChange}
      />,
    );
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onDirtyChange).not.toHaveBeenCalled();

    rerender(
      <SeoOptInPanel
        projectId="project_1"
        value={{ optIn: true, siteUrl: "https://saved.example" }}
        onChange={onChange}
        onDirtyChange={onDirtyChange}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Reservadress/i), {
      target: { value: "https://new.example" },
    });
    expect(onDirtyChange).toHaveBeenCalledWith(true);
    expect(onChange).toHaveBeenLastCalledWith({
      optIn: true,
      siteUrl: "https://new.example",
    });
  });

  it("surfaces preference-load failures without changing form state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const onChange = vi.fn();
    render(
      <SeoOptInPanel
        projectId="project_1"
        value={{ optIn: false, siteUrl: "" }}
        onChange={onChange}
      />,
    );
    expect(await screen.findByText(/Kunde inte läsa SEO-inställningar/i)).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });
});
