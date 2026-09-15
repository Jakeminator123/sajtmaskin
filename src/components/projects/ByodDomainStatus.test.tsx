import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ByodDomainStatus } from "./ByodDomainStatus";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ByodDomainStatus", () => {
  it("checks a directly entered domain through the read-only status GET only", async () => {
    globalThis.fetch = vi.fn(async () =>
      json({
        domain: "customer.com",
        connection: "connected",
        ownership: "verified",
        dns: "valid",
        https: "not_checked",
        activation: "not_started",
        records: [],
      }),
    ) as unknown as typeof fetch;

    render(<ByodDomainStatus chatId="chat_1" />);
    fireEvent.change(screen.getByLabelText(/Domän du redan äger/i), {
      target: { value: "customer.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Kontrollera domän/i }));

    await waitFor(() => {
      expect(screen.getByText("DNS verifierad för den kontrollerade domänen.")).toBeTruthy();
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(url.toString()).toBe("/api/domains/status?domain=customer.com&chatId=chat_1");
    expect(init?.method).toBe("GET");
    expect(url.toString()).not.toMatch(/\/(check|purchase|link|verify|save)(?:\?|$)/);
    expect(screen.getByText(/verifierar inte HTTPS/i)).toBeTruthy();
    expect(screen.queryByText(/HTTPS (är )?(klar|verifierad|aktiv)/i)).toBeNull();
    expect(screen.getByText("customer.com")).toBeTruthy();
  });

  it("shows provider-returned records with the exact FQDN and no invented www record", async () => {
    globalThis.fetch = vi.fn(async () =>
      json({
        domain: "kundensajt.se",
        connection: "connected",
        ownership: "pending",
        dns: "invalid",
        https: "not_checked",
        activation: "not_started",
        records: [
          {
            type: "A",
            host: "kundensajt.se",
            value: "192.0.2.77",
            purpose: "configuration",
          },
          {
            type: "TXT",
            host: "_vercel.kundensajt.se",
            value: "vc-domain-verify=kundensajt.se,abc",
            purpose: "ownership",
          },
        ],
      }),
    ) as unknown as typeof fetch;

    render(<ByodDomainStatus chatId="chat_1" initialDomain="kundensajt.se" />);
    fireEvent.click(screen.getByRole("button", { name: /Kontrollera domän/i }));

    expect(await screen.findByText("192.0.2.77")).toBeTruthy();
    expect(screen.getAllByText("kundensajt.se").length).toBeGreaterThan(0);
    expect(screen.getByText("_vercel.kundensajt.se")).toBeTruthy();
    expect(screen.queryByText(/^www$/i)).toBeNull();
    expect(screen.getByText(/aktiverar ingen adress/i)).toBeTruthy();
  });

  it("describes an unconnected observation as preflight only", async () => {
    globalThis.fetch = vi.fn(async () =>
      json({
        domain: "customer.com",
        connection: "not_connected",
        ownership: "unknown",
        dns: "invalid",
        https: "not_checked",
        activation: "not_started",
        records: [
          {
            type: "A",
            host: "customer.com",
            value: "192.0.2.55",
            purpose: "configuration",
          },
        ],
      }),
    ) as unknown as typeof fetch;

    render(<ByodDomainStatus chatId="chat_1" initialDomain="customer.com" />);
    fireEvent.click(screen.getByRole("button", { name: /Kontrollera domän/i }));

    expect(await screen.findByText("Domänen är inte kopplad till det här projektet.")).toBeTruthy();
    expect(screen.getByText(/Säkert förhandsunderlag från Vercel/i)).toBeTruthy();
    expect(screen.queryByText(/DNS verifierad/i)).toBeNull();
  });

  it("surfaces validation/provider errors without trying another domain endpoint", async () => {
    globalThis.fetch = vi.fn(async () =>
      json({ error: "Den adressen är reserverad." }, 400),
    ) as unknown as typeof fetch;

    render(<ByodDomainStatus chatId="chat_1" initialDomain="demo.vercel.app" />);
    fireEvent.click(screen.getByRole("button", { name: /Kontrollera domän/i }));

    expect((await screen.findByRole("alert")).textContent).toContain("Den adressen är reserverad.");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("clears a green observation when the input changes to another domain", async () => {
    globalThis.fetch = vi.fn(async () =>
      json({
        domain: "a.se",
        connection: "connected",
        ownership: "verified",
        dns: "valid",
        https: "not_checked",
        activation: "not_started",
        records: [],
      }),
    ) as unknown as typeof fetch;

    render(<ByodDomainStatus chatId="chat_1" initialDomain="a.se" />);
    fireEvent.click(screen.getByRole("button", { name: /Kontrollera domän/i }));
    expect(await screen.findByText("DNS verifierad för den kontrollerade domänen.")).toBeTruthy();
    expect(screen.getByText("a.se")).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Domän du redan äger/i), {
      target: { value: "b.se" },
    });

    expect(screen.queryByText("DNS verifierad för den kontrollerade domänen.")).toBeNull();
    expect(screen.queryByText("a.se")).toBeNull();
  });

  it("clears observations when the owning chat changes", async () => {
    globalThis.fetch = vi.fn(async () =>
      json({
        domain: "a.se",
        connection: "connected",
        ownership: "verified",
        dns: "valid",
        https: "not_checked",
        activation: "not_started",
        records: [],
      }),
    ) as unknown as typeof fetch;

    const { rerender } = render(<ByodDomainStatus chatId="chat_1" initialDomain="a.se" />);
    fireEvent.click(screen.getByRole("button", { name: /Kontrollera domän/i }));
    expect(await screen.findByText("DNS verifierad för den kontrollerade domänen.")).toBeTruthy();

    rerender(<ByodDomainStatus chatId="chat_2" initialDomain="b.se" />);

    expect(screen.queryByText("DNS verifierad för den kontrollerade domänen.")).toBeNull();
    expect(screen.getByLabelText(/Domän du redan äger/i)).toHaveProperty("value", "b.se");
  });
});
