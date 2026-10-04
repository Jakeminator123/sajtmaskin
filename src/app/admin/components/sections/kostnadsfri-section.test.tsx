import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAdminResource } from "../../lib/use-admin-resource";
import type { KostnadsfriAdminPayload } from "../types";
import { KostnadsfriSection } from "./kostnadsfri-section";

vi.mock("../../lib/use-admin-resource", () => ({ useAdminResource: vi.fn() }));

const checkedAt = "2026-10-04T00:00:00.000Z";
function payload(): KostnadsfriAdminPayload {
  return {
    days: 90,
    configured: true,
    truncated: false,
    registry: { available: true, complete: true, checkedAt, returned: 2 },
    analytics: { available: true, complete: true, windowDays: 90, checkedAt },
    generationStatus: { available: true, checkedAt },
    mailStats: {
      available: true,
      total: 0,
      accepted: 0,
      delivered: 0,
      replied: 0,
      byVariant: [
        { variant: "text", total: 0, accepted: 0, firstAccepted: 0, delivered: 0, replied: 0 },
      ],
    },
    pages: ["Historik AB", "Nytt AB"].map((companyName, index) => ({
      slug: index ? "nytt-ab" : "historik-ab",
      companyName,
      industry: null,
      website: null,
      contactEmail: null,
      contactName: null,
      status: "active",
      createdAt: checkedAt,
      expiresAt: null,
      consumedAt: null,
      sentAt: checkedAt,
      source: "render-mail-flow:text",
      mailType: "text",
      generation: { state: "succeeded", completedAt: checkedAt, siteId: `site_${index}` },
    })),
    stats: [
      {
        slug: "nytt-ab",
        visits: 1,
        uniqueVisitors: 1,
        verified: 1,
        started: 1,
        firstSeen: checkedAt,
        lastSeen: checkedAt,
      },
    ],
    recent: [],
  };
}

let data: KostnadsfriAdminPayload;
beforeEach(() => {
  data = payload();
  vi.mocked(useAdminResource).mockImplementation(() => ({
    data,
    loading: false,
    error: null,
    status: 200,
    reload: vi.fn(),
  }));
});
afterEach(cleanup);

describe("KostnadsfriSection data-quality regressions", () => {
  it("does not present historical generations as a ratio of mail-event companies", () => {
    render(<KostnadsfriSection />);
    expect(screen.queryAllByText("av 0 accepterade första mejl")).toHaveLength(0);
    expect(
      screen.getByText(/Genereringarna gäller visat företagsregister, inklusive historik/),
    ).toBeTruthy();
  });

  it.each([
    "Unika > 0",
    "Rätt lösenord > 0",
    "Rätt lösenord = 0",
    "Formulär klara > 0",
    "Formulär klara = 0",
  ])("disables and ignores %s during an analytics outage, then restores it", (filter) => {
    const { rerender } = render(<KostnadsfriSection />);
    fireEvent.click(screen.getByRole("button", { name: filter }));
    const before = within(screen.getAllByRole("table")[0]).getAllByRole("row").length;
    expect(before).toBe(2); // Header plus exactly one matching company.
    data = {
      ...data,
      analytics: { ...data.analytics, available: false, complete: false },
      stats: [],
    };
    rerender(<KostnadsfriSection />);
    expect((screen.getByRole("button", { name: filter }) as HTMLButtonElement).disabled).toBe(true);
    const table = within(screen.getAllByRole("table")[0]);
    expect(table.getByText("Historik AB")).toBeTruthy();
    expect(table.getByText("Nytt AB")).toBeTruthy();
    expect(screen.getByText(/Besöksfilter är avstängda/)).toBeTruthy();
    data = payload();
    rerender(<KostnadsfriSection />);
    expect((screen.getByRole("button", { name: filter }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect(within(screen.getAllByRole("table")[0]).getAllByRole("row")).toHaveLength(before);
  });
});
