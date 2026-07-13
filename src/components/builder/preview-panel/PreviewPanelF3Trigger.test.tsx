import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewPanelF3Trigger } from "./PreviewPanelF3Trigger";
import { F3_REBUILD_REQUEST_EVENT } from "@/lib/builder/project-env-events";

vi.mock("sonner", () => {
  throw new Error("F3 trigger must not use Sonner.");
});

describe("PreviewPanelF3Trigger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a specific stale-version warning when finalize-design rejects an old F2 base", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/error-log")) {
        return Response.json({ logs: [] });
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

    fireEvent.click(screen.getByRole("button", { name: /bygg integrationer/i }));

    await waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith({
        tone: "warning",
        title: "Nyare designversion finns",
        description:
          "En nyare designversion finns. Välj den senaste versionen innan du bygger integrationer.",
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
        if (url.includes("/error-log")) return Response.json({ logs: [] });
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
        if (url.includes("/error-log")) return Response.json({ logs: [] });
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
        return Response.json({ logs: [] });
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
      checks: ["typecheck", "build", "lint"],
    });
    expect(onReleaseSettled).toHaveBeenCalledWith({
      versionId: "ver_f3",
      selectVersion: true,
    });
    expect(onStatus).toHaveBeenCalledWith({
      tone: "info",
      title: "ReleaseGate startar",
      description: "Kontrollerar den deterministiska F3-versionen innan promotion.",
    });
    expect(onStatus).toHaveBeenCalledWith({
      tone: "success",
      title: "ReleaseGate godkänd",
      description: expect.stringContaining("exakt samma filer"),
    });

    vi.unstubAllGlobals();
  });

  it("keeps build-key specs on the existing F3 LLM onReady path", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/error-log")) return Response.json({ logs: [] });
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
      description: "F3 byggs nu utifrån den finaliserade designversionen.",
    });
    vi.unstubAllGlobals();
  });

  it.each([
    {
      label: "superseded",
      gate: { passed: true, promoted: false, superseded: true },
      status: 200,
      expected: "F3-versionen ersattes av en nyare version",
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
        if (url.includes("/error-log")) return Response.json({ logs: [] });
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
});
