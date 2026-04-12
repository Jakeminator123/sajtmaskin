import { AbsoluteFill, Sequence, useCurrentFrame, interpolate } from "remotion";
import { COLORS } from "../styles/colors";
import { SCENE_FRAMES } from "../styles/colors";
import { IdeScene } from "./scenes/IdeScene";
import { AiThinkingScene } from "./scenes/AiThinkingScene";
import { ResultScene } from "./scenes/ResultScene";
import { RefineScene } from "./scenes/RefineScene";
import { PublishScene } from "./scenes/PublishScene";
import { SajtmaskinLogo } from "../components/SajtmaskinLogo";

function OutroScene() {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 20, 100, 120], [0, 1, 1, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.navy,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity,
      }}
    >
      <SajtmaskinLogo width={260} opacity={0.9} />
    </AbsoluteFill>
  );
}

export function SajtmaskinPromo() {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.navy }}>
      <Sequence from={SCENE_FRAMES.idea} durationInFrames={SCENE_FRAMES.ideaDuration}>
        <IdeScene />
      </Sequence>

      <Sequence from={SCENE_FRAMES.aiThinking} durationInFrames={SCENE_FRAMES.aiThinkingDuration}>
        <AiThinkingScene />
      </Sequence>

      <Sequence from={SCENE_FRAMES.result} durationInFrames={SCENE_FRAMES.resultDuration}>
        <ResultScene />
      </Sequence>

      <Sequence from={SCENE_FRAMES.refine} durationInFrames={SCENE_FRAMES.refineDuration}>
        <RefineScene />
      </Sequence>

      <Sequence from={SCENE_FRAMES.publish} durationInFrames={SCENE_FRAMES.publishDuration}>
        <PublishScene />
      </Sequence>

      <Sequence from={SCENE_FRAMES.outro} durationInFrames={SCENE_FRAMES.outroDuration}>
        <OutroScene />
      </Sequence>
    </AbsoluteFill>
  );
}
