import { describe, expect, it } from "vitest";
import {
  buildChatReadiness,
  projectLateClientErrorReadiness,
  projectProductPostcheckReadiness,
  type ChatReadinessInfo,
  type LateClientErrorReadinessLog,
  type ProductPostcheckReadinessLog,
} from "./chat-readiness";
import { PREVIEW_CLIENT_ERROR_CATEGORY } from "./builder/preview-client-error-report";

const emptyInfo: ChatReadinessInfo = {
  versionId: "ver_1",
  requiredEnvKeys: [],
  configuredEnvKeys: [],
  missingEnvKeys: [],
};

function log(
  category: string,
  message: string,
  meta: Record<string, unknown> = {},
  createdAt: string,
): ProductPostcheckReadinessLog {
  return { category, message, meta, created_at: createdAt };
}

describe("projectProductPostcheckReadiness", () => {
  it("exposes finding rows from the newest summary as advisory warnings", () => {
    const projection = projectProductPostcheckReadiness([
      log("product_postcheck.fake_form", "Formulär ser aktivt ut men saknar action/integration.", {
        code: "fake_form",
        formId: "kontakt",
      }, "2026-08-14T10:00:02Z"),
      log("product_postcheck.summary", "F2 Product Postcheck found 1 warning(s).", {
        warningCount: 1,
        productBlocked: false,
      }, "2026-08-14T10:00:01Z"),
    ]);

    expect(projection.blocksF3).toBe(false);
    expect(projection.blockedReason).toBeNull();
    expect(projection.warnings).toEqual([
      expect.objectContaining({
        id: "product-postcheck-fake_form",
        title: "Formulär ser aktivt ut men saknar action/integration.",
        detail: "kontakt",
        severity: "warning",
        category: "advisory",
        action: "preview",
      }),
    ]);
  });

  it("sets the F3-blocked flag and warning when productBlocked is true", () => {
    const projection = projectProductPostcheckReadiness([
      log(
        "product_postcheck.mobile_menu_failed",
        "Mobilmeny kunde inte verifieras: no toggle found.",
        { code: "mobile_menu_failed" },
        "2026-08-14T10:00:02Z",
      ),
      log("product_postcheck.summary", "F2 Product Postcheck found 1 warning(s).", {
        warningCount: 1,
        productBlocked: true,
      }, "2026-08-14T10:00:01Z"),
    ]);

    expect(projection.blocksF3).toBe(true);
    expect(projection.blockedReason).toBe("Mobilmeny kunde inte verifieras: no toggle found.");
    expect(projection.warnings.map((item) => item.id)).toEqual([
      "product-postcheck-blocks-f3",
      "product-postcheck-mobile_menu_failed",
    ]);
    expect(projection.warnings[0]).toEqual(
      expect.objectContaining({
        id: "product-postcheck-blocks-f3",
        title: "Bygg integrationer är spärrat.",
        severity: "warning",
        category: "advisory",
      }),
    );
  });

  it("keeps advisory findings in warnings but omits them from the F3-blocked reason", () => {
    const projection = projectProductPostcheckReadiness([
      log(
        "product_postcheck.fake_form",
        "Formulär ser aktivt ut men saknar action/integration.",
        { code: "fake_form" },
        "2026-08-14T10:00:03Z",
      ),
      log(
        "product_postcheck.mobile_menu_failed",
        "Mobilmeny kunde inte verifieras: no toggle found.",
        { code: "mobile_menu_failed" },
        "2026-08-14T10:00:02Z",
      ),
      log("product_postcheck.summary", "F2 Product Postcheck found 2 warning(s).", {
        warningCount: 2,
        productBlocked: true,
      }, "2026-08-14T10:00:01Z"),
    ]);

    expect(projection.blocksF3).toBe(true);
    expect(projection.blockedReason).toBe("Mobilmeny kunde inte verifieras: no toggle found.");
    expect(projection.blockedReason).not.toContain("Formulär");
    expect(projection.warnings[0]?.detail).toBe(projection.blockedReason);
    expect(projection.warnings.map((item) => item.id)).toEqual([
      "product-postcheck-blocks-f3",
      "product-postcheck-fake_form",
      "product-postcheck-mobile_menu_failed",
    ]);
  });

  it("includes broken_anchor in the F3 reason only at the blocking threshold", () => {
    const twoAnchors = projectProductPostcheckReadiness([
      log("product_postcheck.fake_form", "Formulär ser aktivt ut men saknar action/integration.", {
        code: "fake_form",
      }, "2026-08-14T10:00:04Z"),
      log("product_postcheck.broken_anchor", "Trasig länk: #b.", { code: "broken_anchor", href: "#b" }, "2026-08-14T10:00:03Z"),
      log("product_postcheck.broken_anchor", "Trasig länk: #a.", { code: "broken_anchor", href: "#a" }, "2026-08-14T10:00:02Z"),
      log("product_postcheck.summary", "F2 Product Postcheck found 3 warning(s).", {
        warningCount: 3,
        productBlocked: true,
      }, "2026-08-14T10:00:01Z"),
    ]);

    expect(twoAnchors.blocksF3).toBe(true);
    expect(twoAnchors.blockedReason).toContain("Trasig länk: #a.");
    expect(twoAnchors.blockedReason).toContain("Trasig länk: #b.");
    expect(twoAnchors.blockedReason).not.toContain("Formulär");

    const oneAnchor = projectProductPostcheckReadiness([
      log("product_postcheck.fake_form", "Formulär ser aktivt ut men saknar action/integration.", {
        code: "fake_form",
      }, "2026-08-14T10:00:03Z"),
      log("product_postcheck.broken_anchor", "Trasig länk: #a.", { code: "broken_anchor", href: "#a" }, "2026-08-14T10:00:02Z"),
      log("product_postcheck.summary", "F2 Product Postcheck found 2 warning(s).", {
        warningCount: 2,
        productBlocked: false,
      }, "2026-08-14T10:00:01Z"),
    ]);

    expect(oneAnchor.blocksF3).toBe(false);
    expect(oneAnchor.blockedReason).toBeNull();
    expect(oneAnchor.warnings.map((item) => item.id)).toEqual([
      "product-postcheck-fake_form",
      "product-postcheck-broken_anchor",
    ]);
  });

  it("uses the preview-boot finding in the F3 reason and omits advisory codes", () => {
    const projection = projectProductPostcheckReadiness([
      log(
        "product_postcheck.fake_form",
        "Formulär ser aktivt ut men saknar action/integration.",
        { code: "fake_form" },
        "2026-08-14T10:00:03Z",
      ),
      log(
        "product_postcheck.preview_boot_page",
        "Preview-host visar fortfarande start-/omstartssidan — sajten är inte ready än.",
        { code: "preview_boot_page" },
        "2026-08-14T10:00:02Z",
      ),
      log("product_postcheck.summary", "F2 Product Postcheck found 2 warning(s).", {
        warningCount: 2,
        productBlocked: true,
      }, "2026-08-14T10:00:01Z"),
    ]);

    expect(projection.blocksF3).toBe(true);
    expect(projection.blockedReason).toContain("start-/omstartssidan");
    expect(projection.blockedReason).not.toContain("Formulär");
  });

  it("håller preview_probe_unreadable som advisory och tar inte med den i F3-orsaken", () => {
    const projection = projectProductPostcheckReadiness([
      log(
        "product_postcheck.preview_probe_unreadable",
        "Produktkontrollen fick inget läsbart sidinnehåll och kan inte avgöra om sajten är klar.",
        { code: "preview_probe_unreadable" },
        "2026-08-14T10:00:02Z",
      ),
      log("product_postcheck.summary", "F2 Product Postcheck found 1 warning(s).", {
        warningCount: 1,
        productBlocked: false,
      }, "2026-08-14T10:00:01Z"),
    ]);

    expect(projection.blocksF3).toBe(false);
    expect(projection.blockedReason).toBeNull();
    expect(projection.warnings.map((item) => item.id)).toEqual([
      "product-postcheck-preview_probe_unreadable",
    ]);
    expect(projection.warnings[0]?.title).not.toMatch(/preview-host|startsidan|Startar preview/i);
  });

  it("returns empty warnings when there is no postcheck summary (unchanged)", () => {
    expect(
      projectProductPostcheckReadiness([
        log("preview", "Förhandsvisningen kraschade.", {}, "2026-08-14T10:00:00Z"),
      ]),
    ).toEqual({ warnings: [], blocksF3: false, blockedReason: null });
  });

  it("returns empty warnings for a clean passing summary", () => {
    expect(
      projectProductPostcheckReadiness([
        log("product_postcheck.summary", "F2 Product Postcheck passed.", {
          warningCount: 0,
          productBlocked: false,
        }, "2026-08-14T10:00:00Z"),
      ]),
    ).toEqual({ warnings: [], blocksF3: false, blockedReason: null });
  });

  it("ignores skipped rows and older-run findings after a later passing summary", () => {
    const projection = projectProductPostcheckReadiness([
      log("product_postcheck.summary", "F2 Product Postcheck passed.", {
        warningCount: 0,
        productBlocked: false,
      }, "2026-08-14T11:00:00Z"),
      log(
        "product_postcheck.mobile_menu_failed",
        "Mobilmeny kunde inte verifieras: stale.",
        { code: "mobile_menu_failed" },
        "2026-08-14T10:00:02Z",
      ),
      log("product_postcheck.summary", "F2 Product Postcheck found 1 warning(s).", {
        warningCount: 1,
        productBlocked: true,
      }, "2026-08-14T10:00:01Z"),
      log("product_postcheck.skipped", "F2 Product Postcheck skipped.", {
        skippedReason: "timeout",
      }, "2026-08-14T09:00:00Z"),
    ]);

    expect(projection).toEqual({ warnings: [], blocksF3: false, blockedReason: null });
  });
});

describe("buildChatReadiness + postcheck projection", () => {
  it("keeps canDeploy true when postcheck findings are warnings", () => {
    const projection = projectProductPostcheckReadiness([
      log(
        "product_postcheck.mobile_menu_failed",
        "Mobilmeny kunde inte verifieras: no toggle found.",
        { code: "mobile_menu_failed" },
        "2026-08-14T10:00:02Z",
      ),
      log("product_postcheck.summary", "F2 Product Postcheck found 1 warning(s).", {
        warningCount: 1,
        productBlocked: true,
      }, "2026-08-14T10:00:01Z"),
    ]);
    const readiness = buildChatReadiness({
      warnings: projection.warnings,
      info: {
        ...emptyInfo,
        productPostcheckBlocksF3: projection.blocksF3,
        productPostcheckBlockedReason: projection.blockedReason,
      },
    });

    expect(readiness.canDeploy).toBe(true);
    expect(readiness.blockers).toEqual([]);
    expect(readiness.status).toBe("warning");
    expect(readiness.info.productPostcheckBlocksF3).toBe(true);
  });

  it("stays ready with canDeploy true when there are no postcheck findings", () => {
    const projection = projectProductPostcheckReadiness([]);
    const readiness = buildChatReadiness({
      warnings: projection.warnings,
      info: {
        ...emptyInfo,
        productPostcheckBlocksF3: projection.blocksF3,
        productPostcheckBlockedReason: projection.blockedReason,
      },
    });

    expect(readiness.status).toBe("ready");
    expect(readiness.canDeploy).toBe(true);
    expect(readiness.warnings).toEqual([]);
    expect(readiness.info.productPostcheckBlocksF3).toBe(false);
  });
});

function clientErrorLog(
  message: string,
  createdAt: string,
  meta: Record<string, unknown> = { kind: "hydration", href: "/" },
): LateClientErrorReadinessLog {
  return {
    category: PREVIEW_CLIENT_ERROR_CATEGORY,
    message,
    meta,
    created_at: createdAt,
  };
}

const PROMOTED_AT = "2026-08-13T22:08:09.498Z";

describe("projectLateClientErrorReadiness", () => {
  it("exposes a post-promotion client-error as one advisory warning", () => {
    const warnings = projectLateClientErrorReadiness(
      [
        clientErrorLog(
          "[hydration] Text content does not match server-rendered HTML.",
          "2026-08-13T22:10:08.707Z",
          { kind: "hydration", href: "/" },
        ),
      ],
      PROMOTED_AT,
    );

    expect(warnings).toEqual([
      expect.objectContaining({
        id: "late-client-error",
        title: "Förhandsvisningen rapporterade ett fel efter att versionen godkändes.",
        detail: "[hydration] Text content does not match server-rendered HTML. · /",
        severity: "warning",
        category: "advisory",
        action: "preview",
      }),
    ]);
  });

  it("ignores client-errors at or before promoted_at", () => {
    expect(
      projectLateClientErrorReadiness(
        [
          clientErrorLog("[hydration] before", "2026-08-13T22:08:00.000Z"),
          clientErrorLog("[hydration] same instant", PROMOTED_AT),
        ],
        PROMOTED_AT,
      ),
    ).toEqual([]);
  });

  it("stays silent without promoted_at — cannot prove the error is late", () => {
    expect(
      projectLateClientErrorReadiness(
        [clientErrorLog("[hydration] anytime", "2026-08-13T22:10:08.707Z")],
        null,
      ),
    ).toEqual([]);
    expect(
      projectLateClientErrorReadiness(
        [clientErrorLog("[hydration] anytime", "2026-08-13T22:10:08.707Z")],
        "not-a-date",
      ),
    ).toEqual([]);
  });

  it("skips rows without a parseable created_at", () => {
    expect(
      projectLateClientErrorReadiness(
        [
          {
            category: PREVIEW_CLIENT_ERROR_CATEGORY,
            message: "[hydration] no clock",
            created_at: "not-a-date",
          },
        ],
        PROMOTED_AT,
      ),
    ).toEqual([]);
  });

  it("ignores other error-log categories", () => {
    expect(
      projectLateClientErrorReadiness(
        [
          log("preview", "Förhandsvisningen kraschade.", {}, "2026-08-13T22:10:08.707Z"),
          log("render-telemetry", "render failed", {}, "2026-08-13T22:10:08.707Z"),
          log("product_postcheck.runtime_crash", "crash", { code: "runtime_crash" }, "2026-08-13T22:10:08.707Z"),
        ],
        PROMOTED_AT,
      ),
    ).toEqual([]);
  });

  it("dedupes the same message and summarizes several distinct late errors", () => {
    const warnings = projectLateClientErrorReadiness(
      [
        clientErrorLog("[uncaught] boom", "2026-08-13T22:12:00.000Z", {
          kind: "uncaught",
          href: "/kontakt",
        }),
        clientErrorLog("[hydration] mismatch", "2026-08-13T22:11:00.000Z"),
        clientErrorLog("[hydration] mismatch", "2026-08-13T22:11:30.000Z"),
      ],
      PROMOTED_AT,
    );

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.detail).toBe("2 fel, senast: [uncaught] boom · /kontakt");
  });
});

describe("buildChatReadiness + late client-error projection", () => {
  it("keeps canDeploy true when a late client-error is a warning", () => {
    const warnings = projectLateClientErrorReadiness(
      [clientErrorLog("[hydration] mismatch", "2026-08-13T22:10:08.707Z")],
      PROMOTED_AT,
    );
    const readiness = buildChatReadiness({
      warnings,
      info: emptyInfo,
    });

    expect(readiness.canDeploy).toBe(true);
    expect(readiness.blockers).toEqual([]);
    expect(readiness.status).toBe("warning");
    expect(readiness.warnings.map((item) => item.id)).toEqual(["late-client-error"]);
  });

  it("stays ready when the only client-error is pre-promotion", () => {
    const readiness = buildChatReadiness({
      warnings: projectLateClientErrorReadiness(
        [clientErrorLog("[hydration] mismatch", "2026-08-13T22:07:00.000Z")],
        PROMOTED_AT,
      ),
      info: emptyInfo,
    });

    expect(readiness.status).toBe("ready");
    expect(readiness.canDeploy).toBe(true);
    expect(readiness.warnings).toEqual([]);
  });
});
