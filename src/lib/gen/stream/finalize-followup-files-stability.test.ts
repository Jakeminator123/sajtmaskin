/**
 * Prod 2026-09-08 /logg chat 4a2aa301-c337-44e6-9939-9b65a3f872a5:
 * a CSS-only follow-up ("gör bakgrunden lite lilaaktig") persisted a
 * files_json that also reformatted tsconfig.json, rewrote env.example, and
 * dropped the pipeline-authored .env.local. planPreviewPatch then returned
 * structural_change and forced a full /update + Next restart.
 *
 * This fixture walks the persist-relevant owners (merge → scaffold →
 * env.example inject) the same way finalize-preflight does, without the
 * preview-html / sanity side paths.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/chat-repository-pg", () => ({
  getPreferredVersion: vi.fn(),
  getLatestVersion: vi.fn(),
  getVersionById: vi.fn(),
  getKnownBrokenImageReplacements: vi.fn(),
  updateVersionFiles: vi.fn(),
}));

import {
  getKnownBrokenImageReplacements,
  getLatestVersion,
  getPreferredVersion,
  getVersionById,
} from "@/lib/db/chat-repository-pg";
import { resolveFollowUpPreviousBase } from "@/lib/gen/version-manager";

import { getDossierById } from "@/lib/gen/dossiers/registry";
import type { DossierEntry } from "@/lib/gen/dossiers/types";
import { buildCompleteProject } from "@/lib/gen/export/project-scaffold";
import { injectIntegrationManifestIntoFilesJson } from "@/lib/integrations/inject-integration-manifest";
import type { CodeFile } from "@/lib/gen/parser";
import {
  injectProjectEnvFileIntoFilesJson,
  resolveDossierEnvScopeForFinalize,
} from "@/lib/gen/preview/project-env-file";
import {
  hashPreviewFileContent,
  planPreviewPatch,
} from "@/lib/gen/preview/preview-patch-plan";
import { mergeGeneratedProjectFiles } from "./finalize-merge";

const PAGE: CodeFile = {
  path: "app/page.tsx",
  language: "tsx",
  content: `export default function Page() {
  return <main><h1>Hej</h1></main>;
}
`,
};

const GLOBALS_V1 = `:root { --bg: #0b0b10; }\nbody { background: var(--bg); }\n`;
const GLOBALS_V2 = `:root { --bg: #2a1840; }\nbody { background: var(--bg); }\n`;

const CONTACT_FORM: CodeFile = {
  path: "components/contact-form.tsx",
  language: "tsx",
  content: `export function ContactForm() {
  return <form>Kontakt</form>;
}
`,
};

const CONTACT_ROUTE: CodeFile = {
  path: "app/api/contact/route.ts",
  language: "ts",
  content: `export async function POST() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const to = process.env.CONTACT_EMAIL_TO;
  return Response.json({ ok: true, demo: !apiKey, from, to });
}
`,
};

function filesByPath(files: Array<{ path: string; content: string }>): Record<string, string> {
  return Object.fromEntries(files.map((file) => [file.path, file.content]));
}

function changedPaths(
  base: Record<string, string>,
  next: Record<string, string>,
): string[] {
  const paths = new Set([...Object.keys(base), ...Object.keys(next)]);
  return [...paths].filter((path) => base[path] !== next[path]).sort();
}

async function persistLikeFinalize(params: {
  generatedFiles: CodeFile[];
  previousFiles?: CodeFile[];
  selectedDossiers?: DossierEntry[];
  persistedEnvKeys?: string[] | null;
  orchestrationSnapshot?: unknown;
}): Promise<CodeFile[]> {
  const merge = mergeGeneratedProjectFiles({
    chatId: "chat_followup_stability",
    originalFilesJson: JSON.stringify(params.generatedFiles),
    generatedFiles: params.generatedFiles,
    resolvedScaffold: null,
    previousFiles: params.previousFiles,
    selectedDossiers: params.selectedDossiers ?? [],
  });
  const scope = resolveDossierEnvScopeForFinalize({
    selectedDossiers: params.selectedDossiers,
    previousFiles: params.previousFiles,
    persistedEnvKeys: params.persistedEnvKeys,
    orchestrationSnapshot: params.orchestrationSnapshot,
  });
  const completed = buildCompleteProject(
    JSON.parse(merge.filesJson) as CodeFile[],
    undefined,
    {
      lifecycleStage: "design",
      selectedDossierEnvKeys: scope.envVars.map((envVar) => envVar.key),
    },
  );
  const withManifest = injectIntegrationManifestIntoFilesJson(JSON.stringify(completed), {
    lifecycleStage: "design",
  });
  const withEnv = await injectProjectEnvFileIntoFilesJson(withManifest, {
    appProjectId: "proj_followup_stability",
    lifecycleStage: "design",
    dossierEnvScope: scope,
  });
  return JSON.parse(withEnv) as CodeFile[];
}

describe("CSS-only follow-up files_json stability (prod 2026-09-08)", () => {
  it("diffs exactly app/globals.css and stays on the preview patch lane", async () => {
    const resend = getDossierById("resend-contact-form");
    expect(resend).not.toBeNull();

    const v1 = await persistLikeFinalize({
      generatedFiles: [
        PAGE,
        { path: "app/globals.css", content: GLOBALS_V1, language: "css" },
        CONTACT_FORM,
        CONTACT_ROUTE,
      ],
      selectedDossiers: resend ? [resend] : [],
    });
    const v1ByPath = filesByPath(v1);

    expect(v1ByPath["tsconfig.json"]).toBeDefined();
    expect(v1ByPath["env.example"]).toContain("Tier-3 placeholders");
    expect(v1ByPath["env.example"]).toContain("Nycklar för valda byggblock");
    expect(v1ByPath[".env.local"]).toContain("RESEND_API_KEY=");

    // Follow-up round has no this-round dossier pick — same as a visual tweak.
    // Scope must come from previous files / persisted keys, not a blank slate.
    const v2 = await persistLikeFinalize({
      generatedFiles: [{ path: "app/globals.css", content: GLOBALS_V2, language: "css" }],
      previousFiles: v1,
      selectedDossiers: [],
      persistedEnvKeys: ["RESEND_API_KEY", "EMAIL_FROM", "CONTACT_EMAIL_TO"],
    });
    const v2ByPath = filesByPath(v2);

    expect(changedPaths(v1ByPath, v2ByPath)).toEqual(["app/globals.css"]);
    expect(v2ByPath["app/globals.css"]).toBe(GLOBALS_V2);
    expect(v2ByPath["tsconfig.json"]).toBe(v1ByPath["tsconfig.json"]);
    expect(v2ByPath["env.example"]).toBe(v1ByPath["env.example"]);
    expect(v2ByPath[".env.local"]).toBe(v1ByPath[".env.local"]);

    const hostFileHashes = Object.fromEntries(
      Object.entries(v1ByPath).map(([path, content]) => [path, hashPreviewFileContent(content)]),
    );
    const plan = planPreviewPatch({ hostFileHashes, nextFiles: v2ByPath });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(Object.keys(plan.changedFiles)).toEqual(["app/globals.css"]);
    expect(plan.removedPaths).toEqual([]);
  });

  it("keeps env.example stable from persisted keys when the follow-up has no dossier files", async () => {
    const resend = getDossierById("resend-contact-form");
    expect(resend).not.toBeNull();

    const v1 = await persistLikeFinalize({
      generatedFiles: [
        PAGE,
        { path: "app/globals.css", content: GLOBALS_V1, language: "css" },
      ],
      selectedDossiers: resend ? [resend] : [],
    });

    const v2 = await persistLikeFinalize({
      generatedFiles: [{ path: "app/globals.css", content: GLOBALS_V2, language: "css" }],
      previousFiles: v1,
      selectedDossiers: [],
      persistedEnvKeys: ["RESEND_API_KEY", "EMAIL_FROM", "CONTACT_EMAIL_TO"],
    });

    expect(filesByPath(v2)["env.example"]).toBe(filesByPath(v1)["env.example"]);
    expect(filesByPath(v2)[".env.local"]).toBe(filesByPath(v1)[".env.local"]);
  });

  it("inherits only the resolved older base keys {A}, not latest failed {A,B}", async () => {
    vi.mocked(getKnownBrokenImageReplacements).mockResolvedValue({});
    vi.mocked(getPreferredVersion).mockResolvedValue({
      id: "ver_failed",
      chat_id: "chat_1",
      files_json: JSON.stringify([{ path: "app/page.tsx", content: "failed", language: "tsx" }]),
      selected_dossier_env_keys: ["RESEND_API_KEY", "STRIPE_SECRET_KEY"],
    } as never);
    vi.mocked(getLatestVersion).mockResolvedValue({
      id: "ver_failed",
      chat_id: "chat_1",
      files_json: JSON.stringify([{ path: "app/page.tsx", content: "failed", language: "tsx" }]),
      selected_dossier_env_keys: ["RESEND_API_KEY", "STRIPE_SECRET_KEY"],
    } as never);

    const resend = getDossierById("resend-contact-form");
    expect(resend).not.toBeNull();
    const v1 = await persistLikeFinalize({
      generatedFiles: [
        PAGE,
        { path: "app/globals.css", content: GLOBALS_V1, language: "css" },
        CONTACT_FORM,
        CONTACT_ROUTE,
      ],
      selectedDossiers: resend ? [resend] : [],
    });

    vi.mocked(getVersionById).mockResolvedValue({
      id: "ver_old",
      chat_id: "chat_1",
      files_json: JSON.stringify(v1),
      selected_dossier_env_keys: ["RESEND_API_KEY"],
    } as never);

    const base = await resolveFollowUpPreviousBase("chat_1", "ver_old");
    expect(base.versionId).toBe("ver_old");
    expect(base.selectedDossierEnvKeys).toEqual(["RESEND_API_KEY"]);
    expect(base.files).toEqual(v1);
    expect(vi.mocked(getLatestVersion)).not.toHaveBeenCalled();

    const leakedLatest = await persistLikeFinalize({
      generatedFiles: [{ path: "app/globals.css", content: GLOBALS_V2, language: "css" }],
      previousFiles: v1,
      selectedDossiers: [],
      persistedEnvKeys: ["RESEND_API_KEY", "STRIPE_SECRET_KEY"],
    });
    expect(filesByPath(leakedLatest)["env.example"]).toMatch(/^STRIPE_SECRET_KEY=/m);

    const v2 = await persistLikeFinalize({
      generatedFiles: [{ path: "app/globals.css", content: GLOBALS_V2, language: "css" }],
      previousFiles: base.files,
      selectedDossiers: [],
      persistedEnvKeys: base.selectedDossierEnvKeys,
    });
    expect(filesByPath(v2)["env.example"]).toMatch(/^RESEND_API_KEY=/m);
    expect(filesByPath(v2)["env.example"]).not.toMatch(/^STRIPE_SECRET_KEY=/m);
    expect(filesByPath(v2)[".env.local"]).not.toMatch(/^STRIPE_SECRET_KEY=/m);
    expect(changedPaths(filesByPath(v1), filesByPath(v2))).toEqual(["app/globals.css"]);
  });

  it("does not resurrect Stripe keys from a snapshot that still lists payments after removal", async () => {
    const resend = getDossierById("resend-contact-form");
    expect(resend).not.toBeNull();

    const v1 = await persistLikeFinalize({
      generatedFiles: [
        PAGE,
        { path: "app/globals.css", content: GLOBALS_V1, language: "css" },
        CONTACT_FORM,
        CONTACT_ROUTE,
      ],
      selectedDossiers: resend ? [resend] : [],
    });
    const v1ByPath = filesByPath(v1);
    expect(v1ByPath["env.example"]).toMatch(/^RESEND_API_KEY=/m);
    expect(v1ByPath["env.example"]).not.toMatch(/^STRIPE_SECRET_KEY=/m);

    const persistedEnvKeys = [
      "RESEND_API_KEY",
      "EMAIL_FROM",
      "CONTACT_EMAIL_TO",
      "STRIPE_SECRET_KEY",
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    ];
    const staleRequested = {
      requestedCapabilities: ["payments", "contact-form"],
      briefSummary: { requestedCapabilities: ["payments", "contact-form"] },
    };

    const resurrected = await persistLikeFinalize({
      generatedFiles: [{ path: "app/globals.css", content: GLOBALS_V2, language: "css" }],
      previousFiles: v1,
      selectedDossiers: [],
      persistedEnvKeys,
      orchestrationSnapshot: staleRequested,
    });
    expect(filesByPath(resurrected)["env.example"]).toMatch(/^STRIPE_SECRET_KEY=/m);

    const v2 = await persistLikeFinalize({
      generatedFiles: [{ path: "app/globals.css", content: GLOBALS_V2, language: "css" }],
      previousFiles: v1,
      selectedDossiers: [],
      persistedEnvKeys,
      orchestrationSnapshot: {
        ...staleRequested,
        removedCapabilities: ["payments"],
      },
    });
    const v2ByPath = filesByPath(v2);
    expect(v2ByPath["env.example"]).not.toMatch(/^STRIPE_SECRET_KEY=/m);
    expect(v2ByPath["env.example"]).not.toMatch(/^NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=/m);
    expect(v2ByPath[".env.local"]).not.toMatch(/^STRIPE_SECRET_KEY=/m);
    expect(v2ByPath["env.example"]).toBe(v1ByPath["env.example"]);
    expect(changedPaths(v1ByPath, v2ByPath)).toEqual(["app/globals.css"]);
  });
});
