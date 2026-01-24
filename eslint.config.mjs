import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

export default defineConfig([
  // Next.js recommended configs (flat config)
  ...nextCoreWebVitals,
  ...nextTypescript,

  // Disable rules that conflict with Prettier
  prettier,

  // Global ignores
  globalIgnores([
    "src/templates/**/*",
    ".next/**/*",
    "out/**/*",
    "build/**/*",
    "dist/**/*",
    "coverage/**/*",
    "next-env.d.ts",
    "**/*.tsbuildinfo",
    "node_modules/**/*",
    "sajtmaskin/**/*",
    "base/**/*",
  ]),

  // Global rules
  {
    rules: {
      // Allow unused vars prefixed with underscore
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      // Disable React Hooks rules introduced in eslint-config-next@16
      // These are noisy in existing code; revisit later if needed.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
      "react-hooks/immutability": "off",
    },
  },

  // Override for specific files
  {
    files: ["src/lib/config.ts"],
    rules: {
      "no-var": "off",
    },
  },

  // Suppress explicit-any in API/lib/builder modules
  // These areas use dynamic v0 API responses where full typing is impractical.
  // Incrementally add stricter types over time as SDK types stabilize.
  {
    files: ["src/app/api/**/*.ts", "src/lib/**/*.ts", "src/components/builder/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);
