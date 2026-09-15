// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KostnadsfriCompanyData, MiniWizardData } from "@/lib/kostnadsfri";
import {
  clearCampaignScriptStorageForTests,
  emptyCampaignScript,
} from "@/lib/kostnadsfri/agent-campaign-script";
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
    router.push.mockReset();
    projects.createProject.mockReset();
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
    delete window.__SITEMASKIN_CONTEXT;
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
    fireEvent.click(screen.getByRole("button", { name: "Öppna wizard" }));
    fireEvent.click(screen.getByRole("button", { name: "Klara wizarden" }));

    await act(async () => {
      useOpenClawStore.getState().continueCampaignFollowups();
    });

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
    const body = JSON.parse(String(promptCall?.[1]?.body ?? "{}")) as { prompt?: string };
    expect(body.prompt).toContain("SM-F1-CONFIRM-PHRASE-7f3a");
  });
});

describe("KostnadsfriPage — wizard-underlag i kontexten", () => {
  beforeEach(() => {
    fixtures.completeWith = "preview";
    router.push.mockReset();
    projects.createProject.mockReset();
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
    delete window.__SITEMASKIN_CONTEXT;
  });

  it("rensar wizard-underlaget i kontexten när projekt-handoffen misslyckas före projectId", async () => {
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
      businessDescription?: string;
      businessDescriptionSource?: string;
      purposeLabels?: string[];
    };

    expect(brief.stage).toBe("wizard");
    expect(brief.businessDescription).toBe(
      "Bolaget skall bedriva frisörverksamhet samt därmed förenlig verksamhet.",
    );
    expect(brief.businessDescriptionSource).toBe("register");
    expect(brief.purposeLabels).toBeUndefined();
  });

  // Bolagsdatan bär radens slug (`zax-2-0-ab`) när syskonraden träffades, men
  // kvittot från verify är bundet till URL-sluggen. Skickas radens slug som
  // inbjudan får kunden 403 på ett korrekt lösenord.
  it("löser inbjudan mot URL-sluggen även när bolagsdatan bär syskonsluggen", async () => {
    projects.createProject.mockResolvedValue({
      id: "proj-syskon",
      name: "Zax - Kostnadsfri",
      created_at: "",
      updated_at: "",
    });
    act(() => {
      useOpenClawStore.setState({ campaignScript: emptyCampaignScript("zax-2-0") });
    });

    render(<KostnadsfriPage slug="zax-2-0" companyName="Zax 2.0 AB" />);
    fireEvent.click(screen.getByRole("button", { name: "Öppna wizard" }));
    fireEvent.click(screen.getByRole("button", { name: "Klara wizarden" }));

    await act(async () => {
      useOpenClawStore.getState().continueCampaignFollowups();
    });

    await waitFor(() => {
      expect(projects.createProject).toHaveBeenCalledTimes(1);
    });

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const promptCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("/api/prompts"),
    );
    expect(promptCall).toBeTruthy();
    expect(JSON.parse(String(promptCall?.[1]?.body ?? "{}"))).toMatchObject({
      source: "kostnadsfri",
      kostnadsfriSlug: "zax-2-0",
    });
  });
});
