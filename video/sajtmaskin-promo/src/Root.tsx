import { Composition } from "remotion";
import { SajtmaskinPromo } from "./compositions/SajtmaskinPromo";
import { SajtmaskinHeroLoop } from "./compositions/SajtmaskinHeroLoop";
import { FPS, WIDTH, HEIGHT, SCENE_FRAMES } from "./styles/colors";

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="SajtmaskinPromo"
        component={SajtmaskinPromo}
        durationInFrames={SCENE_FRAMES.total}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="SajtmaskinHeroLoop"
        component={SajtmaskinHeroLoop}
        durationInFrames={15 * FPS}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
    </>
  );
}
