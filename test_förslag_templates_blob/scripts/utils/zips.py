"""ZIP download + template ID collection from v0.app."""

from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import Download, Page

ROOT = Path(__file__).resolve().parent.parent.parent
OUT = ROOT / "out"
DOWNLOAD_ROOT = ROOT / "downloads"

CATEGORY_SLUGS = frozenset({
    "agents", "ai", "animations", "apps-and-games",
    "blog-and-portfolio", "blog-portfolio", "categories",
    "components", "dashboards", "design-systems", "ecommerce",
    "e-commerce", "landing-pages", "layouts",
    "login-and-sign-up", "login-sign-up", "submissions",
    "website-templates",
})

BROWSE_CATEGORY_SLUGS: tuple[str, ...] = (
    "agents", "ai", "animations", "apps-and-games",
    "blog-and-portfolio", "components", "dashboards",
    "design-systems", "ecommerce", "landing-pages", "layouts",
    "login-and-sign-up", "website-templates",
)

KATEGORI_SV: dict[str, str] = {
    "apps-and-games": "appar och spel",
    "landing-pages": "landningssidor",
    "dashboards": "instrumentpaneler",
    "components": "komponenter",
    "login-and-sign-up": "inloggning och registrering",
    "blog-and-portfolio": "blogg och portfolio",
    "ecommerce": "e-handel",
    "ai": "AI",
    "animations": "animationer",
    "design-systems": "designsystem",
    "layouts": "layouter",
    "website-templates": "webbplatsmallar",
    "agents": "agenter",
    "submissions": "inskickade",
    "all": "alla mallar",
}

BROWSE_ALL_KEY = "browse-all"


def folder_label_from_source_slugs(slugs: set[str]) -> str:
    non = sorted(s for s in slugs if s != BROWSE_ALL_KEY)
    if non:
        return KATEGORI_SV.get(non[0], non[0])
    return KATEGORI_SV["all"]


def source_labels_sv(slugs: set[str]) -> list[str]:
    labels: list[str] = []
    for s in sorted(slugs):
        if s == BROWSE_ALL_KEY:
            labels.append(KATEGORI_SV["all"])
        else:
            labels.append(KATEGORI_SV.get(s, s))
    return labels


def template_id_from_href(href: str) -> str | None:
    try:
        path = urlparse(href, "https://v0.app").path.strip("/")
        parts = path.split("/")
        if len(parts) != 2 or parts[0] != "templates":
            return None
        seg = parts[1]
        if seg in CATEGORY_SLUGS:
            return None
        return seg
    except Exception:
        return None


def collect_template_ids(page: Page) -> list[str]:
    hrefs = page.evaluate(
        """() => {
          const set = new Set();
          for (const a of document.querySelectorAll('a[href^="/templates/"]')) {
            const h = a.getAttribute('href');
            if (h) set.add(h.split('?')[0]);
          }
          return [...set];
        }"""
    )
    ids: list[str] = []
    for h in hrefs:
        tid = template_id_from_href(h)
        if tid:
            ids.append(tid)
    return list(dict.fromkeys(ids))


def click_load_more_until_done(page: Page, label: str = "") -> None:
    prefix = f"[Load more{label}] "
    prev = len(collect_template_ids(page))
    print(f"    {prefix}start: {prev} mall-id på sidan", flush=True)
    stagnant = 0
    for round_i in range(150):
        btn = page.get_by_role("button", name=re.compile(r"^Load More$", re.I))
        if btn.count() == 0:
            print(f"    {prefix}klar: ingen knapp", flush=True)
            break
        first = btn.first
        try:
            first.scroll_into_view_if_needed()
        except Exception:
            pass
        if not first.is_visible():
            print(f"    {prefix}klar: knapp ej synlig", flush=True)
            break
        if first.is_disabled():
            print(f"    {prefix}klar: knapp inaktiv", flush=True)
            break
        first.click()
        # Let the grid finish loading (headless can lag behind a fixed sleep).
        try:
            page.wait_for_load_state("networkidle", timeout=15_000)
        except Exception:
            pass
        page.wait_for_timeout(300)
        cur = len(collect_template_ids(page))
        if cur > prev:
            prev = cur
            stagnant = 0
        else:
            stagnant += 1
            if stagnant >= 8:
                print(
                    f"    {prefix}stoppar: {stagnant} klick utan nya id",
                    flush=True,
                )
                break
        if (round_i + 1) % 12 == 0:
            print(f"    {prefix}… #{round_i + 1} klick, {cur} mall-id", flush=True)


LISTING_PREVIEW_JS = r"""() => {
  const out = {};
  function add(tid, url) {
    if (!tid || !url || url.startsWith("data:")) return;
    if (!out[tid]) out[tid] = [];
    if (!out[tid].includes(url)) out[tid].push(url);
  }
  function abs(u) {
    try { return new URL(u, document.baseURI).href; } catch { return null; }
  }
  function addSrcset(ss, tid) {
    if (!ss) return;
    for (const part of ss.split(",")) {
      const u = part.trim().split(/\s+/)[0];
      if (u && !u.startsWith("data:")) {
        const x = abs(u);
        if (x) add(tid, x);
      }
    }
  }
  function extract(root, tid) {
    root.querySelectorAll("img[src], img[srcset]").forEach((img) => {
      const s = img.getAttribute("src");
      if (s && !s.startsWith("data:")) {
        const x = abs(s);
        if (x) add(tid, x);
      }
      addSrcset(img.getAttribute("srcset") || "", tid);
    });
    root.querySelectorAll("video[src], video source[src]").forEach((el) => {
      const s = el.getAttribute("src");
      if (s) { const x = abs(s); if (x) add(tid, x); }
    });
    root.querySelectorAll("video[poster]").forEach((v) => {
      const p = v.getAttribute("poster");
      if (p) { const x = abs(p); if (x) add(tid, x); }
    });
  }
  for (const a of document.querySelectorAll('a[href^="/templates/"]')) {
    const href = (a.getAttribute("href") || "").split("?")[0];
    const segs = href.replace(/^\/+/, "").split("/");
    if (segs.length !== 2 || segs[0] !== "templates") continue;
    const tid = segs[1];
    extract(a, tid);
    if (a.parentElement) extract(a.parentElement, tid);
    if (a.parentElement && a.parentElement.parentElement)
      extract(a.parentElement.parentElement, tid);
  }
  return out;
}"""

_SKIP_SUBSTRINGS = (
    "favicon", "gravatar.com", "/icon-",
    "googleusercontent.com", "avatar", "emoji", "twemoji",
)


def filter_listing_media_url(url: str) -> bool:
    u = url.lower()
    if u.startswith("data:") or not (u.startswith("http://") or u.startswith("https://")):
        return False
    return not any(s in u for s in _SKIP_SUBSTRINGS)


def gather_listing_previews(page: Page) -> dict[str, list[str]]:
    raw = page.evaluate(LISTING_PREVIEW_JS)
    if not isinstance(raw, dict):
        return {}
    out: dict[str, list[str]] = {}
    for tid, urls in raw.items():
        if not isinstance(tid, str) or tid in CATEGORY_SLUGS:
            continue
        seen: set[str] = set()
        acc = [u for u in (urls or []) if isinstance(u, str) and filter_listing_media_url(u) and u not in seen and not seen.add(u)]
        if acc:
            out[tid] = acc
    return out


def merge_listing_previews(dst: dict[str, list[str]], src: dict[str, list[str]]) -> None:
    for tid, urls in src.items():
        if tid in CATEGORY_SLUGS:
            continue
        seen = set(dst.get(tid, []))
        for u in urls:
            if filter_listing_media_url(u) and u not in seen:
                seen.add(u)
                dst.setdefault(tid, []).append(u)


def _source_key(url: str) -> str:
    path = urlparse(url).path.rstrip("/")
    if path == "/templates" or not path:
        return BROWSE_ALL_KEY
    parts = path.split("/")
    if len(parts) >= 3 and parts[1] == "templates":
        return parts[2]
    return BROWSE_ALL_KEY


def collect_ids_from_url(page: Page, url: str) -> tuple[list[str], dict[str, list[str]]]:
    page.goto(url, wait_until="domcontentloaded", timeout=90_000)
    short = url.replace("https://v0.app", "") or "/"
    click_load_more_until_done(page, label=f" {short}")
    ids = collect_template_ids(page)
    print(f"    Extraherar listing-URL:er ({len(ids)} kort) …", end="", flush=True)
    previews = gather_listing_previews(page)
    n = sum(len(v) for v in previews.values())
    print(f" {n} URL:er.", flush=True)
    return ids, previews


def collect_templates_scan(
    page: Page, scan_urls: list[str],
) -> tuple[list[str], dict[str, set[str]], dict[str, list[str]], dict[str, int]]:
    merged: list[str] = []
    seen: set[str] = set()
    id_sources: dict[str, set[str]] = {}
    merged_previews: dict[str, list[str]] = {}
    sources: dict[str, int] = {}
    for u in scan_urls:
        src_key = _source_key(u)
        try:
            part_ids, part_pv = collect_ids_from_url(page, u)
        except Exception as e:
            print(f"Varning: kunde inte läsa {u}: {e}", flush=True)
            continue
        sources[u] = len(part_ids)
        merge_listing_previews(merged_previews, part_pv)
        for tid in part_ids:
            id_sources.setdefault(tid, set()).add(src_key)
            if tid not in seen:
                seen.add(tid)
                merged.append(tid)
        print(f"  {u} → {len(part_ids)} id (unika: {len(merged)})", flush=True)
    return merged, id_sources, merged_previews, sources


def classify_detail(page: Page) -> str:
    buy = page.get_by_role("button", name=re.compile(r"buy", re.I)).filter(
        has_text=re.compile(r"credit", re.I)
    )
    if buy.count() > 0 and buy.first.is_visible():
        return "paid"
    credit_span = page.locator("button >> text=/\\d+\\s*Credit/i")
    if credit_span.count() > 0 and credit_span.first.is_visible():
        return "paid"
    open_btn = page.get_by_role("button", name=re.compile(r"open in", re.I))
    if open_btn.count() > 0 and open_btn.first.is_visible():
        return "open"
    return "unknown"


def download_zip_from_chat(page: Page, dest_dir: Path) -> Path:
    page.wait_for_url(re.compile(r"/chat/"), timeout=120_000)
    menu_trigger = (
        page.locator('[class*="header-module"]')
        .last.locator('button[aria-haspopup="menu"]')
        .first
    )
    try:
        menu_trigger.wait_for(state="visible", timeout=30_000)
    except Exception:
        page.locator('button[aria-haspopup="menu"]').first.wait_for(
            state="visible", timeout=15_000
        )
    with page.expect_download(timeout=180_000) as dl_info:
        try:
            menu_trigger.click(timeout=5000)
        except Exception:
            page.locator('button[aria-haspopup="menu"]').first.click()
        zip_item = page.get_by_role("menuitem", name=re.compile(r"download zip", re.I)).first
        for _ in range(90):
            if zip_item.is_enabled():
                break
            page.wait_for_timeout(1000)
        zip_item.click(timeout=30_000)
    dest_dir.mkdir(parents=True, exist_ok=True)
    name = dl_info.value.suggested_filename or "template.zip"
    path = dest_dir / name
    dl_info.value.save_as(str(path))
    return path


def append_jsonl(path: Path, obj: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(obj, ensure_ascii=False) + "\n")
