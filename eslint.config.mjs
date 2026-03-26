import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";
import reactHooks from "eslint-plugin-react-hooks";

export default defineConfig([
  // Next.js recommended configs (flat config)
  ...nextCoreWebVitals,
  ...nextTypescript,

  // Disable rules that conflict with Prettier
  prettier,

  // Global ignores
  globalIgnores([
    // Vendored / cached third-party trees (not maintained in this repo)
    "research/**/*",
    "pot_buggs/**/*",
    "src/templates/**/*",
    ".next/**/*",
    ".vercel/**/*",
    "out/**/*",
    "build/**/*",
    "dist/**/*",
    "coverage/**/*",
    "next-env.d.ts",
    "**/*.tsbuildinfo",
    "node_modules/**/*",
    "sajtmaskin/**/*",
    "base/**/*",
    "old/**/*",
    "docs/plans/avklarat/2026-03-docs-old-archive/**/*",
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

  // React Hooks rules (need the plugin registered to enable as warn)
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/immutability": "warn",
    },
  },

  // Override for specific files
  {
    files: ["src/lib/config.ts"],
    rules: {
      "no-var": "off",
    },
  },
]);
