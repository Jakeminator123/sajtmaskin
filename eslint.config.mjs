import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";
import reactHooks from "eslint-plugin-react-hooks";

const nextRules = [...nextCoreWebVitals, ...nextTypescript].map((config) => ({
  ...config,
  plugins: {
    ...(config.plugins ?? {}),
    "react-hooks": reactHooks,
  },
  rules: {
    ...(config.rules ?? {}),
    "react-hooks/immutability": "warn",
    "react-hooks/preserve-manual-memoization": "warn",
    "react-hooks/purity": "warn",
    "react-hooks/refs": "warn",
    "react-hooks/set-state-in-effect": "warn",
    "react-hooks/static-components": "warn",
  },
}));

export default defineConfig([
  // Next.js recommended configs (flat config)
  ...nextRules,

  // Disable rules that conflict with Prettier
  prettier,

  // Global ignores
  globalIgnores([
    // Eval artifacts deliberately preserve broken generated code for debugging.
    "data/eval-runs/**/*",
    // Vendored upstream repos used as reference material for the dossier /
    // template pipeline (e.g. the full `next.js` checkout under `repos/`).
    // Linting these pulls in their bundled `.js` (which triggers BABEL
    // deopt warnings) and legacy `/* eslint-env */` comments that crash
    // ESLint flat-config v10.
    "data/template-references/**/*",
    // Dossier pipeline: raw scraped repos + AI-extracted vendored components
    // are not our code — they are inputs/outputs of the curation pipeline.
    "data/dossiers/_repo-cache/**/*",
    "data/dossiers/_raw/**/*",
    // Match both the flat layout (`data/dossiers/<dossier>/components/...`)
    // and the newer grouped layout (`data/dossiers/<group>/<dossier>/components/...`,
    // e.g. `data/dossiers/soft/three-fiber-canvas/components/...`).
    "data/dossiers/**/components/**/*",
    "data/dossiers/**/_removed/**/*",
    // Archived legacy dossier pipeline (snapshot frozen 2026-04-20). Not
    // maintained — kept on disk for reference only.
    "archive/**/*",
    ".cursor/bugs/**/*",
    ".next/**/*",
    ".vercel/**/*",
    "out/**/*",
    "build/**/*",
    "dist/**/*",
    "coverage/**/*",
    ".cursor/hooks/**/*",
    "next-env.d.ts",
    "**/*.tsbuildinfo",
    "drizzle.config.ts",
    "node_modules/**/*",
    ".venv/**/*",
    "sajtmaskin/**/*",
    "base/**/*",
    "old/**/*",
  ]),

  // Global rules
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // Override for specific files
  {
    files: ["src/lib/config.ts"],
    rules: {
      "no-var": "off",
    },
  },
  {
    files: ["preview-host/**/*.{js,mjs,cjs}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Scaffold template files copied into generated sites — plain <a> and quotes in copy are intentional
  {
    files: ["src/lib/gen/scaffolds/**/files/**/*.{ts,tsx,js,jsx}"],
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      "react/no-unescaped-entities": "off",
    },
  },
  // CLI stdout/stderr
  {
    files: ["src/lib/gen/eval/cli.ts"],
    rules: {
      "no-console": "off",
    },
  },
  // Tooling / scripts / e2e — console output is intentional
  {
    files: [
      "scripts/**/*.{js,mjs,cjs,ts}",
      "e2e/**/*.ts",
      "preview-host/**/*.{js,mjs,cjs}",
    ],
    rules: {
      "no-console": "off",
    },
  },
]);
