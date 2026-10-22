import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BusinessFactsSection, TIME_OPTIONS, supportCopy, toInput } from "./BusinessFactsSection";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const SAVED = {
  hours: {
    mode: "regular",
    week: {
      mon: { closed: false, open: "09:00", close: "17:00" },
      tue: { closed: false, open: "09:00", close: "17:00" },
      wed: { closed: false, open: "09:00", close: "17:00" },
      thu: { closed: false, open: "09:00", close: "17:00" },
      fri: { closed: false, open: "09:00", close: "15:00" },
      sat: { closed: true },
      sun: { closed: true },
    },
  },
  contact: {
    phone: "08-123 45 67",
    email: "info@kund.se",
    orgNumber: "556677-8899",
    address: { street: "Storgatan 1", postalCode: "123 45", city: "Staden" },
  },
  lastSetAt: "2026-10-22T08:00:00.000Z",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("BusinessFactsSection", () => {
  it("loads the owner's facts and previews the hours as the site will show them", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      expect(input.toString()).toBe("/api/projects/proj_1/preferences");
      return json({ success: true, preferences: { business: SAVED } });
    }) as unknown as typeof fetch;

    render(<BusinessFactsSection projectId="proj_1" hasLiveVersion support="supported" />);

    await screen.findByText("Måndag–Torsdag 09:00–17:00");
    expect(screen.getByText("Fredag 09:00–15:00")).toBeTruthy();
    expect(screen.getByText("Lördag–Söndag Stängt")).toBeTruthy();
    expect((screen.getByLabelText("Telefon") as HTMLInputElement).value).toBe("08-123 45 67");
    expect((screen.getByLabelText("Typ av öppettider") as HTMLSelectElement).value).toBe("regular");
    // Nothing changed yet → nothing to save.
    expect((screen.getByRole("button", { name: /Spara uppgifter/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("saves the whole object; 24/7 sends no week and empty fields become null", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: input.toString(), init });
      if (init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as { business: typeof SAVED };
        return json({
          success: true,
          preferences: { business: { ...body.business, lastSetAt: "2026-10-22T09:00:00.000Z" } },
        });
      }
      return json({ success: true, preferences: { business: SAVED } });
    }) as unknown as typeof fetch;

    render(<BusinessFactsSection projectId="proj_1" hasLiveVersion support="supported" />);
    await screen.findByText("Måndag–Torsdag 09:00–17:00");

    fireEvent.change(screen.getByLabelText("Typ av öppettider"), { target: { value: "always_open" } });
    // The select option carries the same label; assert on the site preview.
    await waitFor(() => {
      expect(within(screen.getByTestId("hours-preview")).getByText("Öppet dygnet runt")).toBeTruthy();
    });
    expect(screen.queryByLabelText("Måndag öppnar")).toBeNull();

    fireEvent.change(screen.getByLabelText("Organisationsnummer"), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: /Spara uppgifter/ }));

    await waitFor(() => {
      expect(calls.some((call) => call.init?.method === "PATCH")).toBe(true);
    });
    const patch = calls.find((call) => call.init?.method === "PATCH");
    const body = JSON.parse(String(patch?.init?.body)) as {
      business: { hours: { mode: string; week: unknown }; contact: { orgNumber: null; phone: string } };
    };
    expect(body.business.hours).toEqual({ mode: "always_open", week: null });
    expect(body.business.contact.orgNumber).toBeNull();
    expect(body.business.contact.phone).toBe("08-123 45 67");
    expect(await screen.findByText(/Senast sparad/)).toBeTruthy();
  });

  it("toggles a weekday closed and hides its time selects", async () => {
    globalThis.fetch = vi.fn(async () =>
      json({ success: true, preferences: { business: SAVED } }),
    ) as unknown as typeof fetch;

    render(<BusinessFactsSection projectId="proj_1" hasLiveVersion={false} support="unknown" />);
    await screen.findByText("Måndag–Torsdag 09:00–17:00");

    expect(screen.getByLabelText("Fredag öppnar")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Fredag öppet"));
    await waitFor(() => {
      expect(screen.queryByLabelText("Fredag öppnar")).toBeNull();
    });
    expect(screen.getByText("Måndag–Torsdag 09:00–17:00")).toBeTruthy();
    expect(screen.getByText("Fredag–Söndag Stängt")).toBeTruthy();
  });

  it("never promises that republishing is enough when the live site lacks the module", async () => {
    globalThis.fetch = vi.fn(async () =>
      json({ success: true, preferences: { business: SAVED } }),
    ) as unknown as typeof fetch;

    render(<BusinessFactsSection projectId="proj_1" hasLiveVersion support="unsupported" />);
    await screen.findByText("Måndag–Torsdag 09:00–17:00");

    expect(screen.getByText(/byggd utan automatiska företagsuppgifter/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Uppdatera i byggaren/ }).getAttribute("href")).toBe(
      "/builder?project=proj_1",
    );
    expect(screen.queryByText(/Ingen ny generering behövs/)).toBeNull();
  });

  it("keeps toast and footer copy in one owner per support state", () => {
    expect(supportCopy("supported", true).toast).toMatch(/Publicera om/);
    expect(supportCopy("supported", true).needsBuilder).toBe(false);
    expect(supportCopy("unsupported", true).needsBuilder).toBe(true);
    expect(supportCopy("unsupported", true).toast).not.toMatch(/Publicera om sajten så syns/);
    expect(supportCopy("unknown", true).footer).toMatch(/nästa publicering/);
    // Imported repos never get the module, so no "republish afterwards" promise.
    expect(supportCopy("imported", true).footer).not.toMatch(/publicera om/);
    expect(supportCopy("imported", true).needsBuilder).toBe(true);
    // Before the first publish the support state is irrelevant.
    expect(supportCopy("unsupported", false)).toEqual(supportCopy("unknown", false));
  });

  it("offers only half-hour steps", () => {
    expect(TIME_OPTIONS).toHaveLength(48);
    expect(TIME_OPTIONS[0]).toBe("00:00");
    expect(TIME_OPTIONS[47]).toBe("23:30");
    expect(TIME_OPTIONS.every((time) => /^\d{2}:(00|30)$/.test(time))).toBe(true);
  });

  it("maps a partially filled address through so the server can name the missing field", () => {
    const input = toInput({
      mode: "unspecified",
      week: SAVED.hours.week as never,
      contact: { phone: "", email: "", orgNumber: "", street: "Storgatan 1", postalCode: "", city: "" },
    });
    expect(input.contact.address).toEqual({ street: "Storgatan 1", postalCode: "", city: "" });
    expect(input.contact.phone).toBeNull();
    expect(input.hours.week).toBeNull();
  });
});
