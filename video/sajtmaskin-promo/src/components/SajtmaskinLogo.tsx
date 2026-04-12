import { Img, staticFile } from "remotion";

export function SajtmaskinLogo({
  width = 280,
  opacity = 1,
}: {
  width?: number;
  opacity?: number;
}) {
  return (
    <Img
      src={staticFile("sajtmaskin-logo.png")}
      style={{
        width,
        height: "auto",
        opacity,
        objectFit: "contain",
      }}
    />
  );
}
