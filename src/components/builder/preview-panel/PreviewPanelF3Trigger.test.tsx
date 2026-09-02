import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewPanelF3Trigger } from "./PreviewPanelF3Trigger";
import {
  F3_REBUILD_REQUEST_EVENT,
  dispatchVersionStatusRefreshed,
} from "@/lib/builder/project-env-events";

vi.mock("sonner", () => {
  throw new Error("F3 trigger must not use Sonner.");
});

const PASSED_ERROR_LOG = {
  logs: [
    {
      category: "product_postcheck.summary",
      meta: { verdict: "passed", productBlocked: false },
      created_at: "2026-08-15T10:00:00.000Z",
    },
  ],
};

async function waitForF3Enabled() {
  await waitFor(() => {
    expect(screen.getByRole("button", { name: /bygg integrationer/i })).toHaveProperty(
      "disabled",
      false,
    );
  });
}

describe("PreviewPanelF3Trigger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets a newer passing Product Postcheck summary override an older blocker", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        logs: [
          {
            category: "product_postcheck.summary",
            meta: { productBlocked: false },
            created_at: "2026-08-15T10:01:00.000Z",
          },
          {
            category: "product_postcheck.summary",
            meta: { productBlocked: true },
            created_at: "2026-08-15T10:00:00.000Z",
          },
        ],
      }),
    );
    vi.stubGlobal(
      "fetch",
      fetchMock,
    );

    render(<PreviewPanelF3Trigger chatId="chat_1" versionId="ver_f2" />);

    const button = screen.getByRole("button", { name: /bygg integrationer/i });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(button).toHaveProperty("disabled", false);
  });

  it("lets a newer blocking Product Postcheck summary override an older pass", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          logs: [
            {
              category: "product_postcheck.summary",
              meta: { productBlocked: false },
              created_at: "2026-08-15T10:00:00.000Z",
            },
            {
              category: "product_postcheck.summary",
              meta: { productBlocked: true },
              created_at: "2026-08-15T10:01:00.000Z",
            },
          ],
        }),
      ),
    );

    render(<PreviewPanelF3Trigger chatId="chat_1" versionId="ver_f2" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /bygg integrationer/i })).toHaveProperty(
        "disabled",
        true,
      );
    });
  });

  it("refetches on the existing version-status signal and unblocks after a later pass", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          logs: [
            {
              category: "product_postcheck.summary",
              meta: { productBlocked: true },
              created_at: "2026-08-15T10:00:00.000Z",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          logs: [
            {
              category: "product_postcheck.summary",
              meta: { productBlocked: false },
              created_at: "2026-08-15T10:01:00.000Z",
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<PreviewPanelF3Trigger chatId="chat_1" versionId="ver_f2" />);
    const button = screen.getByRole("button", { name: /bygg integrationer/i });
    await waitFor(() => expect(button).toHaveProperty("disabled", true));

    act(() => dispatchVersionStatusRefreshed());

    await waitFor(() => {
      expect(button).toHaveProperty("disabled", false);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  it("refetches on the version-status signal and applies a later blocker", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          logs: [
            {
              category: "product_postcheck.summary",
              meta: { productBlocked: false },
              created_at: "2026-08-15T10:00:00.000Z",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          logs: [
            {
              category: "product_postcheck.summary",
              meta: { productBlocked: true },
              created_at: "2026-08-15T10:01:00.000Z",
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<PreviewPanelF3Trigger chatId="chat_1" versionId="ver_f2" />);
    const button = screen.getByRole("button", { name: /bygg integrationer/i });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => dispatchVersionStatusRefreshed());

    await waitFor(() => {
      expect(button).toHaveProperty("disabled", true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  it("shows a specific stale-version warning when finalize-design rejects an old F2 base", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/error-log")) {
        return Response.json(PASSED_ERROR_LOG);
      }
      if (url.includes("/finalize-design")) {
        return Response.json(
          {
            ready: false,
            reason: "stale_design_version",
            requestedVersionId: "ver_old",
            latestVersionId: "ver_new",
            message:
              "En nyare designversion finns. Välj den senaste versionen innan du bygger integrationer.",
          },
          { status: 409 },
        );
      }
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const onReady = vi.fn();
    const onStatus = vi.fn();

    render(
      <PreviewPanelF3Trigger
        chatId="chat_1"
        versionId="ver_old"
        onReady={onReady}
        onStatus={onStatus}
      />,
    );

    await waitForF3Enabled();
    fireEvent.click(screen.getByRole("button", { name: /bygg integrationer/i }));

    await waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith({
        tone: "warning",
        title: "Nyare designversion finns",
        description:
          "En nyare designversion finns. Välj den senaste versionen innan du bygger integrationer.",
        // The verdict names the version it judged so the builder's status row
        // opens THAT version's diagnostics (bugbot on #639).
        versionId: "ver_old",
      });
    });
    expect(onReady).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("forwards a 412's exact server requirements without a status notification", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/error-log")) return Response.json(PASSED_ERROR_LOG);
        if (url.includes("/finalize-design")) {
          return Response.json(
            {
              ready: false,
              parentVersionId: "ver_design",
              projectId: "project_1",
              missingByIntegration: [
                { key: "stripe", name: "Stripe", missing: ["STRIPE_SECRET_KEY"] },
              ],
            },
            { status: 412 },
          );
        }
        return Response.json({}, { status: 404 });
      }),
    );
    const onMissingEnv = vi.fn();
    const onStatus = vi.fn();

    render(
      <PreviewPanelF3Trigger
        chatId="chat_1"
        versionId="ver_design"
        onMissingEnv={onMissingEnv}
        onStatus={onStatus}
      />,
    );

    await waitForF3Enabled();
    fireEvent.click(screen.getByRole("button", { name: /bygg integrationer/i }));

    await waitFor(() => {
      expect(onMissingEnv).toHaveBeenCalledWith({
        parentVersionId: "ver_design",
        projectId: "project_1",
        // Chat correlation + verdict timestamp: captured at request time so
        // a slow 412 from a previous chat cannot repopulate the surface, and
        // saves made during the request survive the verdict pruning.
        chatId: "chat_1",
        requestStartedAt: expect.any(Number),
        missingByIntegration: [
          { key: "stripe", name: "Stripe", missing: ["STRIPE_SECRET_KEY"] },
        ],
      });
    });
    expect(onStatus).not.toHaveBeenCalled();
  });

  it("retries against the requirements surface parent version", async () => {
    const requestedBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/error-log")) return Response.json(PASSED_ERROR_LOG);
        if (url.includes("/finalize-design")) {
          requestedBodies.push(
            JSON.parse(String(init?.body)) as Record<string, unknown>,
          );
          return Response.json({
            ready: true,
            parentVersionId: "ver_required_parent",
            requirements: [],
            streamMeta: {
              lifecycleStage: "integrations",
              parentVersionId: "ver_required_parent",
            },
          });
        }
        return Response.json({}, { status: 404 });
      }),
    );

    render(
      <PreviewPanelF3Trigger
        chatId="chat_1"
        versionId="ver_transient_active"
      />,
    );
    await waitForF3Enabled();
    act(() => {
      window.dispatchEvent(
        new CustomEvent(F3_REBUILD_REQUEST_EVENT, {
          detail: { versionId: "ver_required_parent" },
        }),
      );
    });

    await waitFor(() => {
      expect(requestedBodies).toContainEqual({
        versionId: "ver_required_parent",
      });
    });
  });

  it("runs ReleaseGate on the exact F2 version without starting an F3 LLM round", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/error-log")) {
        return Response.json(PASSED_ERROR_LOG);
      }
      if (url.includes("/finalize-design")) {
        return Response.json({
          ready: true,
          action: "deterministic_release",
          parentVersionId: "ver_f2",
          versionId: "ver_f3",
          lifecycleStage: "integrations",
          gateRequired: true,
          releaseState: "draft",
          verificationState: "pending",
          requirements: [
            {
              key: "openai",
              name: "OpenAI",
              requiredRealEnvKeys: [],
            },
          ],
        });
      }
      if (url.includes("/quality-gate")) {
        return Response.json({
          passed: true,
          promoted: true,
          checks: [
            { check: "typecheck", passed: true },
            { check: "build", passed: true },
            { check: "lint", passed: true },
          ],
        });
      }
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const onReady = vi.fn();
    const onReleaseSettled = vi.fn();
    const onStatus = vi.fn();

    render(
      <PreviewPanelF3Trigger
        chatId="chat_1"
        versionId="ver_f2"
        onReady={onReady}
        onReleaseSettled={onReleaseSettled}
        onStatus={onStatus}
      />,
    );

    await waitForF3Enabled();
    fireEvent.click(screen.getByRole("button", { name: /bygg integrationer/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/engine/chats/chat_1/quality-gate",
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(onReady).not.toHaveBeenCalled();

    const qualityGateCall = fetchMock.mock.calls.find(([input]) =>
      String(input).includes("/quality-gate"),
    );
    expect(qualityGateCall).toBeDefined();
    const qualityGateBody = JSON.parse(String(qualityGateCall?.[1]?.body));
    expect(qualityGateBody).toEqual({
      versionId: "ver_f3",
      gate: "integrationsBuild",
      checks: ["typecheck", "build"],
    });
    expect(onReleaseSettled).toHaveBeenCalledWith({
      versionId: "ver_f3",
      selectVersion: true,
    });
    expect(onStatus).toHaveBeenCalledWith({
      tone: "info",
      title: "ReleaseGate startar",
      description: "Kontrollerar den deterministiska integrationsversionen innan promotion.",
      versionId: "ver_f2",
    });
    // The promoted F3 fork is the version the gate judged — not the F2 base
    // the run started from. Lucka 3 (ägarbeslut 2026-08-11): "ReleaseGate
    // godkänd" was gate-speak — the title falls back to a counts-free honest
    // phrase (never the grind's name); `usesLiveDossierCounts` asks the shell
    // layer to swap in a counts-based title once ITS fresher, version-scoped
    // counts are available (Bugbot, 5th pass on this diff).
    expect(onStatus).toHaveBeenCalledWith({
      tone: "success",
      title: "Integrationsbygget är klart",
      usesLiveDossierCounts: true,
      description: expect.stringContaining("exakt samma filer"),
      versionId: "ver_f3",
    });

    vi.unstubAllGlobals();
  });

  // Bugbot, 5th pass on this diff: this component has no reliable dossier
  // counts for `result.versionId` (the just-created/promoted F3 version) —
  // only ever the OLD parent version's, fetched before this exact click. It
  // now always reports the counts-free title plus a marker
  // (`usesLiveDossierCounts`) so the shell layer (`use-f3-tips-chrome.ts`,
  // `resolveF3StatusTitle`) can re-derive the real title from ITS fresher
  // `dossierCounts` once that describes this version — see
  // `project-env-events.test.ts` for that half of the contract.
  it("lucka 3 (ägarbeslut 2026-08-11): reports a counts-free title + usesLiveDossierCounts marker, never a stale count", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/error-log")) return Response.json(PASSED_ERROR_LOG);
        if (url.includes("/finalize-design")) {
          return Response.json({
            ready: true,
            action: "deterministic_release",
            parentVersionId: "ver_f2",
            versionId: "ver_f3",
            gateRequired: true,
            releaseState: "draft",
            verificationState: "pending",
          });
        }
        if (url.includes("/quality-gate")) {
          return Response.json({ passed: true, promoted: true });
        }
        return Response.json({}, { status: 404 });
      }),
    );
    const onStatus = vi.fn();

    render(<PreviewPanelF3Trigger chatId="chat_1" versionId="ver_f2" onStatus={onStatus} />);

    await waitForF3Enabled();
    fireEvent.click(screen.getByRole("button", { name: /bygg integrationer/i }));

    await waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          tone: "success",
          title: "Integrationsbygget är klart",
          usesLiveDossierCounts: true,
          versionId: "ver_f3",
        }),
      );
    });
    vi.unstubAllGlobals();
  });

  it("lucka 3: merges the 'already promoted' outcome into the same counts-aware title contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/error-log")) return Response.json(PASSED_ERROR_LOG);
        if (url.includes("/finalize-design")) {
          return Response.json({
            ready: true,
            action: "deterministic_release",
            parentVersionId: "ver_f2",
            versionId: "ver_f3",
            gateRequired: false,
            releaseState: "promoted",
            verificationState: "passed",
          });
        }
        return Response.json({}, { status: 404 });
      }),
    );
    const onStatus = vi.fn();

    render(<PreviewPanelF3Trigger chatId="chat_1" versionId="ver_f2" onStatus={onStatus} />);

    await waitForF3Enabled();
    fireEvent.click(screen.getByRole("button", { name: /bygg integrationer/i }));

    // Same title contract as a fresh ReleaseGate pass — "redan godkänd" was
    // an implementation detail the user never needed to distinguish.
    await waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          tone: "success",
          title: "Integrationsbygget är klart",
          usesLiveDossierCounts: true,
        }),
      );
    });
    expect(onStatus).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining("ReleaseGate") }),
    );
    vi.unstubAllGlobals();
  });

  it("keeps build-key specs on the existing F3 LLM onReady path", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/error-log")) return Response.json(PASSED_ERROR_LOG);
        if (url.includes("/finalize-design")) {
          return Response.json({
            ready: true,
            parentVersionId: "ver_f2",
            requirements: [
              {
                key: "clerk",
                name: "Clerk",
                requiredRealEnvKeys: ["CLERK_SECRET_KEY"],
              },
            ],
            streamMeta: {
              lifecycleStage: "integrations",
              parentVersionId: "ver_f2",
            },
          });
        }
        return Response.json({}, { status: 404 });
      }),
    );
    const onReady = vi.fn();
    const onReleaseSettled = vi.fn();
    const onStatus = vi.fn();
    render(
      <PreviewPanelF3Trigger
        chatId="chat_1"
        versionId="ver_f2"
        onReady={onReady}
        onReleaseSettled={onReleaseSettled}
        onStatus={onStatus}
      />,
    );

    await waitForF3Enabled();
    fireEvent.click(screen.getByRole("button", { name: /bygg integrationer/i }));

    await waitFor(() => {
      expect(onReady).toHaveBeenCalledWith({
        parentVersionId: "ver_f2",
        requirements: [
          expect.objectContaining({ requiredRealEnvKeys: ["CLERK_SECRET_KEY"] }),
        ],
      });
    });
    expect(onReleaseSettled).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith({
      tone: "success",
      title: "Integrationsbygget startar",
      description: "Integrationsbygget startar nu utifrån den finaliserade designversionen.",
      versionId: "ver_f2",
    });
    vi.unstubAllGlobals();
  });

  it.each([
    {
      label: "superseded",
      gate: { passed: true, promoted: false, superseded: true },
      status: 200,
      expected: "Integrationsversionen ersattes av en nyare version",
    },
    {
      label: "promote error",
      gate: { passed: false, promoted: false, promoteError: true },
      status: 200,
      expected: "ReleaseGate väntar på ett nytt försök",
    },
    {
      label: "version busy retry",
      gate: { code: "version_busy", error: "Version is busy" },
      status: 409,
      expected: "ReleaseGate väntar på ett nytt försök",
    },
    {
      label: "vm gate false",
      gate: { passed: true, promoted: true, vmGatePassed: false },
      status: 200,
      expected: "ReleaseGate behöver åtgärdas",
    },
  ])("refreshes lifecycle state and avoids success copy for $label", async ({ gate, status, expected }) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/error-log")) return Response.json(PASSED_ERROR_LOG);
        if (url.includes("/finalize-design")) {
          return Response.json({
            ready: true,
            action: "deterministic_release",
            parentVersionId: "ver_f2",
            versionId: "ver_f3",
            gateRequired: true,
            releaseState: "draft",
            verificationState: "pending",
          });
        }
        if (url.includes("/quality-gate")) return Response.json(gate, { status });
        return Response.json({}, { status: 404 });
      }),
    );
    const onReleaseSettled = vi.fn();
    const onStatus = vi.fn();
    render(
      <PreviewPanelF3Trigger
        chatId="chat_1"
        versionId="ver_f2"
        onReleaseSettled={onReleaseSettled}
        onStatus={onStatus}
      />,
    );

    await waitForF3Enabled();
    fireEvent.click(screen.getByRole("button", { name: /bygg integrationer/i }));

    await waitFor(() => {
      expect(onReleaseSettled).toHaveBeenCalledWith({
        versionId: "ver_f3",
        selectVersion: !("superseded" in gate && gate.superseded === true),
      });
      expect(onStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expected,
        }),
      );
    });
    vi.unstubAllGlobals();
  });

  it("(a) saknad summary håller knappen disabled (pending, aldrig pass)", async () => {
    const fetchMock = vi.fn(async () => Response.json({ logs: [] }));
    vi.stubGlobal("fetch", fetchMock);
    render(<PreviewPanelF3Trigger chatId="chat_1" versionId="ver_f2" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /bygg integrationer/i })).toHaveProperty(
      "disabled",
      true,
    );
    vi.unstubAllGlobals();
  });

  it("(b) DB/fetch-fel är indeterminate och blockerar F3", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<PreviewPanelF3Trigger chatId="chat_1" versionId="ver_f2" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /bygg integrationer/i })).toHaveProperty(
      "disabled",
      true,
    );
    vi.unstubAllGlobals();
  });

  it("(d) blocked persisterad håller knappen disabled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          logs: [
            {
              category: "product_postcheck.summary",
              meta: { verdict: "blocked", productBlocked: true },
              created_at: "2026-08-15T10:00:00.000Z",
            },
          ],
        }),
      ),
    );
    render(<PreviewPanelF3Trigger chatId="chat_1" versionId="ver_f2" />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /bygg integrationer/i })).toHaveProperty(
        "disabled",
        true,
      );
    });
    vi.unstubAllGlobals();
  });

  it("(e) passed persisterad släpper F3-knappen", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(PASSED_ERROR_LOG)));
    render(<PreviewPanelF3Trigger chatId="chat_1" versionId="ver_f2" />);
    await waitForF3Enabled();
    vi.unstubAllGlobals();
  });

  it("(g) superseded håller knappen disabled (retry, aldrig pass)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          logs: [
            {
              category: "product_postcheck.summary",
              meta: { verdict: "superseded" },
              created_at: "2026-08-15T10:00:00.000Z",
            },
          ],
        }),
      ),
    );
    render(<PreviewPanelF3Trigger chatId="chat_1" versionId="ver_f2" />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /bygg integrationer/i })).toHaveProperty(
        "disabled",
        true,
      );
    });
    vi.unstubAllGlobals();
  });
});
