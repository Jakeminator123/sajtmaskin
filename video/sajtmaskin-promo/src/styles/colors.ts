export const COLORS = {
  // Light theme — matches globals.css :root
  background: "#ffffff",
  foreground: "#0f172a",
  card: "#fcfcfc",
  cardBorder: "rgba(203, 213, 225, 0.4)",
  muted: "#f1f5f9",
  mutedForeground: "#64748b",
  border: "#e2e8f0",
  borderLight: "rgba(226, 232, 240, 0.4)",

  // Brand
  navy: "#0f172a",
  navyLight: "#1e293b",
  primary: "#1e3a5f",
  orange: "#f97316",
  orangeLight: "#fb923c",
  orangeDim: "rgba(249, 115, 22, 0.08)",
  green: "#22c55e",
  greenDim: "rgba(34, 197, 94, 0.1)",

  // Dark surfaces (chat header, browser chrome)
  chatHeader: "#0f1729",
  white: "#ffffff",
  whiteAlpha80: "rgba(255, 255, 255, 0.8)",
  whiteAlpha50: "rgba(255, 255, 255, 0.5)",
  whiteAlpha20: "rgba(255, 255, 255, 0.2)",
  whiteAlpha10: "rgba(255, 255, 255, 0.1)",
} as const;

export const FONT = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
  mono: '"SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", monospace',
} as const;

export const FPS = 60;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export const SCENE_FRAMES = {
  idea: 0,
  ideaDuration: 5 * FPS,
  aiThinking: 5 * FPS,
  aiThinkingDuration: 5 * FPS,
  result: 10 * FPS,
  resultDuration: 7 * FPS,
  refine: 17 * FPS,
  refineDuration: 6 * FPS,
  publish: 23 * FPS,
  publishDuration: 5 * FPS,
  outro: 28 * FPS,
  outroDuration: 2 * FPS,
  total: 30 * FPS,
} as const;
