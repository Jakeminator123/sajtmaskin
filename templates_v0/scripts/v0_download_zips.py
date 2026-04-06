#!/usr/bin/env python3
"""
v0 community templates: samla mall-id, hoppa över betalda (Buy … Credit),
öppna gratis i chatt och ladda ner ZIP via overflow-menyn.

Varför inte bara id + direkt nedladdnings-URL?
  ZIP:en kommer inte som en offentlig fil-länk (som /templates/XYZ.zip). v0 skapar
  en chatt/projekt-kontext och "Download ZIP" anropar deras backend med din
  inloggning. Därför behövs antingen sparad webbsession (auth.json) eller manuell UI.

Inloggning i samma körning (öppnar webbläsare):
  python scripts/v0_download_zips.py --login-first --limit=3
  (Tryck Enter i terminalen när du är inloggad. Session sparas till auth.json.)

Alternativ: python scripts/save_v0_auth.py  eller  PLAYWRIGHT_STORAGE_STATE=auth.json

Randomisering: shuffle + slumpad paus mellan mallar (se --seed, --no-shuffle).

Lugnare körning (surfa samtidigt): --pace-multiplier 2.5 ger ungefär ~40 % "fart" mot standardpaus.

Kategori per mall: collected JSON och downloaded.jsonl har templateSourceSlugs / sourceSlugs;
  ZIP hamnar under downloads/<svensk primärkategori>/<mall-id>/.

Insamling klickar "Load more" automatiskt per sida tills inget mer laddas (se click_load_more_*).

Alla mall-id (fler än bara översiktssidan):
  python scripts/v0_download_zips.py --all-categories --collect-only
  (Skannar /templates + varje kategorisida, Load more på varje, union av id.)

Webbläsaren stängs när skriptet är klart — det är normalt.

--pause-before-close: väntar på Enter innan webbläsaren stängs (kört klart, data sparad).

Felaktiga gamla slug:ar (404): blog-portfolio, e-commerce, login-sign-up — använd alias i CLI.

Start (PowerShell):
  cd ...\\templates_v0
  pip install -r requirements.txt && python -m playwright install chromium
  Första gången: python scripts\\v0_download_zips.py --login-first --collect-only
  Sedan: $env:PLAYWRIGHT_STORAGE_STATE="$PWD\\auth.json"
  Insamling: python scripts\\v0_download_zips.py --all-categories --collect-only
  Nedladdning: python scripts\\v0_download_zips.py --all-categories --pace-multiplier 2.5

Återuppta avbruten ZIP-nedladdning (hoppar över id i out/downloaded.jsonl eller befintlig .zip):
  python scripts\\v0_download_zips.py --all-categories --resume --pace-multiplier 2.5

Vid insamling sparas även listingPreviewsByTemplateId (miniatyrer/video från rutnätet före klick).
"""

from __future__ import annotations

import argparse
import json
import os
import random
import re
import time
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import Download, Page, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out"
DOWNLOAD_ROOT = ROOT / "downloads"

# Segment i /templates/<seg> som inte är enskilda mallar (filtreras från href).
# Inkl. felaktiga äldre slug:ar (404) så de inte räknas som mall-id.
CATEGORY_SLUGS = frozenset(
    {
        "agents",
        "ai",
        "animations",
        "apps-and-games",
        "blog-and-portfolio",
        "blog-portfolio",  # 404 på v0; får inte bli "mall-id"
        "categories",  # hub-sida Templates > Categories, inte en mall
        "components",
        "dashboards",
        "design-systems",
        "ecommerce",
        "e-commerce",  # fel slug
        "landing-pages",
        "layouts",
        "login-and-sign-up",
        "login-sign-up",  # fel slug
        "submissions",
        "website-templates",
    }
)

# De 13 kategorierna under v0 "All Template Categories" (plus ingen /submissions — ingen grid).
# Ordning spelar ingen roll; vi besöker även /templates för översikt + unika id.
BROWSE_CATEGORY_SLUGS: tuple[str, ...] = (
    "agents",
    "ai",
    "animations",
    "apps-and-games",
    "blog-and-portfolio",
    "components",
    "dashboards",
    "design-systems",
    "ecommerce",
    "landing-pages",
    "layouts",
    "login-and-sign-up",
    "website-templates",
)  # 13 st = samma som rutnätet på v0.app/templates/categories

# --category=… och svenska etiketter
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

# Nyckel när källan är översiktssidan /templates (inte en undersida).
BROWSE_ALL_KEY = "browse-all"

# Gamla CLI-värden → korrekt slug
CATEGORY_ARG_ALIASES: dict[str, str] = {
    "blog-portfolio": "blog-and-portfolio",
    "e-commerce": "ecommerce",
    "login-sign-up": "login-and-sign-up",
}


def source_key_from_scan_url(url: str) -> str:
    path = urlparse(url).path.rstrip("/")
    if path == "/templates" or not path:
        return BROWSE_ALL_KEY
    parts = path.split("/")
    if len(parts) >= 3 and parts[1] == "templates":
        return parts[2]
    return BROWSE_ALL_KEY


def folder_label_from_source_slugs(slugs: set[str]) -> str:
    """Undermapp för nedladdning: första kategorin (alfabetiskt), annars 'alla mallar'."""
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


def _count_template_ids_on_page(page: Page) -> int:
    return len(collect_template_ids(page))


def click_load_more_until_done(page: Page, label: str = "") -> None:
    """
    Klickar Load more tills knappen försvinner/disablas eller antal mall-id
    slutar växa (undviker 10+ min häng per sida om UI strular).
    """
    prefix = f"[Load more{label}] "
    prev = _count_template_ids_on_page(page)
    print(f"    {prefix}start: {prev} mall-id på sidan", flush=True)
    stagnant = 0
    max_rounds = 150
    for round_i in range(max_rounds):
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
        page.wait_for_timeout(900)
        cur = _count_template_ids_on_page(page)
        if cur > prev:
            prev = cur
            stagnant = 0
        else:
            stagnant += 1
            if stagnant >= 4:
                print(
                    f"    {prefix}stoppar: inga fler nya mall-id efter {stagnant} klick "
                    f"(normalt när listan är slut eller sidan inte laddar mer)",
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


def filter_listing_media_url(url: str) -> bool:
    u = url.lower()
    if u.startswith("data:"):
        return False
    if not (u.startswith("http://") or u.startswith("https://")):
        return False
    for s in (
        "favicon",
        "gravatar.com",
        "/icon-",
        "googleusercontent.com",
        "avatar",
        "emoji",
        "twemoji",
    ):
        if s in u:
            return False
    return True


def gather_listing_previews(page: Page) -> dict[str, list[str]]:
    raw = page.evaluate(LISTING_PREVIEW_JS)
    if not isinstance(raw, dict):
        return {}
    out: dict[str, list[str]] = {}
    for tid, urls in raw.items():
        if not isinstance(tid, str) or tid in CATEGORY_SLUGS:
            continue
        seen: set[str] = set()
        acc: list[str] = []
        if isinstance(urls, list):
            for u in urls:
                if isinstance(u, str) and filter_listing_media_url(u) and u not in seen:
                    seen.add(u)
                    acc.append(u)
        if acc:
            out[tid] = acc
    return out


def merge_listing_previews(
    dst: dict[str, list[str]], src: dict[str, list[str]]
) -> None:
    for tid, urls in src.items():
        if tid in CATEGORY_SLUGS:
            continue
        seen = set(dst.get(tid, []))
        for u in urls:
            if filter_listing_media_url(u) and u not in seen:
                seen.add(u)
                dst.setdefault(tid, []).append(u)


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
    page: Page, scan_urls: list[str]
) -> tuple[list[str], dict[str, set[str]], dict[str, list[str]], dict[str, int]]:
    merged: list[str] = []
    seen: set[str] = set()
    id_sources: dict[str, set[str]] = {}
    merged_previews: dict[str, list[str]] = {}
    sources: dict[str, int] = {}
    for u in scan_urls:
        src_key = source_key_from_scan_url(u)
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
        print(f"  {u} → {len(part_ids)} id (ackumulerat unika: {len(merged)})", flush=True)
    return merged, id_sources, merged_previews, sources


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


def classify_detail(page: Page) -> str:
    buy = page.get_by_role("button", name=re.compile(r"buy", re.I)).filter(
        has_text=re.compile(r"credit", re.I)
    )
    if buy.count() > 0 and buy.first.is_visible():
        return "paid"
    open_btn = page.get_by_role("button", name=re.compile(r"open in", re.I))
    if open_btn.count() > 0 and open_btn.first.is_visible():
        return "open"
    return "unknown"


def save_download(download: Download, dest_dir: Path) -> Path:
    dest_dir.mkdir(parents=True, exist_ok=True)
    name = download.suggested_filename or "template.zip"
    path = dest_dir / name
    download.save_as(str(path))
    return path


def download_zip_from_chat(page: Page, dest_dir: Path) -> Path:
    page.wait_for_url(re.compile(r"/chat/"), timeout=120_000)
    menu_trigger = (
        page.locator('[class*="header-module"]').last.locator(
            'button[aria-haspopup="menu"]'
        ).first
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
    return save_download(dl_info.value, dest_dir)


def process_free_template(
    page: Page, template_id: str, kategori_label: str
) -> tuple[bool, str | None, str | None]:
    try:
        url = f"https://v0.app/templates/{template_id}"
        page.goto(url, wait_until="domcontentloaded", timeout=60_000)
        page.wait_for_timeout(1500)
        kind = classify_detail(page)
        if kind == "paid":
            return False, None, "paid"
        if kind != "open":
            return False, None, f"unexpected_state:{kind}"
        open_btn = page.get_by_role("button", name=re.compile(r"open in", re.I)).first
        open_btn.click()
        page.wait_for_url(re.compile(r"/chat/"), timeout=120_000)
        safe = (
            DOWNLOAD_ROOT
            / kategori_label.replace("/", "-").replace("\\", "-")
            / template_id
        )
        path = download_zip_from_chat(page, safe)
        return True, str(path), None
    except Exception as e:
        return False, None, str(e)


def append_jsonl(path: Path, obj: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(obj, ensure_ascii=False) + "\n")


def load_already_downloaded_template_ids(jsonl_path: Path) -> set[str]:
    ids: set[str] = set()
    if not jsonl_path.is_file():
        return ids
    with open(jsonl_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
                tid = row.get("templateId")
                if isinstance(tid, str):
                    ids.add(tid)
            except json.JSONDecodeError:
                pass
    return ids


def template_folder_has_valid_zip(template_id: str, min_bytes: int = 500) -> bool:
    for z in DOWNLOAD_ROOT.glob(f"**/{template_id}/*.zip"):
        try:
            if z.is_file() and z.stat().st_size >= min_bytes:
                return True
        except OSError:
            pass
    return False


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="v0 templates: collect & download ZIP")
    p.add_argument("--collect-only", action="store_true")
    p.add_argument("--limit", type=int, default=None, help="Max antal mallar att ladda ner")
    p.add_argument("--category", type=str, default=None, help="t.ex. landing-pages")
    p.add_argument("--list", type=str, default=None, dest="list_url", help="Full list-URL")
    p.add_argument("--seed", type=int, default=None, help="PRNG-seed (reproducerbar ordning)")
    p.add_argument("--no-shuffle", action="store_true", help="Behåll ordning från sidan")
    p.add_argument(
        "--sleep-min",
        type=float,
        default=0.6,
        help="Min sekunder mellan mallar (download-läge)",
    )
    p.add_argument(
        "--sleep-max",
        type=float,
        default=2.2,
        help="Max sekunder mellan mallar (download-läge)",
    )
    p.add_argument(
        "--pace-multiplier",
        type=float,
        default=1.0,
        help="Paus mellan mallar multipliceras med detta (t.ex. 2.5 ≈ '40%% hastighet' om du vill surfa samtidigt). Min ~0.05.",
    )
    p.add_argument(
        "--login-first",
        action="store_true",
        help="Starta synlig webbläsare: logga in på v0, tryck Enter i terminalen, sedan fortsätter skriptet",
    )
    p.add_argument(
        "--auth-out",
        type=str,
        default=None,
        help="Var cookies sparas när --login-first används (standard: auth.json i projektroten)",
    )
    p.add_argument(
        "--all-categories",
        action="store_true",
        help="Samla id från /templates plus varje kategori (Load more på varje sida), slå ihop unika",
    )
    p.add_argument(
        "--pause-before-close",
        action="store_true",
        help="Vänta på Enter i terminalen innan webbläsaren stängs (skriptet är annars färdigt)",
    )
    p.add_argument(
        "--resume",
        action="store_true",
        help="Hoppa över mall-id som redan finns i out/downloaded.jsonl eller har .zip under downloads/.../id/",
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()
    category_slug: str | None = None
    if args.category:
        category_slug = CATEGORY_ARG_ALIASES.get(args.category, args.category)
        if category_slug != args.category:
            print(
                f"Tips: --category {args.category!r} → kör med slug {category_slug!r} (v0.app)",
                flush=True,
            )

    if args.all_categories and (args.category or args.list_url):
        print(
            "Tips: --all-categories är aktivt — --category / --list ignoreras för insamling.",
            flush=True,
        )

    if args.all_categories:
        list_url = "https://v0.app/templates (+ alla kategorier)"
        kategori_label = KATEGORI_SV["all"]
    else:
        list_url = args.list_url or (
            f"https://v0.app/templates/{category_slug}"
            if category_slug
            else "https://v0.app/templates"
        )
        kategori_label = (
            KATEGORI_SV[category_slug]
            if category_slug and category_slug in KATEGORI_SV
            else KATEGORI_SV["all"]
        )
    storage = os.environ.get("PLAYWRIGHT_STORAGE_STATE", "").strip() or None
    if not storage and (ROOT / "auth.json").exists():
        storage = str(ROOT / "auth.json")
    headless = os.environ.get("HEADLESS", "1") != "0"
    if args.login_first:
        headless = False
        storage = None

    OUT.mkdir(parents=True, exist_ok=True)
    DOWNLOAD_ROOT.mkdir(parents=True, exist_ok=True)

    rng = random.Random(args.seed)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        ctx_kwargs: dict = {"viewport": {"width": 1400, "height": 900}}
        if storage:
            ctx_kwargs["storage_state"] = storage
        context = browser.new_context(**ctx_kwargs)
        page = context.new_page()

        if args.all_categories:
            start_url = "https://v0.app/templates"
        else:
            start_url = list_url

        print(f"Start: {start_url} (kategori: {kategori_label})", flush=True)
        page.goto(start_url, wait_until="domcontentloaded", timeout=60_000)

        if args.login_first:
            print(
                "\n--- Inloggning ---\n"
                "Ett Chromium-fönster är öppet. Logga in på v0/Vercel om du behöver.\n"
                "När mall-listan syns och du är redo: tryck Enter här i terminalen.\n",
                flush=True,
            )
            input("Tryck Enter för att fortsätta … ")

        sources: dict[str, int] = {}
        id_sources: dict[str, set[str]] = {}
        merged_previews: dict[str, list[str]] = {}
        if args.all_categories:
            scan_urls = ["https://v0.app/templates"] + [
                f"https://v0.app/templates/{slug}" for slug in BROWSE_CATEGORY_SLUGS
            ]
            ids, id_sources, merged_previews, sources = collect_templates_scan(page, scan_urls)
        else:
            ids, part_pv = collect_ids_from_url(page, list_url)
            merge_listing_previews(merged_previews, part_pv)
            sk = category_slug or BROWSE_ALL_KEY
            id_sources = {tid: {sk} for tid in ids}
            sources = {list_url: len(ids)}

        print(f"Hittade {len(ids)} unika mall-id totalt.", flush=True)
        n_prev = sum(len(v) for v in merged_previews.values())
        print(f"Listing-förhands-URL:er för {len(merged_previews)} mall(ar), totalt {n_prev} länkar.", flush=True)

        links_path = OUT / "collected-template-ids.json"
        payload: dict = {
            "listUrl": list_url,
            "kategoriLabel": kategori_label,
            "ids": ids,
            "count": len(ids),
            "templateSourceSlugs": {k: sorted(v) for k, v in sorted(id_sources.items())},
            "listingPreviewsByTemplateId": merged_previews,
        }
        if args.all_categories:
            payload["sources"] = sources
        links_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"Sparade id-lista: {links_path}", flush=True)

        def save_auth_if_needed() -> None:
            if not args.login_first:
                return
            auth_path = Path(args.auth_out) if args.auth_out else ROOT / "auth.json"
            context.storage_state(path=str(auth_path))
            print(
                f"\nSession sparad: {auth_path}\n"
                f"Nästa gång (headless): set PLAYWRIGHT_STORAGE_STATE={auth_path}",
                flush=True,
            )

        def close_browser() -> None:
            if args.pause_before_close:
                input(
                    "\n(Köret lyckades — data är redan sparad.) "
                    "Tryck Enter för att stänga Chromium … "
                )
            browser.close()

        if args.collect_only:
            save_auth_if_needed()
            close_browser()
            return

        if not storage and not args.login_first:
            print(
                "Varning: ingen sparad session — sätt PLAYWRIGHT_STORAGE_STATE eller kör med --login-first.",
                flush=True,
            )

        to_process = list(ids)
        if not args.no_shuffle:
            rng.shuffle(to_process)
        if args.limit is not None:
            to_process = to_process[: max(0, args.limit)]

        pm = max(0.05, float(args.pace_multiplier))
        resume_ids = (
            load_already_downloaded_template_ids(OUT / "downloaded.jsonl")
            if args.resume
            else set()
        )
        if args.resume:
            print(
                f"--resume: {len(resume_ids)} id från downloaded.jsonl; "
                "ZIP på disk räknas också.",
                flush=True,
            )
        print(
            f"Bearbetar {len(to_process)} mall(ar), shuffle={'av' if args.no_shuffle else 'på'}, "
            f"seed={repr(args.seed)}, pace-multiplier={pm}",
            flush=True,
        )

        for i, template_id in enumerate(to_process):
            if args.resume and (
                template_id in resume_ids or template_folder_has_valid_zip(template_id)
            ):
                print(f"SKIP (resume) {template_id}", flush=True)
                continue
            slugs = id_sources.get(template_id, {BROWSE_ALL_KEY})
            folder_label = folder_label_from_source_slugs(slugs)
            row = {
                "templateId": template_id,
                "kategoriLabel": folder_label,
                "sourceSlugs": sorted(slugs),
                "sourceLabelsSv": source_labels_sv(slugs),
                "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
            ok, path, err = process_free_template(page, template_id, folder_label)
            if ok:
                print(f"OK {template_id} -> {path}", flush=True)
                append_jsonl(OUT / "downloaded.jsonl", {**row, "path": path})
            elif err == "paid":
                print(f"SKIP (betald) {template_id}", flush=True)
                append_jsonl(
                    OUT / "paid-skipped.jsonl", {**row, "reason": "buy_credit"}
                )
            else:
                print(f"FAIL {template_id}: {err}", flush=True)
                append_jsonl(OUT / "errors.jsonl", {**row, "error": err})

            if i < len(to_process) - 1 and args.sleep_max > 0:
                time.sleep(rng.uniform(args.sleep_min, args.sleep_max) * pm)

        save_auth_if_needed()
        close_browser()


if __name__ == "__main__":
    main()
