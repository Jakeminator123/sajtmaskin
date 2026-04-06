import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
    // Only this repo's suites — never vendor trees under data/ (repo-cache tests).
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "tests/**/*.{test,spec}.{ts,tsx}",
      "scripts/**/*.{test,spec}.ts",
      "_isolated_tests/**/*.{test,spec}.ts",
    ],
    exclude: [
      "node_modules/**",
      ".next/**",
      "old/**",
      "e2e/**",
      "vercel_templates_levels/**",
      "research/**",
      "_template_refs/**",
      "data/**",
    ],
  },
});
