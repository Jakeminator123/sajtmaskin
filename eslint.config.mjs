import { defineConfig, globalIgnores } from "eslint/config";
import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

export default defineConfig([
  // Base JS recommended rules
  js.configs.recommended,

  // Next.js recommended configs (via FlatCompat for legacy format)
  ...compat.extends("next/core-web-vitals", "next/typescript"),

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
    files: [
      "src/app/api/**/*.ts",
      "src/lib/**/*.ts",
      "src/components/builder/**/*.tsx",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);
