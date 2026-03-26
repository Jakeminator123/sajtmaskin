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
    exclude: [
      "node_modules/**",
      ".next/**",
      "old/**",
      "docs/plans/avklarat/2026-03-docs-old-archive/**",
      "e2e/**",
      "vercel_templates_levels/**",
      "research/**",
      "_template_refs/**",
    ],
  },
});
