import { describe, expect, it } from "vitest";
import type { BuildSpec } from "../build-spec";
import { selectDossiersForRequest } from "../dossiers/select";
import { renderF2ContractBlock } from "../system-prompt/sections/session-contracts";
import {
  filterDossierCapabilitiesForPrompt,
  filterDossierCapabilitiesForPromptWithMutes,
} from "./capability-prompt-filter";

const f2 = { previewPolicy: "fidelity2" } as BuildSpec;
const f3 = { previewPolicy: "fidelity3" } as BuildSpec;

const MAILCHIMP_PROMPT =
  "koppla på nyhetsbrev via Mailchimp och lägg till en /personal-sida";

describe("filterDossierCapabilitiesForPromptWithMutes", () => {
  it("mutes a named integration in the design stage and reports it as deferred", () => {
    const result = filterDossierCapabilitiesForPromptWithMutes({
      capabilities: ["newsletter-subscribe", "contact-form"],
      prompt: MAILCHIMP_PROMPT,
      previewPolicy: f2.previewPolicy,
    });

    expect(result.capabilities).not.toContain("newsletter-subscribe");
    expect(result.mutedCapabilities).toContain("newsletter-subscribe");
    expect(result.mutedCapabilities).toContain("contact-form");
  });

  it("keeps the capability and reports nothing deferred in the integrations stage", () => {
    const result = filterDossierCapabilitiesForPromptWithMutes({
      capabilities: ["newsletter-subscribe"],
      prompt: MAILCHIMP_PROMPT,
      previewPolicy: f3.previewPolicy,
    });

    expect(result.capabilities).toContain("newsletter-subscribe");
    expect(result.mutedCapabilities).toEqual([]);
  });

  it("does not report prompt-gated capabilities (never asked for) as deferred", () => {
    const result = filterDossierCapabilitiesForPromptWithMutes({
      capabilities: ["carousel"],
      prompt: "gör rubriken större",
      previewPolicy: f2.previewPolicy,
    });

    expect(result.capabilities).not.toContain("carousel");
    expect(result.mutedCapabilities).toEqual([]);
  });

  it("keeps the legacy single-list export in sync with the filtered set", () => {
    const params = {
      capabilities: ["newsletter-subscribe", "contact-form"],
      prompt: MAILCHIMP_PROMPT,
      previewPolicy: f2.previewPolicy,
    };

    expect(filterDossierCapabilitiesForPrompt(params)).toEqual(
      filterDossierCapabilitiesForPromptWithMutes(params).capabilities,
    );
  });
});

describe("F2 prompt naming Mailchimp", () => {
  it("selects no dossier that would deliver a file under app/api/", () => {
    const filtered = filterDossierCapabilitiesForPromptWithMutes({
      capabilities: ["newsletter-subscribe"],
      prompt: MAILCHIMP_PROMPT,
      previewPolicy: f2.previewPolicy,
    });

    const selection = selectDossiersForRequest({
      requestedCapabilities: filtered.capabilities,
      promptText: MAILCHIMP_PROMPT,
    });

    const apiFiles = selection.selected.flatMap((selected) =>
      (selected.entry.files ?? [])
        .map((file) => file.path.replace(/^components\/api\//, "app/api/"))
        .filter((path) => path.startsWith("app/api/")),
    );
    expect(apiFiles).toEqual([]);
    expect(selection.selected.map((selected) => selected.entry.id)).not.toContain(
      "mailchimp-newsletter",
    );
  });

  it("tells the model to render the surface without a route or an SDK import", () => {
    const block = renderF2ContractBlock(f2, ["newsletter-subscribe"]).join("\n");

    expect(block).toContain("newsletter-subscribe");
    expect(block).toContain("app/api/**");
    expect(block).toMatch(/Do NOT import its SDK/);
  });

  it("renders no deferred-integration section when nothing was muted", () => {
    const block = renderF2ContractBlock(f2, []).join("\n");

    expect(block).not.toContain("Deferred integrations");
  });
});
