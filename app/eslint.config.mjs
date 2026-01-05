import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Ignore template source files (they're read as data, not compiled)
  // Ignore Next.js generated files
  {
    ignores: [
      "src/templates/**/*",
      ".next/**/*",
      "next-env.d.ts",
      "**/*.tsbuildinfo",
    ],
  },
];

export default eslintConfig;
