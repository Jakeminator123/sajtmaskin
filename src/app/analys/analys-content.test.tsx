import { StrictMode, type ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicAnalysResult } from "@/components/analys/analys-tool";
import {
  readPendingPublicAnalys,
  savePendingPublicAnalys,
} from "@/lib/audit/public-analys-resume";

const state = vi.hoisted(() => ({
  auth: {
    user: null as unknown,
    fetchUser: vi.fn<() => Promise<void>>(),
  },
  params: new URLSearchParams(),
  router: {
    push: vi.fn(),
    replace: vi.fn(),
  },
  createHandoff: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => state.router,
  useSearchParams: () => state.params,
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/lib/auth/auth-store", () => {
  const useAuthStore = Object.assign(
    (selector: (value: typeof state.auth) => unknown) => selector(state.auth),
    { getState: () => state.auth },
  );
  return { useAuthStore };
});
vi.mock("@/components/landing-v2/navbar", () => ({
  Navbar: ({ onLoginClick }: { onLoginClick: () => void }) => (
    <nav>
      <button type="button" onClick={onLoginClick}>
        Navbar login
      </button>
    </nav>
  ),
}));
vi.mock("@/components/landing-v2/landing-footer", () => ({
  LandingFooter: () => <footer>Footer</footer>,
}));
vi.mock("@/components/layout/site-background", () => ({
  SiteBackground: () => null,
}));
vi.mock("@/components/analys/analys-tool", () => ({
  AnalysTool: ({
    restoredResult,
    onPdf,
    onBuild,
    onAnalysisSuccess,
  }: {
    restoredResult?: PublicAnalysResult | null;
    onPdf: (result: PublicAnalysResult) => void;
    onBuild: (result: PublicAnalysResult) => void;
    onAnalysisSuccess?: (result: PublicAnalysResult) => void;
  }) => (
    <div>
      {restoredResult ? <span>Restored: {restoredResult.report.company}</span> : null}
      <button type="button" onClick={() => onPdf(sampleResult)}>
        Mock PDF
      </button>
      <button type="button" onClick={() => onBuild(sampleResult)}>
        Mock build
      </button>
      <button type="button" onClick={() => onAnalysisSuccess?.(replacementResult)}>
        Complete analysis C
      </button>
    </div>
  ),
}));
vi.mock("@/components/auth/auth-modal", () => ({
  AuthModal: ({
    isOpen,
    defaultMode,
    returnTo,
    onClose,
    onSuccess,
  }: {
    isOpen: boolean;
    defaultMode: "login" | "register";
    returnTo?: string;
    onClose: () => void;
    onSuccess?: (user: unknown) => void | Promise<void>;
  }) =>
    isOpen ? (
      <div data-testid="auth-modal">
        <span>{defaultMode}</span>
        <span>{returnTo}</span>
        <button type="button" onClick={onClose}>
          Close auth
        </button>
        <button
          type="button"
          onClick={() => {
            state.auth.user = authenticatedUser;
            onClose();
            void onSuccess?.(authenticatedUser);
          }}
        >
          Complete login
        </button>
      </div>
    ) : null,
}));
vi.mock("@/components/audit/AuditPdfReport", () => ({
  AuditPdfReport: ({ publicReport }: { publicReport: { company?: string } }) => (
    <div data-testid="public-pdf-dialog">Public PDF: {publicReport.company}</div>
  ),
}));
vi.mock("@/lib/builder/audit-handoff-client", () => ({
  createAuditBuildHandoff: (...args: unknown[]) => state.createHandoff(...args),
}));
vi.mock("sonner", () => ({
  toast: { error: state.toastError, success: state.toastSuccess },
}));

import { AnalysContent } from "./analys-content";

const authenticatedUser = {
  id: "user_1",
  email: "test@example.se",
  name: "Test",
};

const sampleResult: PublicAnalysResult = {
  report: {
    company: "Publika AB",
    domain: "publika.se",
    audit_scores: { seo: 72 },
    issues: ["Svag CTA"],
    improvements: [
      {
        item: "Tydligare CTA",
        impact: "high",
        effort: "low",
        why: "Fler ska förstå nästa steg",
      },
    ],
  },
  auditedUrl: "https://publika.se",
};

const replacementResult: PublicAnalysResult = {
  report: {
    company: "Rapport C",
    domain: "c.example.se",
    audit_scores: { seo: 88 },
  },
  auditedUrl: "https://c.example.se",
};

function deferredVoid() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("AnalysContent auth resume", () => {
  beforeEach(() => {
    window.localStorage.clear();
    state.params = new URLSearchParams();
    state.auth.user = null;
    state.auth.fetchUser.mockReset().mockResolvedValue();
    state.router.push.mockReset();
    state.router.replace.mockReset();
    state.createHandoff.mockReset().mockResolvedValue({ href: "/builder?chat=prompt_1" });
    state.toastError.mockReset();
    state.toastSuccess.mockReset();
  });

  it("requires a fresh auth check even when the persisted store starts with a stale user", async () => {
    state.auth.user = authenticatedUser;
    state.auth.fetchUser.mockImplementation(async () => {
      state.auth.user = null;
    });
    render(<AnalysContent />);

    fireEvent.click(screen.getByRole("button", { name: "Mock PDF" }));

    await screen.findByTestId("auth-modal");
    expect(screen.getByTestId("auth-modal").textContent).toContain("register");
    expect(screen.getByTestId("auth-modal").textContent).toContain("/analys?resume=pdf");
    expect(screen.queryByTestId("public-pdf-dialog")).toBeNull();
    expect(readPendingPublicAnalys()?.action).toBe("pdf");
  });

  it("continues PDF exactly once after an actual inline login", async () => {
    render(<AnalysContent />);
    fireEvent.click(screen.getByRole("button", { name: "Mock PDF" }));
    await screen.findByTestId("auth-modal");

    fireEvent.click(screen.getByRole("button", { name: "Complete login" }));

    await screen.findByTestId("public-pdf-dialog");
    expect(screen.getAllByTestId("public-pdf-dialog")).toHaveLength(1);
    expect(state.router.replace).toHaveBeenCalledWith("/analys", { scroll: false });
    expect(readPendingPublicAnalys()).toBeNull();
  });

  it("claims one build after a fresh remount auth check under StrictMode", async () => {
    savePendingPublicAnalys({ action: "build", ...sampleResult });
    state.params = new URLSearchParams("resume=build");
    state.auth.fetchUser.mockImplementation(async () => {
      state.auth.user = authenticatedUser;
    });

    render(
      <StrictMode>
        <AnalysContent />
      </StrictMode>,
    );

    await waitFor(() => expect(state.createHandoff).toHaveBeenCalledTimes(1));
    expect(state.router.push).toHaveBeenCalledTimes(1);
    expect(readPendingPublicAnalys()).toBeNull();
  });

  it("does not resume a verified email flow until fresh auth is actually present", async () => {
    savePendingPublicAnalys({ action: "pdf", ...sampleResult });
    state.params = new URLSearchParams("resume=pdf&verified=success");
    state.auth.fetchUser.mockImplementation(async () => {
      state.auth.user = null;
    });
    render(<AnalysContent />);

    await screen.findByTestId("auth-modal");
    expect(screen.getByTestId("auth-modal").textContent).toContain("login");
    expect(screen.queryByTestId("public-pdf-dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Complete login" }));
    await screen.findByTestId("public-pdf-dialog");
  });

  it.each([
    { label: "Mock PDF", effect: "pdf" as const },
    { label: "Mock build", effect: "build" as const },
  ])(
    "does not run stale A $effect after dismiss, successful C, and later navbar login",
    async ({ label }) => {
      state.auth.fetchUser.mockImplementation(async () => {
        state.auth.user = null;
      });
      render(<AnalysContent />);

      fireEvent.click(screen.getByRole("button", { name: label }));
      await screen.findByTestId("auth-modal");
      fireEvent.click(screen.getByRole("button", { name: "Close auth" }));
      fireEvent.click(screen.getByRole("button", { name: "Complete analysis C" }));
      expect(await screen.findByText("Restored: Rapport C")).not.toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Navbar login" }));
      fireEvent.click(await screen.findByRole("button", { name: "Complete login" }));

      await waitFor(() => expect(screen.queryByTestId("auth-modal")).toBeNull());
      expect(screen.getByText("Restored: Rapport C")).not.toBeNull();
      expect(screen.queryByTestId("public-pdf-dialog")).toBeNull();
      expect(state.createHandoff).not.toHaveBeenCalled();
      expect(readPendingPublicAnalys()).toBeNull();
    },
  );

  it("disarms a dismissed CTA but preserves A for an explicit authenticated retry", async () => {
    state.auth.fetchUser.mockImplementation(async () => {
      state.auth.user = null;
    });
    render(<AnalysContent />);

    fireEvent.click(screen.getByRole("button", { name: "Mock PDF" }));
    await screen.findByTestId("auth-modal");
    fireEvent.click(screen.getByRole("button", { name: "Close auth" }));
    expect(readPendingPublicAnalys()?.report.company).toBe("Publika AB");

    fireEvent.click(screen.getByRole("button", { name: "Navbar login" }));
    fireEvent.click(await screen.findByRole("button", { name: "Complete login" }));
    await waitFor(() => expect(screen.queryByTestId("auth-modal")).toBeNull());
    expect(screen.queryByTestId("public-pdf-dialog")).toBeNull();
    expect(readPendingPublicAnalys()?.report.company).toBe("Publika AB");

    state.auth.fetchUser.mockImplementation(async () => {
      state.auth.user = authenticatedUser;
    });
    fireEvent.click(screen.getByRole("button", { name: "Mock PDF" }));
    await screen.findByTestId("public-pdf-dialog");
    expect(screen.getByTestId("public-pdf-dialog").textContent).toContain("Publika AB");
  });

  it("does not let an old auth check reopen the modal after a newer analysis succeeds", async () => {
    const pendingFetch = deferredVoid();
    state.auth.fetchUser.mockImplementationOnce(() => pendingFetch.promise);
    render(<AnalysContent />);

    fireEvent.click(screen.getByRole("button", { name: "Mock PDF" }));
    fireEvent.click(screen.getByRole("button", { name: "Complete analysis C" }));
    pendingFetch.resolve();

    expect(await screen.findByText("Restored: Rapport C")).not.toBeNull();
    await waitFor(() => expect(state.auth.fetchUser).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("auth-modal")).toBeNull();
    expect(screen.queryByTestId("public-pdf-dialog")).toBeNull();
  });

  it("does not let an old auth check reopen a navbar modal after dismissal", async () => {
    const pendingFetch = deferredVoid();
    state.auth.fetchUser.mockImplementationOnce(() => pendingFetch.promise);
    render(<AnalysContent />);

    fireEvent.click(screen.getByRole("button", { name: "Mock PDF" }));
    fireEvent.click(screen.getByRole("button", { name: "Navbar login" }));
    fireEvent.click(await screen.findByRole("button", { name: "Close auth" }));
    pendingFetch.resolve();

    await waitFor(() => expect(state.auth.fetchUser).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("auth-modal")).toBeNull();
    expect(readPendingPublicAnalys()?.report.company).toBe("Publika AB");
  });

  it.each([
    ["missing_token", "Verifieringslänken saknar token."],
    ["invalid_or_expired", "Verifieringslänken är ogiltig eller har gått ut."],
    ["server_error", "Något gick fel vid e-postverifiering."],
    ["future_reason", "Kunde inte verifiera e-postadressen."],
  ])(
    "stops verified=error reason %s before auth or claim and preserves pending",
    async (reason, message) => {
      savePendingPublicAnalys({ action: "pdf", ...sampleResult });
      state.params = new URLSearchParams(`resume=pdf&verified=error&reason=${reason}`);

      render(
        <StrictMode>
          <AnalysContent />
        </StrictMode>,
      );

      await waitFor(() => expect(state.toastError).toHaveBeenCalledWith(message));
      expect(state.toastError).toHaveBeenCalledTimes(1);
      expect(state.auth.fetchUser).not.toHaveBeenCalled();
      expect(screen.queryByTestId("auth-modal")).toBeNull();
      expect(screen.queryByTestId("public-pdf-dialog")).toBeNull();
      expect(state.createHandoff).not.toHaveBeenCalled();
      expect(readPendingPublicAnalys()?.report.company).toBe("Publika AB");
      expect(screen.getByText("Restored: Publika AB")).not.toBeNull();
      expect(state.router.replace).toHaveBeenCalledWith("/analys", { scroll: false });

      state.auth.fetchUser.mockImplementation(async () => {
        state.auth.user = authenticatedUser;
      });
      fireEvent.click(screen.getByRole("button", { name: "Mock PDF" }));
      await screen.findByTestId("public-pdf-dialog");
      expect(screen.getByTestId("public-pdf-dialog").textContent).toContain("Publika AB");
    },
  );

  it("shows verified success once, preserves resume, and waits for a fresh unauthenticated check", async () => {
    savePendingPublicAnalys({ action: "pdf", ...sampleResult });
    state.params = new URLSearchParams("resume=pdf&verified=success");
    state.auth.fetchUser.mockImplementation(async () => {
      state.auth.user = null;
    });

    render(
      <StrictMode>
        <AnalysContent />
      </StrictMode>,
    );

    await screen.findByTestId("auth-modal");
    expect(state.toastSuccess).toHaveBeenCalledWith(
      "E-postadressen är verifierad. Logga in för att fortsätta.",
    );
    expect(state.toastSuccess).toHaveBeenCalledTimes(1);
    expect(state.router.replace).toHaveBeenCalledWith("/analys?resume=pdf", {
      scroll: false,
    });
    expect(screen.queryByTestId("public-pdf-dialog")).toBeNull();
    expect(readPendingPublicAnalys()?.action).toBe("pdf");

    fireEvent.click(screen.getByRole("button", { name: "Complete login" }));
    await screen.findByTestId("public-pdf-dialog");
    expect(screen.getAllByTestId("public-pdf-dialog")).toHaveLength(1);
  });

  it("shows verified success once and claims one build after fresh authenticated state", async () => {
    savePendingPublicAnalys({ action: "build", ...sampleResult });
    state.params = new URLSearchParams("resume=build&verified=success");
    state.auth.fetchUser.mockImplementation(async () => {
      state.auth.user = authenticatedUser;
    });

    render(
      <StrictMode>
        <AnalysContent />
      </StrictMode>,
    );

    await waitFor(() => expect(state.createHandoff).toHaveBeenCalledTimes(1));
    expect(state.toastSuccess).toHaveBeenCalledTimes(1);
    expect(state.router.push).toHaveBeenCalledTimes(1);
    expect(readPendingPublicAnalys()).toBeNull();
  });

  it("requeues a failed build without an auto-loop and retries only after a new click", async () => {
    state.auth.fetchUser.mockImplementation(async () => {
      state.auth.user = authenticatedUser;
    });
    state.createHandoff
      .mockRejectedValueOnce(new Error("Prompttransport misslyckades"))
      .mockResolvedValueOnce({ href: "/builder?chat=prompt_2" });
    render(<AnalysContent />);

    fireEvent.click(screen.getByRole("button", { name: "Mock build" }));
    await waitFor(() => expect(state.createHandoff).toHaveBeenCalledTimes(1));
    expect(state.router.replace).toHaveBeenCalledWith("/analys", { scroll: false });
    expect(state.router.push).not.toHaveBeenCalled();
    expect(readPendingPublicAnalys()?.action).toBe("build");

    await Promise.resolve();
    expect(state.createHandoff).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Mock build" }));

    await waitFor(() => expect(state.createHandoff).toHaveBeenCalledTimes(2));
    expect(state.router.push).toHaveBeenCalledWith("/builder?chat=prompt_2");
  });
});
