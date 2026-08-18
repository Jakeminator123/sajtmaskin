import { describe, expect, it } from "vitest";
import { getAllDossiers } from "@/lib/gen/dossiers/registry";
import {
  buildDossierStagingLines,
  defaultDossierStagingAnswer,
  DOSSIER_STAGING_CONTENT_DEFAULT,
  getDossierStagingSpec,
  listExplicitStagingIds,
} from "./dossier-staging";

describe("getDossierStagingSpec", () => {
  it("classifies the start trio with their exact questions", () => {
    const chat = getDossierStagingSpec("openai-chat");
    expect(chat.kind).toBe("placement");
    if (chat.kind === "placement") {
      expect(chat.question).toBe("Var ska chatten bo?");
      expect(chat.defaultOptionId).toBe("floating");
      expect(chat.options.map((option) => option.label)).toEqual([
        "Flytande widget",
        "Egen sida",
        "Sektion på startsidan",
      ]);
    }

    const clerk = getDossierStagingSpec("clerk-auth");
    const supabase = getDossierStagingSpec("supabase-auth");
    expect(clerk).toEqual(supabase);
    if (clerk.kind === "placement") {
      expect(clerk.question).toBe("Hur ska inloggningen synas?");
    }

    const contact = getDossierStagingSpec("resend-contact-form");
    if (contact.kind === "placement") {
      expect(contact.question).toBe("Var ska formuläret bo?");
      expect(contact.defaultOptionId).toBe("home-section");
    }
  });

  it("uses the generic placement question for other visible blocks", () => {
    const spec = getDossierStagingSpec("stripe-checkout");
    expect(spec.kind).toBe("placement");
    if (spec.kind === "placement") {
      expect(spec.question).toBe("Var ska blocket placeras?");
      expect(spec.options[0]?.llmChooses).toBe(true);
    }
  });

  it("asks a content question for data blocks", () => {
    const db = getDossierStagingSpec("postgres-drizzle");
    const cms = getDossierStagingSpec("sanity-cms");
    expect(db.kind).toBe("content");
    expect(cms.kind).toBe("content");
    if (db.kind === "content") {
      expect(db.question).toBe("Vad ska sparas?");
      expect(db.defaultText).toBe(DOSSIER_STAGING_CONTENT_DEFAULT);
    }
    if (cms.kind === "content") {
      expect(cms.question).toBe("Vilka innehållstyper?");
    }
  });

  it("asks nothing for invisible blocks and unknown ids", () => {
    expect(getDossierStagingSpec("vercel-analytics")).toEqual({ kind: "none" });
    expect(getDossierStagingSpec("cmdk-command-palette")).toEqual({ kind: "none" });
    expect(getDossierStagingSpec("brand-new-block")).toEqual({ kind: "none" });
  });

  it("covers every runtime dossier id with an explicit row", () => {
    const runtimeIds = getAllDossiers()
      .map((dossier) => dossier.id)
      .sort();
    const stagedIds = [...listExplicitStagingIds()].sort();
    expect(stagedIds).toEqual(runtimeIds);
  });
});

describe("buildDossierStagingLines", () => {
  it("omits the line when the generic default (LLM väljer) is kept", () => {
    const spec = getDossierStagingSpec("stripe-checkout");
    expect(buildDossierStagingLines(spec, defaultDossierStagingAnswer(spec))).toEqual([]);
  });

  it("emits Placering when a non-default option is chosen", () => {
    const spec = getDossierStagingSpec("stripe-checkout");
    expect(
      buildDossierStagingLines(spec, { kind: "placement", optionId: "own-page" }),
    ).toEqual(["Placering: Egen sida"]);
  });

  it("emits the chat default (Flytande widget) because it is a real placement", () => {
    const spec = getDossierStagingSpec("openai-chat");
    expect(buildDossierStagingLines(spec, defaultDossierStagingAnswer(spec))).toEqual([
      "Placering: Flytande widget",
    ]);
  });

  it("omits Innehåll when the LLM-default text is kept or cleared", () => {
    const spec = getDossierStagingSpec("postgres-drizzle");
    expect(buildDossierStagingLines(spec, defaultDossierStagingAnswer(spec))).toEqual([]);
    expect(buildDossierStagingLines(spec, { kind: "content", text: "   " })).toEqual([]);
  });

  it("emits Innehåll for a custom content answer", () => {
    const spec = getDossierStagingSpec("postgres-drizzle");
    expect(
      buildDossierStagingLines(spec, { kind: "content", text: "Bokningar och ordrar" }),
    ).toEqual(["Innehåll: Bokningar och ordrar"]);
  });

  it("emits nothing for invisible / unknown blocks", () => {
    expect(
      buildDossierStagingLines({ kind: "none" }, { kind: "none" }),
    ).toEqual([]);
  });
});
