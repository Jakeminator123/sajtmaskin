import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAdminResource } from "../../lib/use-admin-resource";
import { UsersSection } from "./users-section";

vi.mock("../../lib/use-admin-resource", () => ({ useAdminResource: vi.fn() }));
const fetchMock = vi.fn();
const reload = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
  vi.mocked(useAdminResource).mockReturnValue({
    loading: false,
    error: null,
    status: 200,
    reload,
    data: {
      offset: 0,
      hasMore: false,
      users: [
        {
          id: "admin",
          name: "Admin",
          email: "admin@example.test",
          credits: 1000,
          projectCount: 0,
          emailVerified: true,
          freeGenerationAvailable: false,
          deletionProtection: "Du kan inte radera ditt eget konto.",
        },
        {
          id: "person",
          name: "Person",
          email: "person@example.test",
          credits: 100,
          projectCount: 0,
          emailVerified: true,
          freeGenerationAvailable: false,
          deletionProtection: null,
        },
      ],
    },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("admin users screen", () => {
  it("creates an account with the entered identity, password and initial balance", async () => {
    render(<UsersSection />);
    fireEvent.click(screen.getByRole("button", { name: /Lägg till användare/ }));
    fireEvent.change(screen.getByLabelText("E-post"), { target: { value: "new@example.test" } });
    fireEvent.change(screen.getByLabelText("Lösenord"), { target: { value: "test-secret" } });
    fireEvent.change(screen.getByLabelText("Startsaldo i krediter"), { target: { value: "100" } });
    fireEvent.submit(screen.getByRole("button", { name: "Skapa konto" }).closest("form")!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      email: "new@example.test",
      password: "test-secret",
      credits: 100,
    });
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(reload).toHaveBeenCalled();
  });

  it("keeps the grant operation identity when retrying an uncertain response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ success: false, error: "Försök igen" }),
    });
    render(<UsersSection />);
    fireEvent.click(screen.getByRole("button", { name: "Ge krediter till person@example.test" }));
    fireEvent.submit(screen.getByRole("button", { name: "Lägg till krediter" }).closest("form")!);
    await screen.findByRole("alert");
    fireEvent.submit(screen.getByRole("button", { name: "Lägg till krediter" }).closest("form")!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const first = JSON.parse(fetchMock.mock.calls[0][1].body);
    const retry = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(first).toEqual(retry);
    expect(first).toMatchObject({ userId: "person", amount: 100, requestId: expect.any(String) });
  });

  it("disables deletion of the acting admin while leaving an unused account removable", () => {
    render(<UsersSection />);
    const adminRow = screen.getByText("Admin").closest("tr")!;
    const personRow = screen.getByText("Person").closest("tr")!;
    expect(within(adminRow).getByRole("button", { name: "Radera" }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(within(personRow).getByRole("button", { name: "Radera" }).hasAttribute("disabled")).toBe(
      false,
    );
  });
});
