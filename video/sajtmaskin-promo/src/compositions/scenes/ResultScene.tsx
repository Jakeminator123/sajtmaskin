import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { COLORS, FONT } from "../../styles/colors";
import { BrowserMockup } from "../../components/BrowserMockup";
import { FadeIn } from "../../components/FadeIn";

function Section({
  startFrame,
  children,
  height,
  bg = COLORS.white,
  borderBottom = true,
}: {
  startFrame: number;
  children: React.ReactNode;
  height: number;
  bg?: string;
  borderBottom?: boolean;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - startFrame;

  if (local < 0) return null;

  const reveal = spring({
    frame: local,
    fps,
    config: { damping: 14, stiffness: 100 },
  });

  return (
    <div
      style={{
        height,
        backgroundColor: bg,
        borderBottom: borderBottom ? `1px solid ${COLORS.borderLight}` : "none",
        opacity: reveal,
        transform: `translateY(${(1 - reveal) * 12}px)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 40px",
      }}
    >
      {children}
    </div>
  );
}

export function ResultScene() {
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
        <div style={{ width: 1200 }}>
          <BrowserMockup
            url="goteborgsfika.se"
            routes={["/", "/meny", "/om-oss", "/kontakt"]}
            activeRoute="/"
          >
            {/* Nav */}
            <Section startFrame={20} height={64} bg={COLORS.card}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  width: "100%",
                }}
              >
                <span
                  style={{
                    fontFamily: FONT.sans,
                    fontWeight: 700,
                    fontSize: 22,
                    color: COLORS.navy,
                    letterSpacing: "-0.02em",
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
            </Section>

            {/* Hero */}
            <Section startFrame={50} height={280} bg={COLORS.background}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 16,
                }}
              >
                <span
                  style={{
                    fontFamily: FONT.sans,
                    fontWeight: 700,
                    fontSize: 44,
                    color: COLORS.navy,
                    letterSpacing: "-0.03em",
                  }}
                >
                  Välkommen till Göteborgs Fika
                </span>
                <span
                  style={{
                    fontFamily: FONT.sans,
                    fontSize: 18,
                    color: COLORS.mutedForeground,
                  }}
                >
                  Handbryggd kvalitet i hjärtat av Göteborg sedan 2019
                </span>
                <div
                  style={{
                    marginTop: 16,
                    padding: "12px 36px",
                    borderRadius: 999,
                    backgroundColor: COLORS.primary,
                    color: COLORS.white,
                    fontFamily: FONT.sans,
                    fontSize: 16,
                    fontWeight: 600,
                  }}
                >
                  Se vår meny
                </div>
              </div>
            </Section>

            {/* Cards row */}
            <Section startFrame={100} height={220} bg={COLORS.muted}>
              <div style={{ display: "flex", gap: 24, width: "100%" }}>
                {["Espresso & Kaffe", "Hembakat", "Catering"].map((t, i) => (
                  <div
                    key={t}
                    style={{
                      flex: 1,
                      backgroundColor: COLORS.white,
                      borderRadius: 16,
                      border: `1px solid ${COLORS.borderLight}`,
                      padding: 28,
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.03)",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: FONT.sans,
                        fontWeight: 600,
                        fontSize: 18,
                        color: COLORS.navy,
                      }}
                    >
                      {t}
                    </span>
                    <span
                      style={{
                        fontFamily: FONT.sans,
                        fontSize: 14,
                        color: COLORS.mutedForeground,
                        lineHeight: 1.5,
                      }}
                    >
                      Upptäck vårt utbud av handplockade produkter.
                    </span>
                  </div>
                ))}
              </div>
            </Section>

            {/* Footer */}
            <Section startFrame={140} height={96} bg={COLORS.card} borderBottom={false}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  width: "100%",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontFamily: FONT.sans,
                    fontSize: 14,
                    color: COLORS.mutedForeground,
                  }}
                >
                  © 2026 Göteborgs Fika
                </span>
                <span
                  style={{
                    fontFamily: FONT.sans,
                    fontSize: 14,
                    color: COLORS.mutedForeground,
                  }}
                >
                  info@goteborgsfika.se
                </span>
              </div>
            </Section>
          </BrowserMockup>
        </div>
      </FadeIn>
    </AbsoluteFill>
  );
}
