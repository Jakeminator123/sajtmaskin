import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // Ignore template source files (they're read as data, not compiled)
  {
    ignores: ["src/templates/**/*"],
  },
  ...compat.extends("next/core-web-vitals"),
];

export default eslintConfig;
