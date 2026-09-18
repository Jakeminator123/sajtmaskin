// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KostnadsfriCompanyData, MiniWizardData } from "@/lib/kostnadsfri";
import {
  clearCampaignScriptStorageForTests,
  emptyCampaignScript,
} from "@/lib/kostnadsfri/agent-campaign-script";
import {
  clearPendingInitBuildStorageForTests,
  persistPendingInitBuild,
} from "@/lib/kostnadsfri/pending-init-build";
import { KOSTNADSFRI_FOLLOWUPS_READY_EVENT } from "@/lib/kostnadsfri/agent-followups";
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";
import { KostnadsfriPage } from "./kostnadsfri-page";

const fixtures = vi.hoisted(() => {
  const companyData: KostnadsfriCompanyData = {
    slug: "zax-2-0-ab",
    companyName: "Zax 2.0 AB",
    industry: null,
    website: null,
    contactEmail: "info@zax.example",
    contactName: "Jan Rickard Mandahl",
    openclawConfig: null,
    profile: {
      businessDescription: "Bolaget skall bedriva frisörverksamhet samt därmed förenlig verksamhet.",
    },
  };
  const wizardData: MiniWizardData = {
    companyName: "Zax Frisör",
    industry: "health",
    website: "https://zax.example",
    location: "Kista",
    description: "Vi klipper och färgar hår i Kista sedan 2026.",
    purposes: ["booking", "leads"],
    targetAudience: "Boende i Kista och norra Stockholm",
    usp: "Drop-in på kvällar",
    designVibe: "luxury",
    paletteName: "Ocean",
    colorPrimary: "#000000",
    colorSecondary: "#333333",
    colorAccent: "#2dd4bf",
  };
  const f1Wizard: MiniWizardData = {
    companyName: "Zax 2.0 AB",
    industry: "health",
    website: "",
    location: "Kista",
    description: "Frisörverksamhet",
    purposes: ["leads"],
    targetAudience: "",
    usp: "",
    designVibe: "modern",
    paletteName: null,
    colorPrimary: null,
    colorSecondary: null,
    colorAccent: null,
  };
  return { companyData, wizardData, f1Wizard, completeWith: "f1" as "f1" | "preview" };
});

const router = vi.hoisted(() => ({ push: vi.fn() }));
const auth = vi.hoisted(() => ({
  isAuthenticated: true,
  isInitialized: true,
  fetchUser: vi.fn(async () => undefined),
}));
const projects = vi.hoisted(() => ({
  createProject: vi.fn(async () => ({
    id: "proj-a",
    name: "Zax - Kostnadsfri",
    created_at: "",
    updated_at: "",
  })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("@/lib/projects/project-client", () => ({
  createProject: projects.createProject,
}));

vi.mock("@/lib/auth/auth-store", () => ({
  useAuth: () => ({
    isAuthenticated: auth.isAuthenticated,
    isInitialized: auth.isInitialized,
    user: auth.isAuthenticated ? { id: "user_1" } : null,
    fetchUser: auth.fetchUser,
  }),
}));

vi.mock("@/components/auth/require-auth-modal", () => ({
  RequireAuthModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div>Logga in för att bygga hemsidan</div> : null,
}));

vi.mock("./password-gate", () => ({
  PasswordGate: ({
    onSuccess,
  }: {
    onSuccess: (data: KostnadsfriCompanyData) => void;
  }) => (
    <button type="button" onClick={() => onSuccess(fixtures.companyData)}>
      Öppna wizard
    </button>
  ),
}));

vi.mock("./mini-wizard", () => ({
  MiniWizard: ({
    onComplete,
    error,
  }: {
    onComplete: (data: MiniWizardData) => void;
    error: string | null;
  }) => (
    <div>
      {error ? <p>{error}</p> : null}
      <button
        type="button"
        onClick={() =>
          onComplete(fixtures.completeWith === "preview" ? fixtures.wizardData : fixtures.f1Wizard)
        }
      >
        Klara wizarden
      </button>
    </div>
  ),
}));

vi.mock("./thinking-spinner", () => ({
  ThinkingSpinner: () => <div>Bygger förslaget</div>,
}));

describe("KostnadsfriPage — F1 wait then one build", () => {
  beforeEach(() => {
    fixtures.completeWith = "f1";
    auth.isAuthenticated = true;
    auth.isInitialized = true;
    auth.fetchUser.mockReset();
    auth.fetchUser.mockResolvedValue(undefined);
    router.push.mockReset();
    projects.createProject.mockReset();
    clearPendingInitBuildStorageForTests();
    projects.createProject.mockImplementation(async () => ({
      id: "proj-a",
      name: "Zax - Kostnadsfri",
      created_at: "",
      updated_at: "",
    }));
    clearCampaignScriptStorageForTests();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ promptId: "prompt_1" }),
      })),
    );
    act(() => {
      useOpenClawStore.setState({
        campaignScript: emptyCampaignScript("zax-2-0-ab"),
      });
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    clearCampaignScriptStorageForTests();
    clearPendingInitBuildStorageForTests();
    delete window.__SITEMASKIN_CONTEXT;
  });

  it("kräver inloggning före projekt och prompt", async () => {
    auth.isAuthenticated = false;
    render(<KostnadsfriPage slug="zax-2-0-ab" companyName="Zax 2.0 AB" />);
    fireEvent.click(screen.getByRole("button", { name: "Öppna wizard" }));
    fireEvent.click(screen.getByRole("button", { name: "Klara wizarden" }));

    await act(async () => {
      useOpenClawStore.getState().continueCampaignFollowups();
    });

    await waitFor(() => {
      expect(screen.getByText("Ett konto behövs för att bygga hemsidan")).toBeTruthy();
    });
    expect(projects.createProject).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("startar inte bygget efter tyst 3s — skip ger exakt ett init-bygge", async () => {
    vi.useFakeTimers();
    render(<KostnadsfriPage slug="zax-2-0-ab" companyName="Zax 2.0 AB" />);

    fireEvent.click(screen.getByRole("button", { name: "Öppna wizard" }));
    fireEvent.click(screen.getByRole("button", { name: "Klara wizarden" }));

    expect(screen.getByRole("heading", { name: /Vad skiljer er från konkurrenterna/ })).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });
    expect(projects.createProject).not.toHaveBeenCalled();
    vi.useRealTimers();

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(KOSTNADSFRI_FOLLOWUPS_READY_EVENT, {
          detail: { slug: "zax-2-0-ab", reason: "skipped" },
        }),
      );
    });

    await waitFor(() => {
      expect(projects.createProject).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(KOSTNADSFRI_FOLLOWUPS_READY_EVENT, {
          detail: { slug: "zax-2-0-ab", reason: "skipped" },
        }),
      );
    });
    expect(projects.createProject).toHaveBeenCalledTimes(1);
    expect(useOpenClawStore.getState().campaignScript?.projectId).toBe("proj-a");
  });

  it("öppnar lösenordssteget igen när inbjudan inte kan verifieras", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({}),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<KostnadsfriPage slug="zax-2-0-ab" companyName="Zax 2.0 AB" />);
    fireEvent.click(screen.getByRole("button", { name: "Öppna wizard" }));
    fireEvent.click(screen.getByRole("button", { name: "Klara wizarden" }));

    await act(async () => {
      useOpenClawStore.getState().continueCampaignFollowups();
    });

    await waitFor(() => {
      expect(screen.getByText("Inbjudan kunde inte verifieras.")).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "Öppna wizard" })).toBeTruthy();
    expect(projects.createProject).toHaveBeenCalledTimes(1);
  });

  it("startar ett nytt init-bygge via Fortsätt efter prompt-fel, samma projekt", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => ({}),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<KostnadsfriPage slug="zax-2-0-ab" companyName="Zax 2.0 AB" />);
    fireEvent.click(screen.getByRole("button", { name: "Öppna wizard" }));
    fireEvent.click(screen.getByRole("button", { name: "Klara wizarden" }));

    await act(async () => {
      useOpenClawStore.getState().continueCampaignFollowups();
    });

    await waitFor(() => {
      expect(screen.getByText("Något gick fel. Försök igen.")).toBeTruthy();
    });
    expect(projects.createProject).toHaveBeenCalledTimes(1);

    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({ promptId: "prompt_retry" }),
    }));

    fireEvent.click(screen.getByRole("button", { name: "Fortsätt" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(projects.createProject).toHaveBeenCalledTimes(1);
    expect(useOpenClawStore.getState().campaignScript?.projectId).toBe("proj-a");
  });

  it("återanvänder samma projectId efter remount när prompten misslyckats", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => ({}),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = render(<KostnadsfriPage slug="zax-2-0-ab" companyName="Zax 2.0 AB" />);
    fireEvent.click(screen.getByRole("button", { name: "Öppna wizard" }));
    fireEvent.click(screen.getByRole("button", { name: "Klara wizarden" }));

    await act(async () => {
      useOpenClawStore.getState().continueCampaignFollowups();
    });

    await waitFor(() => {
      expect(screen.getByText("Något gick fel. Försök igen.")).toBeTruthy();
    });
    expect(projects.createProject).toHaveBeenCalledTimes(1);
    expect(useOpenClawStore.getState().campaignScript?.projectId).toBe("proj-a");

    unmount();
    act(() => {
      useOpenClawStore.setState({ campaignScript: null });
    });

    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({ promptId: "prompt_remount" }),
    }));

    render(<KostnadsfriPage slug="zax-2-0-ab" companyName="Zax 2.0 AB" />);

    await waitFor(() => {
      expect(router.push).toHaveBeenCalled();
    });
    expect(projects.createProject).toHaveBeenCalledTimes(1);
    expect(useOpenClawStore.getState().campaignScript?.projectId).toBe("proj-a");
  });

  it("återanvänder inte projectId från en annan kampanjslug", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => ({}),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = render(<KostnadsfriPage slug="zax-2-0-ab" companyName="Zax 2.0 AB" />);
    fireEvent.click(screen.getByRole("button", { name: "Öppna wizard" }));
    fireEvent.click(screen.getByRole("button", { name: "Klara wizarden" }));

    await act(async () => {
      useOpenClawStore.getState().continueCampaignFollowups();
    });

    await waitFor(() => {
      expect(screen.getByText("Något gick fel. Försök igen.")).toBeTruthy();
    });
    expect(projects.createProject).toHaveBeenCalledTimes(1);
    unmount();

    act(() => {
      useOpenClawStore.setState({
        campaignScript: {
          ...emptyCampaignScript("zax-2-0-ab"),
          projectId: "proj-a",
        },
      });
    });
    projects.createProject.mockImplementation(async () => ({
      id: "proj-b",
      name: "Other - Kostnadsfri",
      created_at: "",
      updated_at: "",
    }));
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({ promptId: "prompt_other" }),
    }));

    render(<KostnadsfriPage slug="other-campaign" companyName="Other AB" />);
    fireEvent.click(screen.getByRole("button", { name: "Öppna wizard" }));
    fireEvent.click(screen.getByRole("button", { name: "Klara wizarden" }));

    await act(async () => {
      useOpenClawStore.getState().continueCampaignFollowups();
    });

    await waitFor(() => {
      expect(projects.createProject).toHaveBeenCalledTimes(2);
    });
    expect(useOpenClawStore.getState().campaignScript?.slug).toBe("other-campaign");
    expect(useOpenClawStore.getState().campaignScript?.projectId).toBe("proj-b");
    expect(useOpenClawStore.getState().campaignScript?.projectId).not.toBe("proj-a");
  });

  it("lägger unik bekräftad fras i handoff-prompten", async () => {
    render(<KostnadsfriPage slug="zax-2-0-ab" companyName="Zax 2.0 AB" />);
    fireEvent.click(screen.getByRole("button", { name: "Öppna wizard" }));
    fireEvent.click(screen.getByRole("button", { name: "Klara wizarden" }));

    await screen.findByText(/Vad skiljer er från konkurrenterna/);

    await act(async () => {
      useOpenClawStore.getState().recordCampaignFollowupReply("SM-F1-CONFIRM-PHRASE-7f3a");
      useOpenClawStore.getState().continueCampaignFollowups();
    });

    await waitFor(() => {
      expect(projects.createProject).toHaveBeenCalledTimes(1);
    });

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const promptCall = fetchMock.mock.calls.find((call) => String(call[0]).includes("/api/prompts"));
    expect(promptCall).toBeTruthy();
    const body = JSON.parse(String(promptCall?.[1]?.body ?? "{}")) as {
      prompt?: string;
      wizardSnapshot?: { industryId?: string | null; followupOverrodeIndustry?: boolean };
    };
    expect(body.prompt).toContain("SM-F1-CONFIRM-PHRASE-7f3a");
    expect(body.wizardSnapshot?.industryId).toBe("health");
    expect(body.wizardSnapshot?.followupOverrodeIndustry).toBe(false);
  });

  it("hämtar sessionen så Google-retur kan starta precis ett bygge", async () => {
    persistPendingInitBuild({
      slug: "zax-2-0-ab",
      wizardData: fixtures.f1Wizard,
      ready: true,
    });
    auth.isAuthenticated = false;
    auth.isInitialized = false;

    const { rerender } = render(
      <KostnadsfriPage slug="zax-2-0-ab" companyName="Zax 2.0 AB" />,
    );

    await waitFor(() => {
      expect(auth.fetchUser).toHaveBeenCalled();
    });
    expect(projects.createProject).not.toHaveBeenCalled();
    expect(screen.getByText("Ett konto behövs för att bygga hemsidan")).toBeTruthy();

    auth.isAuthenticated = true;
    auth.isInitialized = true;
    rerender(<KostnadsfriPage slug="zax-2-0-ab" companyName="Zax 2.0 AB" />);

    await waitFor(() => {
      expect(projects.createProject).toHaveBeenCalledTimes(1);
    });
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it("öppnar inloggning efter e-postretur när sessionen saknas", async () => {
    persistPendingInitBuild({
      slug: "zax-2-0-ab",
      wizardData: fixtures.f1Wizard,
      ready: true,
    });
    auth.isAuthenticated = false;
    auth.isInitialized = false;

    const { rerender } = render(
      <KostnadsfriPage slug="zax-2-0-ab" companyName="Zax 2.0 AB" />,
    );

    await waitFor(() => {
      expect(auth.fetchUser).toHaveBeenCalled();
    });

    auth.isInitialized = true;
    rerender(<KostnadsfriPage slug="zax-2-0-ab" companyName="Zax 2.0 AB" />);

    await waitFor(() => {
      expect(screen.getByText("Logga in för att bygga hemsidan")).toBeTruthy();
    });
    expect(projects.createProject).not.toHaveBeenCalled();
  });
});

describe("KostnadsfriPage — wizard-underlag i kontexten", () => {
  beforeEach(() => {
    fixtures.completeWith = "preview";
    auth.isAuthenticated = true;
    auth.isInitialized = true;
    auth.fetchUser.mockReset();
    auth.fetchUser.mockResolvedValue(undefined);
    router.push.mockReset();
    projects.createProject.mockReset();
    clearPendingInitBuildStorageForTests();
    clearCampaignScriptStorageForTests();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ promptId: "prompt_1" }),
      })),
    );
    act(() => {
      useOpenClawStore.setState({
        campaignScript: emptyCampaignScript("zax-2-0-ab"),
      });
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    clearCampaignScriptStorageForTests();
    clearPendingInitBuildStorageForTests();
    delete window.__SITEMASKIN_CONTEXT;
  });

  it("behåller wizard-svaren när projekt-handoffen misslyckas före projectId", async () => {
    projects.createProject.mockRejectedValue(new Error("projektfel"));

    render(<KostnadsfriPage slug="zax-2-0-ab" companyName="Zax 2.0 AB" />);

    fireEvent.click(screen.getByRole("button", { name: "Öppna wizard" }));
    fireEvent.click(screen.getByRole("button", { name: "Klara wizarden" }));

    expect(screen.getByText("Följdfrågor")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fortsätt" })).toBeTruthy();

    await act(async () => {
      useOpenClawStore.getState().continueCampaignFollowups();
    });

    await waitFor(() => {
      expect(screen.getByText("Något gick fel. Försök igen.")).toBeTruthy();
    });

    const brief = window.__SITEMASKIN_CONTEXT?.kostnadsfriBrief as {
      stage?: string;
      purposeLabels?: string[];
    };

    expect(brief.stage).toBe("handoff");
    expect(brief.purposeLabels).toEqual(["Bokningar", "Leads"]);
  });
});
