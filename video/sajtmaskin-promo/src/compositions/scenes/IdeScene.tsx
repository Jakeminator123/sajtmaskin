import { AbsoluteFill } from "remotion";
import { COLORS, FONT } from "../../styles/colors";
import { SajtmaskinLogo } from "../../components/SajtmaskinLogo";
import { TypewriterText } from "../../components/TypewriterText";
import { ChatBubble } from "../../components/ChatBubble";
import { FadeIn } from "../../components/FadeIn";

export function IdeScene() {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.background,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 100,
        gap: 50,
      }}
    >
      {/* Logo */}
      <FadeIn startFrame={0}>
        <SajtmaskinLogo width={240} />
      </FadeIn>

      {/* Headline */}
      <FadeIn startFrame={15} direction="up">
        <div
          style={{
            fontFamily: FONT.sans,
            fontSize: 22,
            fontWeight: 500,
            color: COLORS.mutedForeground,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
          }}
        >
          Beskriv din idé
        </div>
      </FadeIn>

      {/* Large input area (mimics the landing page input) */}
      <FadeIn startFrame={30} direction="up">
        <div
          style={{
            width: 800,
            borderRadius: 20,
            border: `1px solid ${COLORS.cardBorder}`,
            backgroundColor: COLORS.card,
            boxShadow: "0 4px 24px rgba(0, 0, 0, 0.06)",
            padding: "36px 44px",
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          <TypewriterText
            text="Jag vill ha en hemsida för mitt kafé i Göteborg med meny, om oss och kontakt."
            startFrame={50}
            fontSize={28}
            color={COLORS.foreground}
            charsPerFrame={1.2}
          />
        </div>
      </FadeIn>

      {/* AI response bubble */}
      <FadeIn startFrame={180} direction="up" distance={20}>
        <div style={{ width: 800 }}>
          <ChatBubble
            text="Perfekt! Jag skapar din sajt nu..."
            startFrame={185}
            fromUser={false}
            charsPerFrame={1.5}
          />
        </div>
      </FadeIn>
    </AbsoluteFill>
  );
}
