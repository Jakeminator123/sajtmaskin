import { describe, expect, it } from "vitest";
import { projectDossierIntegration } from "./integration";
import type { DossierEntry } from "./types";

const entry: DossierEntry = {
  class: "hard",
  id: "example-chat",
  label: "Example chat",
  capability: "ai-chat",
  providers: ["example"],
  codeFidelity: "verbatim",
  complexity: "medium",
  defaultForCapability: false,
  summary: "Reusable streaming integration with project-specific presentation.",
  files: [
    { path: "components/chat-panel.tsx", role: "client", injectionMode: "rewritable" },
    { path: "components/api/chat/route.ts", role: "server" },
  ],
  envVars: [
    {
      key: "CHAT_KEY",
      required: true,
      enforcement: "feature-runtime",
      purpose: "Server-side authentication for the chat provider.",
    },
  ],
  configInputs: [
    {
      id: "persona",
      label: "Site persona",
      target: "code-config",
      binding: "CHAT_SYSTEM_PROMPT",
      purpose: "Adapt the assistant to the site's facts without changing its transport.",
    },
  ],
  providerSetup: [
    {
      id: "create-key",
      title: "Create a key",
      instruction: "Create the project key in the provider dashboard.",
      references: { envVarKeys: ["CHAT_KEY"], configInputIds: ["persona"] },
    },
  ],
  lastVerified: "2026-08-11",
  verificationStatus: "unverified",
};

describe("projectDossierIntegration", () => {
  it("uses the canonical path and per-file fidelity for prompt and restoration consumers", () => {
    const view = projectDossierIntegration(entry);
    expect(view.files).toMatchObject([
      {
        sourcePath: "components/chat-panel.tsx",
        outputPath: "components/chat-panel.tsx",
        injectionMode: "rewritable",
        role: "client",
      },
      {
        sourcePath: "components/api/chat/route.ts",
        outputPath: "app/api/chat/route.ts",
        injectionMode: "verbatim",
        role: "server",
      },
    ]);
    expect(view.requiresF3).toBe(true);
  });

  it("resolves code values and provider guidance without inventing readiness or acceptance", () => {
    const view = projectDossierIntegration(entry);
    expect(view.configInputs[0].binding).toBe("CHAT_SYSTEM_PROMPT");
    expect(view.providerSetup[0].referencedEnvVars[0].key).toBe("CHAT_KEY");
    expect(view.providerSetup[0].referencedConfigInputs[0].id).toBe("persona");
    for (const key of ["configured", "status", "verificationStatus", "lastVerified"]) {
      expect(view).not.toHaveProperty(key);
    }
  });

  it("does not turn keyless provider setup into an F3 requirement", () => {
    const view = projectDossierIntegration({
      ...entry,
      envVars: [],
      files: [],
      configInputs: [],
      providerSetup: [
        {
          id: "enable",
          title: "Enable hosting product",
          instruction: "Enable the product in the hosting dashboard.",
        },
      ],
    });
    expect(view.requiresF3).toBe(false);
  });
});
