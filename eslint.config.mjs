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
    // Vendored / cached third-party trees (not maintained in this repo)
    "research/**/*",
    "data/external-template-pipeline/repo-cache/**/*",
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
    files: ["preview-host/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);
