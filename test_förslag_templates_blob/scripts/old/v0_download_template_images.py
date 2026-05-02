#!/usr/bin/env python3
"""
Ladda ner förhandsbilder från v0 community-mallars sidor (en katalog per mall-id).

Använder samma session som ZIP-skriptet (auth.json / PLAYWRIGHT_STORAGE_STATE).
ID-lista: standard från out/collected-template-ids.json (nycklarna ids + templateSourceSlugs).

Exempel (PowerShell):
  cd ...\\templates_v0
  $env:PLAYWRIGHT_STORAGE_STATE="$PWD\\auth.json"
  python scripts\\v0_download_template_images.py --pace-multiplier 1.5

Bara mallar du redan laddat ZIP för (från downloaded.jsonl):
  python scripts\\v0_download_template_images.py --from-downloaded-jsonl

Hoppa över mallar som redan har bilder på disk:
  python scripts\\v0_download_template_images.py --skip-existing

Spara metadata (titel, og-beskrivning, m.m.) + ev. utdrag ur __NEXT_DATA__:
  python scripts\\v0_download_template_images.py --also-metadata

Undermappar per mall: listing/ (rutnätsförhands från JSON) och detail/ (detaljsida).

Olika id-format: strängar som "abc123", full URL …/templates/abc123, eller dict med templateId.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
import random
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import Page, sync_playwright

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

import v0_download_zips as v0z  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out"
IMAGE_ROOT = ROOT / "downloads" / "template-images"

# Dölj bilder / spår som sällan är mallsidor.
URL_SKIP_SUBSTR = (
    "favicon",
    "gravatar.com",
    "/icon-",
    "googleusercontent.com",
    "avatar",
    "emoji",
    "twemoji",
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
  if (og && og.content) {
    const a = absolutize(og.content.trim());
    if (a) out.add(a);
  }
  const tw = document.querySelector('meta[name="twitter:image"]');
  if (tw && tw.content) {
    const a = absolutize(tw.content.trim());
    if (a) out.add(a);
  }
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
  for (const pic of document.querySelectorAll("picture source[srcset]")) {
    addFromSrcset(pic.getAttribute("srcset") || "");
  }
  for (const v of document.querySelectorAll("video[src]")) {
    const s = v.getAttribute("src");
    if (s && !s.startsWith("data:")) {
      const a = absolutize(s);
      if (a) out.add(a);
    }
  }
  for (const s of document.querySelectorAll("video source[src]")) {
    const src = s.getAttribute("src");
    if (src && !src.startsWith("data:")) {
      const a = absolutize(src);
      if (a) out.add(a);
    }
  }
  for (const v of document.querySelectorAll("video[poster]")) {
    const p = v.getAttribute("poster");
    if (p && !p.startsWith("data:")) {
      const a = absolutize(p);
      if (a) out.add(a);
    }
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
    canonical: (() => {
      const l = document.querySelector('link[rel="canonical"]');
      return l ? l.href : null;
    })(),
    twitterTitle: meta('meta[name="twitter:title"]'),
    twitterDescription: meta('meta[name="twitter:description"]'),
    buttonSample: buttons.slice(0, 12),
  };
}"""


def normalize_template_id(raw: object) -> str | None:
    if raw is None:
        return None
    if isinstance(raw, dict):
        for k in ("templateId", "id", "slug"):
            v = raw.get(k)
            if isinstance(v, str) and v.strip():
                return normalize_template_id(v.strip())
        return None
    if not isinstance(raw, str):
        return None
    s = raw.strip()
    if not s:
        return None
    if "templates/" in s:
        try:
            path = urlparse(s, "https://v0.app").path.strip("/").split("/")
            if len(path) >= 2 and path[0] == "templates":
                seg = path[1].split("?")[0]
                if seg and seg not in v0z.CATEGORY_SLUGS:
                    return seg
        except Exception:
            pass
    if "/" in s or "?" in s:
        return None
    if s in v0z.CATEGORY_SLUGS:
        return None
    return s


def should_skip_url(url: str) -> bool:
    u = url.lower()
    if u.startswith("data:"):
        return True
    if not (u.startswith("http://") or u.startswith("https://")):
        return True
    return any(x in u for x in URL_SKIP_SUBSTR)


def ext_from_response(url: str, content_type: str | None) -> str:
    path = urlparse(url).path
    ext = Path(path).suffix
    if ext and len(ext) <= 8 and re.match(r"^\.[a-zA-Z0-9]+$", ext):
        return ext.lower()
    if content_type:
        ct = content_type.split(";")[0].strip().lower()
        if ct == "image/jpeg":
            return ".jpg"
        if ct == "image/png":
            return ".png"
        if ct == "image/webp":
            return ".webp"
        if ct == "image/gif":
            return ".gif"
        if ct == "image/avif":
            return ".avif"
        if ct == "image/svg+xml":
            return ".svg"
        if ct == "video/mp4":
            return ".mp4"
        if ct == "video/webm":
            return ".webm"
        if ct == "video/quicktime":
            return ".mov"
    guess, _ = mimetypes.guess_type(url)
    if guess:
        m = mimetypes.guess_extension(guess)
        if m:
            return m
    return ".bin"


def short_url_hash(url: str) -> str:
    return hashlib.sha256(url.encode("utf-8")).hexdigest()[:12]


def min_bytes_for_content_type(content_type: str | None) -> int:
    if not content_type:
        return 120
    c = content_type.split(";")[0].strip().lower()
    if c.startswith("video/"):
        return 400
    if c in ("image/gif", "image/png", "image/jpeg", "image/webp"):
        return 80
    return 120


def try_next_data_props(page: Page) -> dict | None:
    try:
        data = page.evaluate(
            """() => {
              const el = document.getElementById("__NEXT_DATA__");
              if (!el || !el.textContent) return null;
              try {
                const j = JSON.parse(el.textContent);
                const p = j.props && j.props.pageProps;
                if (!p || typeof p !== "object") return { note: "no_pageProps" };
                const keys = Object.keys(p);
                const slim = {};
                for (const k of keys.slice(0, 24)) {
                  const v = p[k];
                  const t = typeof v;
                  if (t === "string" || t === "number" || t === "boolean" || v === null)
                    slim[k] = v;
                  else if (t === "object" && v !== null && !Array.isArray(v))
                    slim[k] = "(object)";
                  else if (Array.isArray(v))
                    slim[k] = "(array:" + v.length + ")";
                  else
                    slim[k] = "(" + t + ")";
                }
                return { pagePropsKeys: keys, pagePropsSample: slim };
              } catch (e) {
                return { parseError: String(e) };
              }
            }"""
        )
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def scrape_detail_metadata(page: Page, template_id: str) -> dict:
    meta = page.evaluate(METADATA_JS)
    if not isinstance(meta, dict):
        meta = {}
    meta["templateId"] = template_id
    meta["nextData"] = try_next_data_props(page)
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
    ordered: list[str] = []
    for u in raw:
        if not isinstance(u, str) or should_skip_url(u):
            continue
        if u not in seen:
            seen.add(u)
            ordered.append(u)
    return ordered


def download_url_to_dir(
    page: Page,
    url: str,
    dest_dir: Path,
    index: int,
    prefix: str = "D",
) -> tuple[bool, str | None]:
    try:
        resp = page.context.request.get(url, timeout=120_000)
        if not resp.ok:
            return False, f"http_{resp.status}"
        body = resp.body()
        ct = resp.headers.get("content-type")
        min_b = min_bytes_for_content_type(ct)
        if len(body) < min_b:
            return False, "too_small"
        ext = ext_from_response(url, ct)
        name = f"{prefix}{index:03d}_{short_url_hash(url)}{ext}"
        path = dest_dir / name
        path.write_bytes(body)
        return True, str(path)
    except Exception as e:
        return False, str(e)


def load_ids_from_collected_json(
    path: Path,
) -> tuple[list[str], dict[str, set[str]], dict[str, list[str]]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    raw_ids = data.get("ids") or []
    id_sources: dict[str, set[str]] = {}
    ts = data.get("templateSourceSlugs") or {}
    if isinstance(ts, dict):
        for tid, slugs in ts.items():
            if isinstance(slugs, list):
                id_sources[tid] = set(str(s) for s in slugs)
    listing: dict[str, list[str]] = {}
    lp = data.get("listingPreviewsByTemplateId") or {}
    if isinstance(lp, dict):
        for tid, urls in lp.items():
            if isinstance(tid, str) and isinstance(urls, list):
                listing[tid] = [str(u) for u in urls if isinstance(u, str)]
    out_ids: list[str] = []
    seen: set[str] = set()
    for item in raw_ids:
        tid = normalize_template_id(item)
        if tid and tid not in seen:
            seen.add(tid)
            out_ids.append(tid)
            if tid not in id_sources:
                id_sources[tid] = {v0z.BROWSE_ALL_KEY}
    return out_ids, id_sources, listing


def load_ids_from_downloaded_jsonl(path: Path) -> tuple[list[str], dict[str, set[str]]]:
    out_ids: list[str] = []
    id_sources: dict[str, set[str]] = {}
    seen: set[str] = set()
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            tid = normalize_template_id(row.get("templateId") or row.get("id"))
            if not tid or tid in seen:
                continue
            seen.add(tid)
            out_ids.append(tid)
            slugs = row.get("sourceSlugs")
            if isinstance(slugs, list) and slugs:
                id_sources[tid] = set(str(s) for s in slugs)
            else:
                id_sources[tid] = {v0z.BROWSE_ALL_KEY}
    return out_ids, id_sources


def merge_listing_from_collected_json(json_path: Path) -> dict[str, list[str]]:
    if not json_path.is_file():
        return {}
    try:
        _, _, listing = load_ids_from_collected_json(json_path)
    except OSError:
        return {}
    return dict(listing)


def process_single_template_for_media(
    page: Page,
    template_id: str,
    slugs: set[str],
    listing_by_id: dict[str, list[str]],
    *,
    also_metadata: bool,
    meta_root: Path | None,
    log_path: Path,
) -> None:
    """En mall: metadata (valfritt), listing-URL:er, detaljmedia. Loggar till log_path."""
    folder_label = v0z.folder_label_from_source_slugs(slugs)
    safe_label = folder_label.replace("/", "-").replace("\\", "-")
    dest = IMAGE_ROOT / safe_label / template_id
    dest_listing = dest / "listing"
    dest_detail = dest / "detail"
    url = f"https://v0.app/templates/{template_id}"
    row_base = {
        "templateId": template_id,
        "kategoriLabel": folder_label,
        "sourceSlugs": sorted(slugs),
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=90_000)
        if also_metadata and meta_root is not None:
            meta_root.mkdir(parents=True, exist_ok=True)
            meta = scrape_detail_metadata(page, template_id)
            (meta_root / f"{template_id}.json").write_text(
                json.dumps(meta, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )

        listing_urls = [
            u
            for u in listing_by_id.get(template_id, [])
            if isinstance(u, str) and not should_skip_url(u)
        ]
        dest.mkdir(parents=True, exist_ok=True)
        listing_saved: list[str] = []
        listing_errs: list[str] = []
        if listing_urls:
            dest_listing.mkdir(parents=True, exist_ok=True)
            for j, u in enumerate(listing_urls, start=1):
                ok_dl, err = download_url_to_dir(page, u, dest_listing, j, prefix="L")
                if ok_dl:
                    listing_saved.append(err or "")
                else:
                    listing_errs.append(
                        f"{u[:80]}…:{err}" if len(u) > 80 else f"{u}:{err}"
                    )

        urls = collect_urls_from_page(page)
        detail_saved: list[str] = []
        detail_errs: list[str] = []
        if urls:
            dest_detail.mkdir(parents=True, exist_ok=True)
            for j, u in enumerate(urls, start=1):
                ok_dl, err = download_url_to_dir(page, u, dest_detail, j, prefix="D")
                if ok_dl:
                    detail_saved.append(err or "")
                else:
                    detail_errs.append(
                        f"{u[:80]}…:{err}" if len(u) > 80 else f"{u}:{err}"
                    )

        total_saved = len(listing_saved) + len(detail_saved)
        if total_saved == 0:
            print(
                f"INGA_MEDIA {template_id} (listing {len(listing_urls)}, detail {len(urls)})",
                flush=True,
            )
            with open(log_path, "a", encoding="utf-8") as f:
                f.write(
                    json.dumps(
                        {
                            **row_base,
                            "ok": False,
                            "error": "no_media_saved",
                            "listingUrls": len(listing_urls),
                            "detailUrls": len(urls),
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )
        else:
            print(
                f"OK {template_id}: listing {len(listing_saved)}/{len(listing_urls)}, "
                f"detail {len(detail_saved)}/{len(urls)} -> {dest}",
                flush=True,
            )
            with open(log_path, "a", encoding="utf-8") as f:
                f.write(
                    json.dumps(
                        {
                            **row_base,
                            "ok": True,
                            "url": url,
                            "listingFound": len(listing_urls),
                            "listingSaved": len(listing_saved),
                            "detailFound": len(urls),
                            "detailSaved": len(detail_saved),
                            "listingPaths": listing_saved,
                            "detailPaths": detail_saved,
                            "listingFailures": listing_errs,
                            "detailFailures": detail_errs,
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )
    except Exception as e:
        print(f"FAIL {template_id}: {e}", flush=True)
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(
                json.dumps(
                    {**row_base, "ok": False, "error": str(e)},
                    ensure_ascii=False,
                )
                + "\n"
            )


if __name__ == "__main__":
    print("Använd v0_sync_templates.py istället.", flush=True)
