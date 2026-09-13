import { CanvasTexture, SRGBColorSpace } from "three";

export const LANYARD_NAMED_BACK_SIZE = {
  width: 1024,
  height: 1472,
} as const;

/**
 * Förnamn på 3D-kortets baksida när någon är inloggad. Utloggad lämnas
 * som `null` så cookie-/varumärkestexturen behålls.
 */
export function resolveLanyardCardBackIdentity(
  user: { name?: string | null; email?: string | null } | null | undefined,
): string | null {
  const fromName = user?.name?.trim().split(/\s+/).find(Boolean);
  if (fromName) return fromName;
  const fromEmail = user?.email?.trim().split("@")[0]?.trim();
  return fromEmail || null;
}

export function drawNamedCardBack(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  name: string,
) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#141c1e");
  gradient.addColorStop(0.5, "#0a1211");
  gradient.addColorStop(1, "#060b0c");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(45, 212, 191, 0.24)";
  ctx.lineWidth = Math.max(2, width * 0.008);
  const inset = width * 0.055;
  ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#f4f7f6";

  let fontSize = Math.round(width * 0.14);
  const maxWidth = width * 0.78;
  ctx.font = `600 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
  while (fontSize > 36 && ctx.measureText(name).width > maxWidth) {
    fontSize -= 4;
    ctx.font = `600 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
  }
  ctx.fillText(name, width / 2, height * 0.48);

  ctx.fillStyle = "rgba(244, 247, 246, 0.55)";
  ctx.font = `500 ${Math.round(width * 0.042)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText("Sajtmaskin", width / 2, height * 0.62);
}

export function createNamedCardBackTexture(name: string) {
  const { width, height } = LANYARD_NAMED_BACK_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("named card back: 2d context unavailable");
  }
  drawNamedCardBack(ctx, width, height, name);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
