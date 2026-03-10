import type { SuspenseRule } from "../transform";

const AI_PATH_RE = /src\s*=\s*["']\/ai\/([^"']+)["']/g;

export const imageSrcFix: SuspenseRule = {
  name: "image-src-fix",
  transform(line) {
    if (!line.includes("/ai/")) return line;
    return line.replace(AI_PATH_RE, (_match, filename: string) => {
      const name = filename.replace(/\.[^.]+$/, "").replace(/[-_]/g, "+");
      return `src="/placeholder.svg?height=400&width=600&text=${encodeURIComponent(name)}"`;
    });
  },
};
