import { afterEach, describe, expect, it, vi } from "vitest";
import { runF3FinalizeAction } from "./f3-finalize-action";
import { isF3FinalizeActive, resetF3FinalizeActivity } from "./repair-blocked";

afterEach(() => {
  vi.unstubAllGlobals();
  resetF3FinalizeActivity();
});

describe("runF3FinalizeAction — reparationsgrind", () => {
  it("håller grinden stängd under körningen och öppnar den efteråt", async () => {
    let activeDuringCall: boolean | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        activeDuringCall = isF3FinalizeActive();
        return new Response(JSON.stringify({ ready: true, parentVersionId: "ver_f2" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    await runF3FinalizeAction({ chatId: "chat_1", parentVersionId: "ver_f2" });

    expect(activeDuringCall).toBe(true);
    expect(isF3FinalizeActive()).toBe(false);
  });

  it("öppnar grinden även när nätverksanropet kastar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("boom");
      }),
    );

    const result = await runF3FinalizeAction({ chatId: "chat_1", parentVersionId: "ver_f2" });

    expect(result.kind).toBe("error");
    expect(isF3FinalizeActive()).toBe(false);
  });
});

describe("runF3FinalizeAction", () => {
  it("runs ReleaseGate on the deterministic F3 fork and requires promotion", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          ready: true,
          action: "deterministic_release",
          parentVersionId: "ver_f2",
          versionId: "ver_f3",
          gateRequired: true,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          passed: true,
          promoted: true,
          vmGatePassed: true,
          superseded: false,
          checks: [],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await runF3FinalizeAction({
      chatId: "chat_1",
      parentVersionId: "ver_f2",
    });

    expect(result).toMatchObject({
      kind: "deterministic_release",
      ok: true,
      versionId: "ver_f3",
      promoted: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns an already promoted fork without rerunning ReleaseGate", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        ready: true,
        action: "deterministic_release",
        parentVersionId: "ver_f2",
        versionId: "ver_f3",
        gateRequired: false,
        releaseState: "promoted",
        verificationState: "passed",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await runF3FinalizeAction({
      chatId: "chat_1",
      parentVersionId: "ver_f2",
    });

    expect(result).toMatchObject({
      kind: "deterministic_release",
      ok: true,
      alreadyPromoted: true,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("maps a ReleaseGate env race back to the persistent requirements surface", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          ready: true,
          action: "deterministic_release",
          parentVersionId: "ver_f2",
          versionId: "ver_f3",
          gateRequired: true,
        }),
      )
      .mockResolvedValueOnce(
        Response.json(
          {
            error: "tier3_env_not_ready",
            projectId: "project_1",
            missingByIntegration: [
              {
                key: "clerk",
                name: "Clerk",
                missing: ["CLERK_SECRET_KEY"],
              },
            ],
          },
          { status: 412 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await runF3FinalizeAction({
      chatId: "chat_1",
      parentVersionId: "ver_f2",
    });

    expect(result).toEqual({
      kind: "missing_env",
      parentVersionId: "ver_f2",
      projectId: "project_1",
      missingByIntegration: [
        {
          key: "clerk",
          name: "Clerk",
          missing: ["CLERK_SECRET_KEY"],
        },
      ],
    });
  });
});
