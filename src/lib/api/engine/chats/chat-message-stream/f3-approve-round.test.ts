import { describe, expect, it } from "vitest";
import { approveRoundNeedsDossierInjection } from "./f3-approve-round";

const POSTGRES_DOSSIER_FILES = [
  "lib/db/schema.ts",
  "lib/db/index.ts",
  "lib/db/seed-data.ts",
  "components/db-config-notice.tsx",
  "drizzle.config.ts",
  "app/api/health/db/route.ts",
];

describe("approveRoundNeedsDossierInjection — database provider alignment (SM-030)", () => {
  it("does not schedule a generic Mongo build when postgres-drizzle is already present", () => {
    expect(
      approveRoundNeedsDossierInjection({
        markerSuggestedProviders: ["mongodb"],
        snapshot: {
          f3ApprovedCapabilities: ["database"],
          f3ApprovedProviders: ["mongodb"],
        },
        parentFilePaths: POSTGRES_DOSSIER_FILES,
        parentSpecProviderKeys: new Set(["postgres-drizzle"]),
      }),
    ).toBe(false);
  });

  it("keeps dossierless Mongo on the generic build path without a database selection", () => {
    expect(
      approveRoundNeedsDossierInjection({
        markerSuggestedProviders: ["mongodb"],
        snapshot: null,
        parentFilePaths: [],
        parentSpecProviderKeys: new Set(),
      }),
    ).toBe(true);
  });
});
