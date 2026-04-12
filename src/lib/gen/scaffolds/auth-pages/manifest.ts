import type { ScaffoldManifest } from "../types";
import { loadScaffoldFiles } from "../load-scaffold-files";

export const authPagesManifest: ScaffoldManifest = {
  id: "auth-pages",
  label: "Auth Pages",
  description:
    "Login, signup, and forgot-password pages with form layout, validation-ready structure, and minimal branding.",
  siteKind: "app",
  complexity: "simple",
  structureProfile: "auth-surface",
  contentProfile: "authentication",
  features: ["login", "signup", "password-reset"],
  allowedBuildIntents: ["website", "app", "template"],
  tags: [
    "auth",
    "login",
    "signup",
    "register",
    "password",
    "oauth",
    "social-login",
    "forgot-password",
    "inloggning",
    "registrering",
    "losenord",
  ],
  promptHints: [
    "Use this scaffold for authentication flows: login, signup, forgot password.",
    "Keep the form layout, validation structure, and link flow between auth pages. Replace branding and copy.",
    "Add OAuth buttons or additional fields as needed. Preserve the centered card layout.",
  ],
  qualityChecklist: [
    "Login, signup, and recovery views should stay clearly linked and feel like one coherent auth flow.",
    "Forms should look ready for real validation and integration, not like static placeholder cards.",
    "Branding, helper text, and CTA labels should match the actual product without losing auth clarity.",
  ],
  research: {
    upgradeTargets: [
      "Add password strength and inline validation messaging for signup.",
      "Add optional social login buttons that can be toggled per provider.",
      "Add clear auth state transitions (success, error, pending) with toast feedback.",
    ],
    referenceTemplates: [
      { id: "authentication-clerk-authentication-starter", title: "Clerk Authentication Starter", categorySlug: "authentication", qualityScore: 96, strengths: ["verified Next.js codebase", "auth flow reference", "OAuth provider patterns"] },
      { id: "authentication-next-js-saas-starter", title: "Next.js SaaS Starter", categorySlug: "authentication", qualityScore: 96, strengths: ["verified Next.js codebase", "auth flow reference", "session management"] },
      { id: "authentication-kinde-next-js-starter", title: "Kinde Next.js Starter", categorySlug: "authentication", qualityScore: 94, strengths: ["verified Next.js codebase", "auth flow reference", "middleware patterns"] },
    ],
  },
  files: loadScaffoldFiles("auth-pages"),
};
