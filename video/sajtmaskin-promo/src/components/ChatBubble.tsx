import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { COLORS, FONT } from "../styles/colors";

export function ChatBubble({
  text,
  startFrame = 0,
  fromUser = true,
  typewriter = true,
  charsPerFrame = 1.2,
}: {
  text: string;
  startFrame?: number;
  fromUser?: boolean;
  typewriter?: boolean;
  charsPerFrame?: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localFrame = frame - startFrame;

  if (localFrame < 0) return null;

  const scaleIn = spring({
    frame: localFrame,
    fps,
    config: { damping: 15, stiffness: 120 },
  });

  const charsVisible = typewriter
    ? Math.min(Math.floor(localFrame * charsPerFrame), text.length)
    : text.length;

  const visibleText = text.slice(0, charsVisible);

  return (
    <div
      style={{
        transform: `scale(${scaleIn})`,
        opacity: interpolate(scaleIn, [0, 1], [0, 1]),
        display: "flex",
        justifyContent: fromUser ? "flex-end" : "flex-start",
        width: "100%",
      }}
    >
      <div
        style={{
          maxWidth: 680,
          padding: "18px 24px",
          borderRadius: 20,
          backgroundColor: fromUser ? COLORS.card : COLORS.orangeDim,
          border: `1px solid ${fromUser ? COLORS.cardBorder : "rgba(249, 115, 22, 0.2)"}`,
          boxShadow: fromUser
            ? "0 2px 8px rgba(0, 0, 0, 0.04)"
            : "none",
          fontFamily: FONT.sans,
          fontSize: 26,
          lineHeight: 1.5,
          color: COLORS.foreground,
          letterSpacing: "-0.01em",
        }}
      >
        {visibleText}
      </div>
    </div>
  );
}
