import { AbsoluteFill, Sequence } from "remotion";
import { COLORS, FPS } from "../styles/colors";
import { IdeScene } from "./scenes/IdeScene";
import { AiThinkingScene } from "./scenes/AiThinkingScene";
import { ResultScene } from "./scenes/ResultScene";

export function SajtmaskinHeroLoop() {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.navy }}>
      <Sequence from={0} durationInFrames={5 * FPS}>
        <IdeScene />
      </Sequence>

      <Sequence from={5 * FPS} durationInFrames={5 * FPS}>
        <AiThinkingScene />
      </Sequence>

      <Sequence from={10 * FPS} durationInFrames={5 * FPS}>
        <ResultScene />
      </Sequence>
    </AbsoluteFill>
  );
}
