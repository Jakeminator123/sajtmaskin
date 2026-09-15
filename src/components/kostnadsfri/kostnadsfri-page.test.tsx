// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    <button
      type="button"
      onClick={() =>
        onSuccess({
          slug: "zax-2-0-ab",
          companyName: "Zax 2.0 AB",
          industry: "health",
          website: null,
          contactEmail: null,
          contactName: "Jan",
          openclawConfig: null,
          profile: null,
        })
      }
    >
      Öppna wizard
    </button>
  ),
}));

const wizardFixture: MiniWizardData = {
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

vi.mock("./mini-wizard", () => ({
  MiniWizard: ({ onComplete }: { onComplete: (data: MiniWizardData) => void }) => (
    <button type="button" onClick={() => onComplete(wizardFixture)}>
      Klara wizarden
    </button>
  ),
}));

vi.mock("./thinking-spinner", () => ({
  ThinkingSpinner: () => <div>Bygger förslaget</div>,
}));

describe("KostnadsfriPage — F1 wait then one build", () => {
  beforeEach(() => {
    router.push.mockReset();
    projects.createProject.mockClear();
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
    vi.unstubAllGlobals();
    vi.useRealTimers();
    clearCampaignScriptStorageForTests();
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
