import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { COLORS, FONT } from "../../styles/colors";
import { BrowserMockup } from "../../components/BrowserMockup";
import { FadeIn } from "../../components/FadeIn";
import { TypewriterText } from "../../components/TypewriterText";

export function RefineScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const highlightProgress = frame >= 140
    ? spring({ frame: frame - 140, fps, config: { damping: 12, stiffness: 80 } })
    : 0;

  const newTextOpacity = frame >= 180
    ? interpolate(frame - 180, [0, 20], [0, 1], { extrapolateRight: "clamp" })
    : 0;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.background,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 60,
      }}
    >
      <FadeIn startFrame={0}>
        <div style={{ width: 1200, position: "relative" }}>
          <BrowserMockup url="goteborgsfika.se">
            {/* Simplified page with hero that changes */}
            <div style={{ padding: "60px 60px 0" }}>
              {/* Nav */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 48,
                }}
              >
                <span
                  style={{
                    fontFamily: FONT.sans,
                    fontWeight: 700,
                    fontSize: 22,
                    color: COLORS.navy,
                  }}
                >
                  Göteborgs Fika
                </span>
                <div style={{ display: "flex", gap: 28 }}>
                  {["Meny", "Om oss", "Kontakt"].map((t) => (
                    <span
                      key={t}
                      style={{
                        fontFamily: FONT.sans,
                        fontSize: 15,
                        color: COLORS.mutedForeground,
                        fontWeight: 500,
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              {/* Headline — with highlight effect and text change */}
              <div style={{ position: "relative", display: "inline-block" }}>
                {/* Highlight overlay */}
                {highlightProgress > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      inset: -8,
                      borderRadius: 12,
                      border: `2px solid ${COLORS.orange}`,
                      opacity: highlightProgress * 0.6,
                      backgroundColor: `rgba(249, 115, 22, ${highlightProgress * 0.04})`,
                    }}
                  />
                )}
                <span
                  style={{
                    fontFamily: FONT.sans,
                    fontWeight: 700,
                    fontSize: 42,
                    color: COLORS.navy,
                    letterSpacing: "-0.03em",
                    lineHeight: 1.2,
                  }}
                >
                  {newTextOpacity > 0.5
                    ? "Smaka på Göteborgs bästa fika"
                    : "Välkommen till Göteborgs Fika"}
                </span>
              </div>

              <div style={{ marginTop: 20 }}>
                <span
                  style={{
                    fontFamily: FONT.sans,
                    fontSize: 18,
                    color: COLORS.mutedForeground,
                    lineHeight: 1.6,
                  }}
                >
                  {newTextOpacity > 0.5
                    ? "Handbryggt kaffe och nybakade bullar — besök oss idag."
                    : "Handbryggd kvalitet i hjärtat av Göteborg sedan 2019"}
                </span>
              </div>

              {/* CTA button */}
              <div style={{ marginTop: 32 }}>
                <div
                  style={{
                    display: "inline-block",
                    padding: "14px 40px",
                    borderRadius: 999,
                    backgroundColor: newTextOpacity > 0.5 ? COLORS.orange : COLORS.primary,
                    color: COLORS.white,
                    fontFamily: FONT.sans,
                    fontSize: 16,
                    fontWeight: 600,
                    transition: "background-color 0.3s",
                  }}
                >
                  {newTextOpacity > 0.5 ? "Boka bord" : "Se vår meny"}
                </div>
              </div>
            </div>
          </BrowserMockup>

          {/* ── Floating chat panel ── */}
          <FadeIn startFrame={20} direction="left" distance={40}>
            <div
              style={{
                position: "absolute",
                bottom: 40,
                left: -20,
                width: 360,
                borderRadius: 20,
                overflow: "hidden",
                border: `1px solid ${COLORS.borderLight}`,
                boxShadow: "0 8px 40px rgba(0, 0, 0, 0.12)",
                backgroundColor: COLORS.card,
              }}
            >
              {/* Chat header (dark navy like real app) */}
              <div
                style={{
                  height: 44,
                  backgroundColor: COLORS.chatHeader,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 18px",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    backgroundColor: COLORS.green,
                  }}
                />
                <span
                  style={{
                    fontFamily: FONT.sans,
                    fontSize: 14,
                    fontWeight: 600,
                    color: COLORS.white,
                  }}
                >
                  Chatt
                </span>
              </div>

              {/* Chat body */}
              <div style={{ padding: 18 }}>
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: 14,
                    backgroundColor: COLORS.orangeDim,
                    border: `1px solid rgba(249, 115, 22, 0.15)`,
                  }}
                >
                  <TypewriterText
                    text="Gör texterna mer säljande"
                    startFrame={60}
                    fontSize={16}
                    color={COLORS.foreground}
                    charsPerFrame={0.8}
                    showCursor={true}
                  />
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </FadeIn>
    </AbsoluteFill>
  );
}
