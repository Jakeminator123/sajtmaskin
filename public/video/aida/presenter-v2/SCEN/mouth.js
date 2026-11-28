// Tiles from Alina's talk plate. The rounded vowel uses a registered Runway mouth patch.
const mouthTiles = ["rest", "open", "round", "wide", "teeth", "mid"];
const mouthAtlas = new Image();
mouthAtlas.src = "../TAL/munformer-mjuk.webp";

function positionMouth(stage, canvas) {
  const rect = presenterRect(stage.clientWidth, stage.clientHeight, 1080 / 1440);
  const scale = rect.width / 1080;
  Object.assign(canvas.style, {
    left: rect.left + 450 * scale + "px", top: rect.top + 380 * scale + "px",
    width: 180 * scale + "px", height: 120 * scale + "px",
  });
}

// Integral of a triangular window centred on the audio clock. Short letter cues
// contribute in proportion to their duration; sustained vowels can reach a full pose.
const mouthRadius = 0.075;
function mouthWindow(seconds) {
  const t = seconds / mouthRadius;
  if (t <= -1) return 0;
  if (t >= 1) return 1;
  return t < 0 ? (1 + t) ** 2 / 2 : 1 - (1 - t) ** 2 / 2;
}

function paintMouth(canvas, cues, time) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 180, 120);
  if (!mouthAtlas.complete || !mouthAtlas.naturalWidth) return;
  const weights = [1, 0, 0, 0, 0, 0];
  for (const [start, end, shape] of cues) {
    if (start >= time + mouthRadius) break;
    if (end <= time - mouthRadius || shape === "rest") continue;
    const slot = mouthTiles.indexOf(shape);
    if (slot < 1) continue;
    const share = mouthWindow(end - time) - mouthWindow(start - time);
    weights[slot] += share;
    weights[0] -= share;
  }
  if (weights[0] >= 1) return;
  ctx.globalCompositeOperation = "lighter";
  for (const [slot, opacity] of weights.entries()) {
    if (opacity <= 0) continue;
    ctx.globalAlpha = Math.min(1, opacity);
    ctx.drawImage(mouthAtlas, slot * 180, 0, 180, 120, 0, 0, 180, 120);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

// MuseTalk clips share the HD talk plate. Compress the central lip opening
// around the resting seam while keeping the outside of the lips in place.
const videoMouth = document.createElement("canvas");
videoMouth.width = 180;
videoMouth.height = 120;
const sourceRows = [0, 35, 46, 70, 85, 120];
const displayRows = [0, 35, 49, 67, 85, 120];
let lastMouthSource = -1, lastMouthTime = -1;

function paintVideoMouth(canvas, video, version, time) {
  if (video.videoWidth !== 1080 || video.videoHeight !== 1440 ||
      !mouthAtlas.complete || !mouthAtlas.naturalWidth) {
    canvas.hidden = true;
    return;
  }
  const elapsed = time - lastMouthTime;
  if (version !== lastMouthSource || elapsed !== 0 || canvas.hidden) {
    const history = videoMouth.getContext("2d");
    const continuous = version === lastMouthSource && elapsed > 0 && elapsed < 0.12 && !canvas.hidden;
    history.globalAlpha = continuous ? 1 - Math.exp(-elapsed / 0.028) : 1;
    for (let i = 1; i < sourceRows.length; i++) {
      history.drawImage(video, 450, 380 + sourceRows[i - 1], 180, sourceRows[i] - sourceRows[i - 1],
        0, displayRows[i - 1], 180, displayRows[i] - displayRows[i - 1]);
    }
    lastMouthSource = version;
    lastMouthTime = time;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, 180, 120);
    ctx.drawImage(videoMouth, 0, 0);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mouthAtlas, 0, 0, 180, 120, 0, 0, 180, 120);
    ctx.globalCompositeOperation = "source-over";
  }
  canvas.hidden = false;
}
