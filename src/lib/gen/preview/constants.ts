import { isRuntimeProvidedImport } from "../runtime-imports";

export const PAGE_CANDIDATES = [
  "app/page.tsx",
  "src/app/page.tsx",
  "pages/index.tsx",
  "page.tsx",
  "Page.tsx",
  "app/page.jsx",
  "pages/index.jsx",
];

export const SCRIPT_FILE_RE = /\.(tsx|jsx|ts|js)$/;
export const NON_RENDERABLE_FILE_RE = /(^|\/)(route|layout|loading|error|not-found|template|middleware|proxy)\.(tsx|jsx|ts|js)$/;
export const LOCAL_IMPORT_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];
export const PREVIEW_TRANSPILE_ERROR_LIMIT = 8;

export const PREVIEW_BUILTIN_SOURCES = new Set([
  "react",
  "next/image",
  "next/link",
  "next/navigation",
  "lucide-react",
  "framer-motion",
  "motion/react",
  "recharts",
  "three",
  "@react-three/fiber",
  "@react-three/drei",
  "sonner",
  "embla-carousel-react",
  "react-hook-form",
  "@hookform/resolvers",
  "@hookform/resolvers/zod",
  "zod",
  "date-fns",
  "date-fns/format",
  "date-fns/locale",
  "cmdk",
  "vaul",
  "zustand",
  "swr",
  "next-themes",
  "react-day-picker",
  "input-otp",
  "react-resizable-panels",
  "class-variance-authority",
  "clsx",
  "tailwind-merge",
  "@tanstack/react-table",
  "@tanstack/react-query",
]);

export function isPreviewBuiltinImportSource(source: string): boolean {
  if (PREVIEW_BUILTIN_SOURCES.has(source)) return true;
  if (source.startsWith("@radix-ui/")) return true;
  if (source.startsWith("date-fns/")) return true;
  return isRuntimeProvidedImport(source);
}
