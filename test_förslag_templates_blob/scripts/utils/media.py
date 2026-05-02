"""Scrape detail-page images/video and metadata from v0 template pages."""

from __future__ import annotations

import hashlib
import json
import mimetypes
import re
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import Page

URL_SKIP_SUBSTR = (
    "favicon", "gravatar.com", "/icon-",
    "googleusercontent.com", "avatar", "emoji", "twemoji",
)

EXTRACT_IMAGES_JS = r"""
() => {
  const out = new Set();
  function absolutize(u) {
    try { return new URL(u, document.baseURI).href; } catch { return null; }
  }
  function addFromSrcset(s) {
    if (!s) return;
    for (const part of s.split(",")) {
      const url = part.trim().split(/\s+/)[0];
      if (url && !url.startsWith("data:")) {
        const a = absolutize(url);
        if (a) out.add(a);
      }
    }
  }
  const og = document.querySelector('meta[property="og:image"]');
  if (og && og.content) { const a = absolutize(og.content.trim()); if (a) out.add(a); }
  const tw = document.querySelector('meta[name="twitter:image"]');
  if (tw && tw.content) { const a = absolutize(tw.content.trim()); if (a) out.add(a); }
  for (const img of document.querySelectorAll("img")) {
    const src = img.getAttribute("src");
    if (src && !src.startsWith("data:")) {
      const a = absolutize(src);
      if (a) {
        const w = img.naturalWidth || 0, h = img.naturalHeight || 0;
        if (w > 0 && h > 0 && w < 40 && h < 40) continue;
        out.add(a);
      }
    }
    addFromSrcset(img.getAttribute("srcset") || "");
  }
  for (const pic of document.querySelectorAll("picture source[srcset]"))
    addFromSrcset(pic.getAttribute("srcset") || "");
  for (const v of document.querySelectorAll("video[src]")) {
    const s = v.getAttribute("src");
    if (s && !s.startsWith("data:")) { const a = absolutize(s); if (a) out.add(a); }
  }
  for (const s of document.querySelectorAll("video source[src]")) {
    const src = s.getAttribute("src");
    if (src && !src.startsWith("data:")) { const a = absolutize(src); if (a) out.add(a); }
  }
  for (const v of document.querySelectorAll("video[poster]")) {
    const p = v.getAttribute("poster");
    if (p && !p.startsWith("data:")) { const a = absolutize(p); if (a) out.add(a); }
  }
  return [...out];
}
"""

METADATA_JS = r"""() => {
  const meta = (sel) => {
    const el = document.querySelector(sel);
    return el ? (el.getAttribute("content") || el.getAttribute("href") || "").trim() || null : null;
  };
  const h1 = document.querySelector("h1");
  const buttons = [...document.querySelectorAll("button")].map((b) => (b.textContent || "").trim()).filter(Boolean);
  return {
    url: location.href,
    h1: h1 ? h1.innerText.trim() : null,
    ogTitle: meta('meta[property="og:title"]'),
    ogDescription: meta('meta[property="og:description"]'),
    ogImage: meta('meta[property="og:image"]'),
    description: meta('meta[name="description"]'),
    canonical: (() => { const l = document.querySelector('link[rel="canonical"]'); return l ? l.href : null; })(),
    twitterTitle: meta('meta[name="twitter:title"]'),
    twitterDescription: meta('meta[name="twitter:description"]'),
    buttonSample: buttons.slice(0, 12),
  };
}"""


def should_skip_url(url: str) -> bool:
    u = url.lower()
    if u.startswith("data:") or not (u.startswith("http://") or u.startswith("https://")):
        return True
    return any(x in u for x in URL_SKIP_SUBSTR)


def scrape_detail_metadata(page: Page, template_id: str) -> dict:
    meta = page.evaluate(METADATA_JS)
    if not isinstance(meta, dict):
        meta = {}
    meta["templateId"] = template_id
    try:
        nd = page.evaluate(
            """() => {
              const el = document.getElementById("__NEXT_DATA__");
              if (!el || !el.textContent) return null;
              try {
                const j = JSON.parse(el.textContent);
                const p = j.props && j.props.pageProps;
                if (!p || typeof p !== "object") return null;
                const keys = Object.keys(p);
                const slim = {};
                for (const k of keys.slice(0, 24)) {
                  const v = p[k], t = typeof v;
                  if (t === "string" || t === "number" || t === "boolean" || v === null) slim[k] = v;
                  else if (Array.isArray(v)) slim[k] = "(array:" + v.length + ")";
                  else slim[k] = "(" + t + ")";
                }
                return { pagePropsKeys: keys, pagePropsSample: slim };
              } catch { return null; }
            }"""
        )
        meta["nextData"] = nd if isinstance(nd, dict) else None
    except Exception:
        meta["nextData"] = None
    return meta


def collect_urls_from_page(page: Page) -> list[str]:
    page.wait_for_timeout(1200)
    try:
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    except Exception:
        pass
    page.wait_for_timeout(800)
    try:
        page.evaluate("window.scrollTo(0, 0)")
    except Exception:
        pass
    page.wait_for_timeout(400)
    raw: list[str] = page.evaluate(EXTRACT_IMAGES_JS)
    seen: set[str] = set()
    return [u for u in raw if isinstance(u, str) and not should_skip_url(u) and u not in seen and not seen.add(u)]


def _ext_from_response(url: str, content_type: str | None) -> str:
    path = urlparse(url).path
    ext = Path(path).suffix
    if ext and len(ext) <= 8 and re.match(r"^\.[a-zA-Z0-9]+$", ext):
        return ext.lower()
    if content_type:
        ct = content_type.split(";")[0].strip().lower()
        ct_map = {
            "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp",
            "image/gif": ".gif", "image/avif": ".avif", "image/svg+xml": ".svg",
            "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov",
        }
        if ct in ct_map:
            return ct_map[ct]
    guess, _ = mimetypes.guess_type(url)
    if guess:
        m = mimetypes.guess_extension(guess)
        if m:
            return m
    return ".bin"


def download_url_to_dir(
    page: Page, url: str, dest_dir: Path, index: int, prefix: str = "D",
) -> tuple[bool, str | None]:
    try:
        resp = page.context.request.get(url, timeout=120_000)
        if not resp.ok:
            return False, f"http_{resp.status}"
        body = resp.body()
        ct = resp.headers.get("content-type")
        min_b = 400 if ct and "video" in ct else 80
        if len(body) < min_b:
            return False, "too_small"
        ext = _ext_from_response(url, ct)
        h = hashlib.sha256(url.encode("utf-8")).hexdigest()[:12]
        name = f"{prefix}{index:03d}_{h}{ext}"
        path = dest_dir / name
        path.write_bytes(body)
        return True, str(path)
    except Exception as e:
        return False, str(e)
