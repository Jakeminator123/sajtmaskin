import { useCurrentFrame } from "remotion";
import { COLORS, FONT } from "../styles/colors";

export function TypewriterText({
  text,
  startFrame = 0,
  charsPerFrame = 1,
  fontSize = 40,
  color = COLORS.foreground,
  showCursor = true,
}: {
  text: string;
  startFrame?: number;
  charsPerFrame?: number;
  fontSize?: number;
  color?: string;
  showCursor?: boolean;
}) {
  const frame = useCurrentFrame();
  const localFrame = frame - startFrame;

  if (localFrame < 0) return null;

  const charsVisible = Math.min(
    Math.floor(localFrame * charsPerFrame),
    text.length,
  );
  const done = charsVisible >= text.length;
  const cursorVisible = showCursor && (!done || frame % 40 < 20);

  return (
    <span
      style={{
        fontFamily: FONT.sans,
        fontSize,
        color,
        letterSpacing: "-0.02em",
        lineHeight: 1.3,
      }}
    >
      {text.slice(0, charsVisible)}
      {cursorVisible && (
        <span style={{ color: COLORS.orange, fontWeight: 300 }}>|</span>
      )}
    </span>
  );
}
