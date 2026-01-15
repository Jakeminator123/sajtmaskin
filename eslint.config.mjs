import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

const eslintConfig = [
  // Extend Next.js recommended configs
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // Global ignores
  {
    ignores: [
      "src/templates/**/*",
      ".next/**/*",
      "next-env.d.ts",
      "**/*.tsbuildinfo",
      "node_modules/**/*",
      // Prevent linting a nested clone/repo (can explode error counts)
      "sajtmaskin/**/*",
      // Local docs/specs
      "SiteStudio_Projektspecifikation_ifillningsbar_v2.pdf",
    ],
  },

  // Global rules
  {
    rules: {
      // Allow unused vars prefixed with underscore (common pattern for "intentionally unused")
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
];

export default eslintConfig;
