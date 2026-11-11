import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
import { EmailVerificationForm } from "./email-verification-form";

describe("email verification form", () => {
  beforeEach(() => { vi.restoreAllMocks(); replace.mockReset(); });
  function fill(confirmation: string) {
    fireEvent.change(screen.getByLabelText("Lösenord"), { target: { value: "owner-secret" } });
    fireEvent.change(screen.getByLabelText("Bekräfta lösenord"), { target: { value: confirmation } });
    fireEvent.click(screen.getByRole("button", { name: "Bekräfta och fortsätt" }));
  }
  it("keeps mismatches on the form", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    render(<EmailVerificationForm returnTo="/" />);
    fill("other-secret");
    expect((await screen.findByRole("alert")).textContent).toContain("stämmer inte");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("submits the owner-selected password and resumes login", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true, redirectTo: "/analys?resume=pdf&verified=success" })));
    render(<EmailVerificationForm returnTo="/analys?resume=pdf" />);
    fill("owner-secret");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/analys?resume=pdf&verified=success"));
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toEqual({ password: "owner-secret", confirmPassword: "owner-secret", returnTo: "/analys?resume=pdf" });
  });
  it("offers recovery after an expired link", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "Länken har gått ut. Begär ett nytt verifieringsmail." }), { status: 400 }));
    render(<EmailVerificationForm returnTo="/" />);
    fill("owner-secret");
    expect((await screen.findByRole("alert")).textContent).toContain("gått ut");
    expect(screen.getByRole("link", { name: "Tillbaka till inloggning" }).getAttribute("href")).toBe("/");
    expect(replace).not.toHaveBeenCalled();
  });
});
