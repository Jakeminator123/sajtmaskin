import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ByodDomainFlow } from "./ByodDomainFlow";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const READY_SNAPSHOT = {
  primary: {
    domain: "exempel.se",
    role: "primary",
    connection: "connected",
    ownership: "verified",
    dns: "valid",
    https: "valid",
    status: "live",
    statusLabel: "Live",
    records: [
      { type: "A", host: "exempel.se", value: "192.0.2.77", purpose: "configuration" },
    ],
  },
  companion: {
    domain: "www.exempel.se",
    role: "redirect",
    connection: "connected",
    ownership: "verified",
    dns: "valid",
    https: "valid",
    status: "connected",
    statusLabel: "Ansluten",
    records: [
      { type: "CNAME", host: "www.exempel.se", value: "proj.vercel-dns-017.com", purpose: "configuration" },
    ],
  },
  liveDomain: "exempel.se",
  candidateDomain: null,
  canActivate: false,
  canUnlink: true,
  redirectArmed: true,
  publishedSlug: "kund",
  slugLocked: true,
  automaticDns: null,
  message: null,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ByodDomainFlow", () => {
  it("loads project-owned status and never calls availability or purchase", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      expect(input.toString()).toContain("/api/projects/proj_1/domain");
      return json({ success: true, snapshot: READY_SNAPSHOT });
    }) as unknown as typeof fetch;

    render(
      <ByodDomainFlow
        projectId="proj_1"
        chatId="chat_1"
        publishedSlug="kund"
        initialDomain="exempel.se"
      />,
    );

    expect(await screen.findByText("Live")).toBeTruthy();
    expect(screen.getByText("192.0.2.77")).toBeTruthy();
    expect(screen.getAllByText("Ägarskap").length).toBeGreaterThan(0);
    expect(screen.getAllByText("DNS-riktning").length).toBeGreaterThan(0);
    expect(screen.getAllByText("HTTPS").length).toBeGreaterThan(0);
    expect(screen.getByText(/ändrar inte den här reserverade slugen/i)).toBeTruthy();
    expect(JSON.stringify(vi.mocked(globalThis.fetch).mock.calls)).not.toMatch(
      /\/api\/domains\/(check|purchase)/,
    );
    expect(screen.queryByText(/vp_|prj_|dpl_/i)).toBeNull();
  });

  it("links an already-owned domain without an availability check", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (init?.method === "POST") {
        expect(url).toBe("/api/projects/proj_1/domain");
        const body = JSON.parse(String(init.body));
        expect(body).toEqual({ action: "link", domain: "ny.se" });
        return json({ success: true, snapshot: { ...READY_SNAPSHOT, message: "Kopplad" } });
      }
      return json({ success: true, snapshot: { ...READY_SNAPSHOT, primary: null, companion: null } });
    }) as unknown as typeof fetch;

    render(
      <ByodDomainFlow projectId="proj_1" chatId="chat_1" publishedSlug="kund" />,
    );
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText(/Jag har redan en domän/i), {
      target: { value: "ny.se" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Koppla$/i }));

    await waitFor(() => {
      expect(screen.getByText("Kopplad")).toBeTruthy();
    });
    const urls = vi.mocked(globalThis.fetch).mock.calls.map(([input]) => input.toString());
    expect(urls.some((url) => url.includes("/api/domains/check"))).toBe(false);
  });

  it("can unlink back to branded/provider", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        expect(body.action).toBe("unlink");
        return json({
          success: true,
          snapshot: { ...READY_SNAPSHOT, primary: null, companion: null, canUnlink: false, liveDomain: null },
        });
      }
      return json({ success: true, snapshot: READY_SNAPSHOT });
    }) as unknown as typeof fetch;

    render(
      <ByodDomainFlow
        projectId="proj_1"
        chatId="chat_1"
        publishedSlug="kund"
        initialDomain="exempel.se"
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Koppla loss/i }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Koppla loss/i })).toBeNull();
    });
  });
});
