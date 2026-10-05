import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./files/app/login/page";
import SignupPage from "./files/app/signup/page";
import ForgotPasswordPage from "./files/app/forgot-password/page";
import { AuthForm } from "./files/components/auth-form";
import { authAdapter, type AuthResult, type AuthSubmission } from "./files/lib/auth-adapter";
import { authPagesManifest } from "./manifest";
import { buildCompleteProject } from "../../export/project-scaffold";
import { collectRequiredUiComponents } from "../../export/project-scaffold-ui-reader";
import { inferFileLanguage } from "@/lib/utils/infer-file-language";

afterEach(cleanup);

describe("auth scaffold pages", () => {
  it.each([
    ["login", LoginPage],
    ["signup", SignupPage],
    ["recovery", ForgotPasswordPage],
  ] as const)("%s ships a native form and required email constraint", (_mode, Page) => {
    const { container } = render(<Page />);
    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    const email = screen.getByLabelText("E-post") as HTMLInputElement;
    expect(email.name).toBe("email");
    expect(email.required).toBe(true);
    fireEvent.change(email, { target: { value: "not-an-email" } });
    expect(email.checkValidity()).toBe(false);
    expect(form?.getAttribute("method")).toBe("post");
  });

  it.each([
    ["login", LoginPage],
    ["signup", SignupPage],
    ["recovery", ForgotPasswordPage],
  ] as const)(
    "%s reports an unconnected provider without claiming success",
    async (_mode, Page) => {
      const { container } = render(<Page />);
      fireEvent.change(screen.getByLabelText("E-post"), {
        target: { value: "person@example.com" },
      });
      for (const input of container.querySelectorAll<HTMLInputElement>("input")) {
        if (input.type === "password")
          fireEvent.change(input, { target: { value: "long-password" } });
        if (input.name === "name") fireEvent.change(input, { target: { value: "Person" } });
      }
      const form = container.querySelector("form");
      expect(form).not.toBeNull();
      fireEvent.submit(form!);
      await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/inte ansluten/i));
      expect(screen.queryByRole("status")).toBeNull();
    },
  );
});

function fillLogin(container: HTMLElement) {
  fireEvent.change(screen.getByLabelText("E-post"), { target: { value: "person@example.com" } });
  fireEvent.change(screen.getByLabelText("Lösenord"), { target: { value: "unchanged-password" } });
  return container.querySelector("form")!;
}

describe("auth submission boundary", () => {
  it("rejects missing or malformed fields without calling a provider", () => {
    const submit = vi.fn();
    const { container } = render(<AuthForm intent="login" adapter={{ submit }} />);
    const form = container.querySelector("form")!;
    fireEvent.submit(form);
    expect(submit).not.toHaveBeenCalled();
    fillLogin(container);
    fireEvent.change(screen.getByLabelText("E-post"), { target: { value: "invalid-email" } });
    fireEvent.submit(form);
    expect(submit).not.toHaveBeenCalled();
  });

  it("requires matching signup passwords and a nonblank name", async () => {
    const submit = vi
      .fn()
      .mockResolvedValue({ ok: true, message: "Provider confirmed registration." });
    const { container } = render(<AuthForm intent="signup" adapter={{ submit }} />);
    const form = fillLogin(container);
    fireEvent.change(screen.getByLabelText("Namn"), { target: { value: " Person " } });
    fireEvent.change(screen.getByLabelText("Bekräfta lösenord"), {
      target: { value: "different-password" },
    });
    expect((screen.getByLabelText("Lösenord") as HTMLInputElement).minLength).toBe(8);
    fireEvent.submit(form);
    expect(screen.getByRole("alert").textContent).toMatch(/matchar inte/);
    expect(submit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Bekräfta lösenord"), {
      target: { value: "unchanged-password" },
    });
    fireEvent.change(screen.getByLabelText("Namn"), { target: { value: "   " } });
    fireEvent.submit(form);
    expect(submit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Namn"), { target: { value: " Person " } });
    fireEvent.submit(form);
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("Provider confirmed registration."),
    );
    expect(submit).toHaveBeenCalledWith({
      intent: "signup",
      name: "Person",
      email: "person@example.com",
      password: "unchanged-password",
    });
  });

  it("holds one request pending, blocks same-tick duplicates, and permits retry after failure", async () => {
    let complete!: (result: AuthResult) => void;
    const submit = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<AuthResult>((resolve) => {
            complete = resolve;
          }),
      )
      .mockResolvedValue({ ok: true, message: "Provider confirmed login." });
    const { container } = render(<AuthForm intent="login" adapter={{ submit }} />);
    const form = fillLogin(container);
    act(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(form.getAttribute("aria-busy")).toBe("true");
    expect(container.querySelector("fieldset")?.disabled).toBe(true);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("status")).toBeNull();
    await act(async () => complete({ ok: false, message: "Provider declined." }));
    expect(screen.getByRole("alert").textContent).toBe("Provider declined.");
    expect(container.querySelector("fieldset")?.disabled).toBe(false);
    fireEvent.submit(form);
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("Provider confirmed login."),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it("redacts thrown provider details and restores the retry button", async () => {
    const submit = vi.fn().mockRejectedValue(new Error("secret-provider-token"));
    const { container } = render(<AuthForm intent="login" adapter={{ submit }} />);
    fireEvent.submit(fillLogin(container));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Försök igen/));
    expect(container.textContent).not.toContain("secret-provider-token");
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("recovery submits only email and only reports provider-confirmed acceptance", async () => {
    const submit = vi
      .fn()
      .mockResolvedValue({ ok: true, message: "Provider accepted recovery request." });
    const { container } = render(<AuthForm intent="reset-password" adapter={{ submit }} />);
    fireEvent.change(screen.getByLabelText("E-post"), { target: { value: "person@example.com" } });
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("Provider accepted recovery request."),
    );
    expect(submit).toHaveBeenCalledWith({ intent: "reset-password", email: "person@example.com" });
    expect(container.querySelector('[type="password"]')).toBeNull();
  });

  it.each(["login", "signup", "reset-password"] as const)(
    "the default %s adapter never creates local credentials",
    async (intent) => {
      const storage = vi.spyOn(Storage.prototype, "setItem");
      const result = await authAdapter.submit({
        intent,
        email: "person@example.com",
        password: "secret",
        name: "Person",
      } as AuthSubmission);
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/inte ansluten/);
      expect(storage).not.toHaveBeenCalled();
      storage.mockRestore();
    },
  );
});

describe("auth scaffold materialization", () => {
  it("ships the shared form, adapter and complete UI dependency closure with linked auth pages", () => {
    const generated = authPagesManifest.files.map((file) => ({
      ...file,
      language: inferFileLanguage(file.path),
    }));
    const files = buildCompleteProject(generated, collectRequiredUiComponents(generated));
    const byPath = new Map(files.map((file) => [file.path, file.content]));
    expect(byPath.get("components/auth-form.tsx")).toContain('"use client"');
    expect(byPath.get("lib/auth-adapter.ts")).toContain("ok: false");
    for (const component of ["button", "input", "label", "card"])
      expect(byPath.has(`components/ui/${component}.tsx`)).toBe(true);
    for (const route of ["login", "signup", "forgot-password"])
      expect(byPath.get(`app/${route}/page.tsx`)).toContain("../../components/auth-form");
    expect(byPath.get("app/page.tsx")).toContain('redirect("/login")');
    expect(byPath.has("package.json")).toBe(true);
    expect(byPath.has("tsconfig.json")).toBe(true);
    expect(authPagesManifest.routeContract?.deliveryGroups).toContainEqual([
      "/login",
      "/signup",
      "/forgot-password",
    ]);
  });
});
