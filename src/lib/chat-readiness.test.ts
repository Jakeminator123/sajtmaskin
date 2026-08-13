import { describe, expect, it } from "vitest";
import {
  buildChatReadiness,
  projectProductPostcheckReadiness,
  type ChatReadinessInfo,
  type ProductPostcheckReadinessLog,
} from "./chat-readiness";

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
