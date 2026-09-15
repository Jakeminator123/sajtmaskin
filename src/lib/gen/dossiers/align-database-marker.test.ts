import { describe, expect, it } from "vitest";
import {
  alignDatabaseMarker,
  resolveEffectiveF3ApprovedProviders,
  resolveSelectedDatabaseDossier,
} from "./align-database-marker";

describe("alignDatabaseMarker (SM-030)", () => {
  it("replaces a Mongo marker with postgres when postgres-drizzle is muted", () => {
    const aligned = alignDatabaseMarker({
      suggestedProviders: ["mongodb", "stripe"],
      requestedEnvKeys: ["MONGODB_URI", "STRIPE_SECRET_KEY"],
      snapshot: { mutedDossierIds: ["postgres-drizzle"] },
    });

    expect(aligned.suggestedProviders).toEqual(["postgres", "stripe"]);
    expect(aligned.requestedEnvKeys).toEqual(["STRIPE_SECRET_KEY"]);
  });

  it("replaces Mongo when postgres-drizzle is in selectedDossierIds", () => {
    const aligned = alignDatabaseMarker({
      suggestedProviders: ["mongodb"],
      snapshot: { selectedDossierIds: ["postgres-drizzle"] },
    });

    expect(aligned.suggestedProviders).toEqual(["postgres"]);
  });

  it("keeps dossierless Mongo when no database dossier is selected", () => {
    const aligned = alignDatabaseMarker({
      suggestedProviders: ["mongodb", "stripe"],
      requestedEnvKeys: ["MONGODB_URI"],
      snapshot: { mutedDossierIds: ["stripe-checkout"] },
    });

    expect(aligned.suggestedProviders).toEqual(["mongodb", "stripe"]);
    expect(aligned.requestedEnvKeys).toEqual(["MONGODB_URI"]);
  });

  it("does not invent a database provider when the marker has none", () => {
    const aligned = alignDatabaseMarker({
      suggestedProviders: ["stripe"],
      snapshot: { mutedDossierIds: ["postgres-drizzle"] },
    });

    expect(aligned.suggestedProviders).toEqual(["stripe"]);
  });

  it("aligns capability-default pending database to postgres-drizzle", () => {
    const aligned = alignDatabaseMarker({
      suggestedProviders: ["mongodb"],
      snapshot: { mutedCapabilities: ["database"] },
    });

    expect(aligned.suggestedProviders).toEqual(["postgres"]);
    expect(resolveSelectedDatabaseDossier({
      snapshot: { mutedCapabilities: ["database"] },
    })?.id).toBe("postgres-drizzle");
  });

  it("keeps an already aligned postgres marker", () => {
    const aligned = alignDatabaseMarker({
      suggestedProviders: ["postgres", "resend"],
      snapshot: { mutedDossierIds: ["postgres-drizzle"] },
    });

    expect(aligned.suggestedProviders).toEqual(["postgres", "resend"]);
  });

  it("uses extraDossierIds when the snapshot is empty (F3 persist meta)", () => {
    const aligned = alignDatabaseMarker({
      suggestedProviders: ["mongodb"],
      extraDossierIds: ["postgres-drizzle"],
    });

    expect(aligned.suggestedProviders).toEqual(["postgres"]);
  });
});

describe("resolveEffectiveF3ApprovedProviders (SM-030)", () => {
  it("aligns a Mongo marker before approval/readiness consume", () => {
    expect(
      resolveEffectiveF3ApprovedProviders({
        markerSuggestedProviders: ["mongodb"],
        snapshot: { mutedDossierIds: ["postgres-drizzle"] },
      }),
    ).toEqual(["postgres"]);
  });

  it("falls back to persisted providers and still aligns", () => {
    expect(
      resolveEffectiveF3ApprovedProviders({
        markerSuggestedProviders: [],
        snapshot: {
          mutedDossierIds: ["postgres-drizzle"],
          f3ApprovedProviders: ["mongodb"],
        },
      }),
    ).toEqual(["postgres"]);
  });

  it("keeps dossierless Mongo when nothing selected the database dossier", () => {
    expect(
      resolveEffectiveF3ApprovedProviders({
        markerSuggestedProviders: ["mongodb"],
        snapshot: null,
      }),
    ).toEqual(["mongodb"]);
  });
});
