import { AbsoluteFill, useCurrentFrame, spring, interpolate, useVideoConfig, Img, staticFile } from "remotion";
import { COLORS, FONT } from "../../styles/colors";
import { FadeIn } from "../../components/FadeIn";

function Confetti({ startFrame }: { startFrame: number }) {
  const frame = useCurrentFrame();
  const local = frame - startFrame;

  if (local < 0 || local > 90) return null;

  const particles = Array.from({ length: 24 }, (_, i) => ({
    x: Math.sin(i * 1.3) * 300 + (i % 3) * 60,
    color: [COLORS.orange, COLORS.green, COLORS.primary, COLORS.orangeLight][
      i % 4
    ],
    delay: i * 2,
    size: 6 + (i % 3) * 3,
  }));

  return (
    <>
      {particles.map((p, i) => {
        const pLocal = local - p.delay;
        if (pLocal < 0) return null;
        const y = -200 + pLocal * 4.5;
        const opacity = interpolate(pLocal, [0, 60], [1, 0], {
          extrapolateRight: "clamp",
        });
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `calc(50% + ${p.x}px)`,
              top: `calc(40% + ${y}px)`,
              width: p.size,
              height: p.size,
              borderRadius: p.size > 8 ? 3 : "50%",
              backgroundColor: p.color,
              opacity,
              transform: `rotate(${pLocal * 4}deg)`,
            }}
          />
        );
      })}
    </>
  );
}

export function PublishScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const buttonClicked = frame >= 60;
  const buttonScale = buttonClicked
    ? spring({
        frame: frame - 60,
        fps,
        config: { damping: 8, stiffness: 200 },
      })
    : spring({
        frame: frame % 40,
        fps,
        config: { damping: 20, stiffness: 100 },
      }) * 0.04 + 0.96;

  const urlOpacity = frame >= 100
    ? interpolate(frame - 100, [0, 20], [0, 1], {
        extrapolateRight: "clamp",
      })
    : 0;

  const taglineOpacity = frame >= 160
    ? interpolate(frame - 160, [0, 25], [0, 1], {
        extrapolateRight: "clamp",
      })
    : 0;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.background,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 48,
      }}
    >
      {/* Publish button */}
      <FadeIn startFrame={0}>
        <div
          style={{
            padding: "20px 64px",
            borderRadius: 999,
            backgroundColor: buttonClicked ? COLORS.green : COLORS.orange,
            color: COLORS.white,
            fontFamily: FONT.sans,
            fontSize: 24,
            fontWeight: 700,
            transform: `scale(${buttonScale})`,
            boxShadow: buttonClicked
              ? `0 0 40px ${COLORS.green}30`
              : `0 4px 20px ${COLORS.orange}25`,
            letterSpacing: "-0.01em",
          }}
        >
          {buttonClicked ? "✓ Publicerad!" : "Publicera"}
        </div>
      </FadeIn>

      <Confetti startFrame={65} />

      {/* URL display */}
      {urlOpacity > 0 && (
        <div
          style={{
            opacity: urlOpacity,
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "16px 36px",
            borderRadius: 14,
            backgroundColor: COLORS.greenDim,
            border: `1px solid rgba(34, 197, 94, 0.2)`,
          }}
        >
          <span style={{ color: COLORS.green, fontSize: 22 }}>✓</span>
          <span
            style={{
              fontFamily: FONT.mono,
              fontSize: 20,
              color: COLORS.foreground,
              fontWeight: 500,
            }}
          >
            www.goteborgsfika.se
          </span>
        </div>
      )}

      {/* Tagline + logo */}
      {taglineOpacity > 0 && (
        <div
          style={{
            opacity: taglineOpacity,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 24,
          }}
        >
          <span
            style={{
              fontFamily: FONT.sans,
              fontWeight: 600,
              fontSize: 36,
              color: COLORS.navy,
              letterSpacing: "-0.03em",
              textAlign: "center",
            }}
          >
            Från idé till färdig sajt.
            <br />
            <span style={{ color: COLORS.orange }}>
              På under en minut.
            </span>
          </span>
          <Img
            src={staticFile("sajtmaskin-logo.png")}
            style={{ width: 160, opacity: 0.7 }}
          />
        </div>
      )}
    </AbsoluteFill>
  );
}
