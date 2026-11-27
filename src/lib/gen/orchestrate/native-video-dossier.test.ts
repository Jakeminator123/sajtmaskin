import { describe, expect, it, vi } from "vitest";

import { detectFollowUpCapabilities } from "@/lib/builder/follow-up-capability-detection";
import { buildUserPromptContent, type RequestAttachment } from "../request-metadata";
import { renderDossierBlocks } from "../system-prompt/sections/dossiers";
import { resolveOrchestrationBase } from "./resolve-base";

vi.mock("@/lib/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config")>();
  return {
    ...actual,
    FEATURES: { ...actual.FEATURES, useDossierPipeline: true },
  };
});

async function resolveVideoDossier(
  prompt: string,
  generationMode: "init" | "followUp",
  requestAttachments: RequestAttachment[] = [],
) {
  // Both build entry points pass the detected capabilities and attachments
  // into orchestration. Keep scaffold matching isolated from this contract.
  const detection = detectFollowUpCapabilities(prompt, { mode: generationMode });
  return resolveOrchestrationBase({
    prompt,
    rawPrompt: prompt,
    buildIntent: "website",
    generationMode,
    scaffoldMode: "off",
    embeddingScaffoldMatch: false,
    requestedDossierCapabilities: detection.capabilityIds,
    requestedCapabilityTiers: detection.tierByCapability,
    requestAttachments,
  });
}

const savedVideo: RequestAttachment = {
  url: "https://media.example.test/videos/launch.mp4?v=2",
  filename: "launch.mp4",
  mimeType: "video/mp4",
};

describe("native video dossier", () => {
  it.each([
    ["init", "Bygg en startsida med en bakgrundsvideo i heron."],
    ["followUp", "Bädda in en video med kontroller på startsidan."],
    ["followUp", "Embed the saved MP4 in the campaign section."],
    ["followUp", "Add https://media.example.test/intro.webm to the homepage."],
  ] as const)("selects the keyless video recipe in %s for %s", async (mode, prompt) => {
    const base = await resolveVideoDossier(prompt, mode);
    expect(base.dossierSelection?.byCapability["video-embed"]).toEqual(["native-video-embed"]);
    expect(base.dossierSelection?.byCapability["media-storage"]).toBeUndefined();
    expect(base.dossierSelection?.selected).toEqual(expect.arrayContaining([
      expect.objectContaining({
        configured: true,
        entry: expect.objectContaining({
          id: "native-video-embed",
          class: "soft",
          verificationStatus: "unverified",
          envVars: [],
          dependencies: [],
          files: [],
        }),
      }),
    ]));
  });

  it("uses a selected film as a dossier signal and sends both the recipe and exact URL", async () => {
    const prompt = "Använd den här i heron.";
    const base = await resolveVideoDossier(prompt, "followUp", [savedVideo]);
    expect(base.dossierSelection?.byCapability["video-embed"]).toEqual(["native-video-embed"]);

    const dossierBlocks = renderDossierBlocks(base.dossierSelection).join("\n");
    for (const rule of ["preload=\"metadata\"", "prefers-reduced-motion", "Skapa video", "credit charges"]) {
      expect(dossierBlocks).toContain(rule);
    }
    expect(buildUserPromptContent(prompt, [savedVideo])).toContain(savedVideo.url);
  });

  it.each([
    ["Build a portfolio for a video production team.", []],
    ["Add a video call widget.", []],
    ["Embed a YouTube video on the homepage.", []],
    ["Bygg en startsida utan video.", [savedVideo]],
    ["Gör heron större.", [{ url: "https://media.example.test/cover.webp", mimeType: "image/webp" }]],
  ] as const)("does not select the native video recipe for %s", async (prompt, attachments) => {
    const base = await resolveVideoDossier(prompt, "init", [...attachments]);
    expect(base.dossierSelection?.byCapability["video-embed"]).toBeUndefined();
  });
});
