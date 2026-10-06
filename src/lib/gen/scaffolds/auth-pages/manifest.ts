import type { ScaffoldManifest } from "../types";
import { loadScaffoldFiles } from "../load-scaffold-files";

export const authPagesManifest: ScaffoldManifest = {
  id: "auth-pages",
  label: "Auth Pages",
  description:
    "Login, signup, and recovery forms with native validation and pending/error states; authentication requires a connected provider.",
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
    "Keep the shared AuthForm, native constraints, pending/error states, double-submit guard, and links between auth pages. Replace branding and copy.",
    "The starter auth adapter is deliberately unconnected. Do not claim a session, account, recovery email, or OAuth success until a real provider confirms it. Keep server validation and session management in that provider; never store passwords or fake sessions in browser storage.",
  ],
  qualityChecklist: [
    "Login, signup, and recovery views should stay clearly linked and feel like one coherent auth flow.",
    "Invalid fields and mismatched passwords must block submit. Pending requests disable fields and repeated submits; provider failures must remain visible and retryable.",
    "Keep the unconnected provider boundary explicit. A local form preview is not working authentication, session management, OAuth, or password recovery.",
    "Branding, helper text, and CTA labels should match the actual product without losing auth clarity.",
  ],
  research: {
    upgradeTargets: [
      "Add password strength and inline validation messaging for signup.",
      "Add optional social login buttons that can be toggled per provider.",
      "Add clear auth state transitions (success, error, pending) with toast feedback.",
    ],
  },
  // Pure move of the former getScaffoldDefaultRoutes switch (route-plan
  // planning-helpers): /login required, /signup planned as optional.
  // SM-048 (owner decision 2026-08-14): /forgot-password is declared (page
  // file exists, never planned) which also resolved its SM-042 gate drift.
  // The three auth pages link to EACH OTHER (login → forgot-password,
  // forgot-password → login, signup ↔ login), so the delivery group makes
  // the plan filter all-or-nothing: if any auth route is planned, all three
  // pages are delivered — a surviving page never carries a dead auth link.
  routeContract: {
    requiredRoutes: [
      {
        path: "/login",
        name: "Login",
        planIntent: "Keep a dedicated authentication entry route.",
      },
    ],
    optionalRoutes: [
      {
        path: "/signup",
        name: "Signup",
        planIntent: "Keep a dedicated registration route when auth is in scope.",
      },
    ],
    declaredRoutePaths: ["/forgot-password"],
    dynamicRoutePatterns: [],
    deliveryGroups: [["/login", "/signup", "/forgot-password"]],
  },
  files: loadScaffoldFiles("auth-pages"),
};
