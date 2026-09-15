"use strict";

const {
  PREVIEW_BACKDROP_POSTER_URL,
  PREVIEW_BACKDROP_VIDEO_SOURCES,
} = require("./preview-backdrop-media.js");

/**
 * Machine-readable boot/error marker. Primary signal for
 * `classifyPreviewPageProbe` in the main app. Titles stay on the old
 * Swedish strings so an older production app still classifies a newer
 * Fly host page during a split rollout.
 */
const PREVIEW_BOOT_MARKER_NAME = "sajtmaskin-preview-boot";
const PREVIEW_BOOT_MARKER_VALUES = Object.freeze(["starting", "recovering", "error"]);

const PREVIEW_BOOT_TITLES = Object.freeze({
  starting: "Startar preview",
  recovering: "Startar om preview",
  error: "Preview kunde inte starta",
});

const PREVIEW_BOOT_HEADINGS = Object.freeze({
  starting: "Sajten startar",
  recovering: "Sajten startas om",
  error: "Preview kunde inte starta",
});

const PREVIEW_BOOT_INTROS = Object.freeze({
  starting: "Preview byggs och startas. Sidan laddar om automatiskt om några sekunder.",
  recovering: "Preview startas om. Sidan laddar om automatiskt om några sekunder.",
  error: "Uppstarten misslyckades. Försök igen från byggaren.",
});

function isPreviewBootVariant(value) {
  return PREVIEW_BOOT_MARKER_VALUES.includes(value);
}

function videoSourcesHtml() {
  return PREVIEW_BACKDROP_VIDEO_SOURCES.map(
    (source) => `        <source src="${source.src}" type="${source.type}" />`,
  ).join("\n");
}

function renderPreviewPlaceholderPage(variant) {
  if (!isPreviewBootVariant(variant)) {
    throw new Error(`unknown preview placeholder variant: ${variant}`);
  }
  const title = PREVIEW_BOOT_TITLES[variant];
  const heading = PREVIEW_BOOT_HEADINGS[variant];
  const intro = PREVIEW_BOOT_INTROS[variant];
  const motion = variant !== "error";
  const refresh = motion ? `\n    <meta http-equiv="refresh" content="4" />` : "";
  const video = motion
    ? `
      <video id="sm-boot-video" class="video" poster="${PREVIEW_BACKDROP_POSTER_URL}" muted playsinline loop preload="auto" tabindex="-1">
${videoSourcesHtml()}
      </video>`
    : "";
  const playbackScript = motion
    ? `
    <script>
      (function () {
        var reduce = false;
        try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
        try { if (navigator.connection && navigator.connection.saveData) reduce = true; } catch (e) {}
        var video = document.getElementById("sm-boot-video");
        if (reduce) {
          document.documentElement.classList.add("sm-boot-still");
          if (video && video.parentNode) video.parentNode.removeChild(video);
          return;
        }
        if (!video) return;
        var key = "sajtmaskin-preview-boot-t";
        var persist = true;
        var restore = function () {
          try {
            var saved = parseFloat(sessionStorage.getItem(key) || "");
            if (!(saved > 0.25) || !isFinite(saved)) return;
            persist = false;
            video.currentTime = saved;
            video.addEventListener("seeked", function () { persist = true; }, { once: true });
            setTimeout(function () { persist = true; }, 800);
          } catch (e) {}
        };
        video.addEventListener("loadedmetadata", restore, { once: true });
        video.muted = true;
        video.addEventListener("timeupdate", function () {
          if (!persist || video.currentTime < 0.25) return;
          try { sessionStorage.setItem(key, String(video.currentTime)); } catch (e) {}
        });
        video.addEventListener("playing", function () {
          video.classList.add("is-playing");
        });
        var play = video.play();
        if (play && typeof play.catch === "function") play.catch(function () {});
      })();
    </script>`
    : "";

  return `<!doctype html>
<html lang="sv" data-${PREVIEW_BOOT_MARKER_NAME}="${variant}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="${PREVIEW_BOOT_MARKER_NAME}" content="${variant}" />
    <title>${title}</title>${refresh}
    <style>
      html, body { margin: 0; min-height: 100%; background: #181328; color: #e8e4f2; font-family: system-ui, sans-serif; }
      .scene { position: relative; isolation: isolate; min-height: 100vh; display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 2rem 1.5rem 4rem; }
      .poster, .video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center; }
      .video { opacity: 0; transition: opacity 300ms ease; }
      .video.is-playing { opacity: 1; }
      .card { position: relative; z-index: 1; width: min(28rem, 100%); background: #211b38; border: 1px solid rgba(196,181,253,0.3); border-radius: 1rem; box-shadow: 0 15px 50px rgba(43,16,51,0.4); text-align: center; overflow: hidden; }
      .chrome { display: flex; align-items: center; gap: 0.35rem; height: 2.25rem; padding: 0 0.9rem; border-bottom: 1px solid rgba(196,181,253,0.15); background: rgba(167,139,250,0.1); }
      .dot { width: 0.375rem; height: 0.375rem; border-radius: 999px; background: rgba(196,181,253,0.4); }
      .chrome-label { margin-left: auto; font-size: 8px; letter-spacing: 0.13em; color: rgba(221,214,254,0.8); }
      .content { padding: 1.5rem 1.5rem 1.75rem; color: #c4b5fd; }
      h1 { margin: 0 0 0.75rem; font-size: 1.35rem; color: #f5f3ff; }
      p { margin: 0; line-height: 1.5; }
      @media (prefers-reduced-motion: reduce) {
        .video { display: none; transition: none; }
      }
      html.sm-boot-still .video { display: none; }
    </style>
  </head>
  <body>
    <div class="scene">
      <img class="poster" src="${PREVIEW_BACKDROP_POSTER_URL}" alt="" />
      ${video}
      <main class="card">
        <div class="chrome" aria-hidden="true">
          <span class="dot"></span><span class="dot"></span><span class="dot"></span>
          <span class="chrome-label">FÖRHANDSVISNING</span>
        </div>
        <div class="content">
          <h1>${heading}</h1>
          <p>${intro}</p>
        </div>
      </main>
    </div>
    ${playbackScript}
  </body>
</html>`;
}

module.exports = {
  PREVIEW_BOOT_HEADINGS,
  PREVIEW_BOOT_INTROS,
  PREVIEW_BOOT_MARKER_NAME,
  PREVIEW_BOOT_MARKER_VALUES,
  PREVIEW_BOOT_TITLES,
  isPreviewBootVariant,
  renderPreviewPlaceholderPage,
};
