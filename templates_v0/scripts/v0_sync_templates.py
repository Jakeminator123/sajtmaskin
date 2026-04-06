#!/usr/bin/env python3
"""
Interaktivt skript för v0 templates. Analyserar vad varje mall saknar
(metadata, listing-bilder, detail-bilder, ZIP) och fyller bara luckorna.

Kör:  python scripts/v0_sync_templates.py
"""

from __future__ import annotations

import json
import os
import random
import sys
import time
from dataclasses import dataclass
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

import v0_download_template_images as vimg
import v0_download_zips as vz

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out"
COLLECTED = OUT / "collected-template-ids.json"
META_ROOT = OUT / "template-metadata"


# ---------------------------------------------------------------------------
# Per-template status
# ---------------------------------------------------------------------------

@dataclass
class TemplateGap:
    tid: str
    slugs: set[str]
    has_zip: bool
    has_metadata: bool
    has_detail: bool
    has_listing: bool
    is_paid: bool

    @property
    def complete(self) -> bool:
        return self.is_paid or (self.has_zip and self.has_metadata and self.has_detail and self.has_listing)

    @property
    def needs_page_visit(self) -> bool:
        if self.is_paid:
            return False
        return not self.has_metadata or not self.has_detail or not self.has_zip

    @property
    def missing_parts(self) -> list[str]:
        if self.is_paid:
            return []
        parts = []
        if not self.has_metadata:
            parts.append("metadata")
        if not self.has_listing:
            parts.append("listing")
        if not self.has_detail:
            parts.append("detail")
        if not self.has_zip:
            parts.append("ZIP")
        return parts


def _dir_has_files(d: Path) -> bool:
    try:
        return d.is_dir() and any(d.iterdir())
    except OSError:
        return False


def _load_paid_ids() -> set[str]:
    paid: set[str] = set()
    p = OUT / "paid-skipped.jsonl"
    if not p.is_file():
        return paid
    with open(p, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
                tid = row.get("templateId")
                if isinstance(tid, str):
                    paid.add(tid)
            except json.JSONDecodeError:
                pass
    return paid


def _scan_zips_on_disk() -> set[str]:
    """En enda scan av downloads/ för att hitta alla mall-id som har en .zip."""
    found: set[str] = set()
    if not vz.DOWNLOAD_ROOT.is_dir():
        return found
    for zf in vz.DOWNLOAD_ROOT.glob("**/*.zip"):
        try:
            if zf.is_file() and zf.stat().st_size >= 500:
                found.add(zf.parent.name)
        except OSError:
            pass
    return found


def _scan_media_on_disk() -> dict[str, Path]:
    """Scan template-images/ en gång. Returnerar tid → sökväg (oavsett kategori-mapp)."""
    found: dict[str, Path] = {}
    if not vimg.IMAGE_ROOT.is_dir():
        return found
    for cat_dir in vimg.IMAGE_ROOT.iterdir():
        if not cat_dir.is_dir():
            continue
        for tid_dir in cat_dir.iterdir():
            if tid_dir.is_dir():
                found[tid_dir.name] = tid_dir
    return found


def analyze(
    ids: list[str],
    id_sources: dict[str, set[str]],
    listing_by_id: dict[str, list[str]],
) -> list[TemplateGap]:
    downloaded = vz.load_already_downloaded_template_ids(OUT / "downloaded.jsonl")
    zips_on_disk = _scan_zips_on_disk()
    media_on_disk = _scan_media_on_disk()
    paid = _load_paid_ids()
    results: list[TemplateGap] = []
    for tid in ids:
        slugs = id_sources.get(tid, {vz.BROWSE_ALL_KEY})
        img_base = media_on_disk.get(tid)

        has_zip = tid in downloaded or tid in zips_on_disk
        has_metadata = (META_ROOT / f"{tid}.json").is_file()
        has_detail = img_base is not None and _dir_has_files(img_base / "detail")
        listing_urls = [u for u in listing_by_id.get(tid, []) if not vimg.should_skip_url(u)]
        has_listing = (img_base is not None and _dir_has_files(img_base / "listing")) or len(listing_urls) == 0
        is_paid = tid in paid

        results.append(TemplateGap(
            tid=tid, slugs=slugs,
            has_zip=has_zip, has_metadata=has_metadata,
            has_detail=has_detail, has_listing=has_listing,
            is_paid=is_paid,
        ))
    return results


# ---------------------------------------------------------------------------
# Read collected JSON
# ---------------------------------------------------------------------------

def read_collected() -> tuple[list[str], dict[str, set[str]], dict[str, list[str]]]:
    data = json.loads(COLLECTED.read_text(encoding="utf-8"))
    ids = list(data.get("ids") or [])
    id_sources: dict[str, set[str]] = {}
    for k, v in (data.get("templateSourceSlugs") or {}).items():
        if isinstance(v, list):
            id_sources[str(k)] = set(str(x) for x in v)
    listing: dict[str, list[str]] = {}
    raw_lp = data.get("listingPreviewsByTemplateId") or {}
    if isinstance(raw_lp, dict):
        for k, v in raw_lp.items():
            if isinstance(v, list):
                listing[str(k)] = [str(u) for u in v if isinstance(u, str)]
    return ids, id_sources, listing


def _has_listing_previews() -> bool:
    if not COLLECTED.is_file():
        return False
    try:
        data = json.loads(COLLECTED.read_text(encoding="utf-8"))
        lp = data.get("listingPreviewsByTemplateId")
        return isinstance(lp, dict) and len(lp) > 0
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Display
# ---------------------------------------------------------------------------

def show_status(gaps: list[TemplateGap] | None = None) -> None:
    has_collected = COLLECTED.is_file()
    has_lp = _has_listing_previews()
    auth_ok = (ROOT / "auth.json").is_file()

    if gaps:
        total = len(gaps)
        paid = sum(1 for g in gaps if g.is_paid)
        complete = sum(1 for g in gaps if g.complete)
        incomplete = total - complete
        free = total - paid
        has_meta = sum(1 for g in gaps if not g.is_paid and g.has_metadata)
        has_listing = sum(1 for g in gaps if not g.is_paid and g.has_listing)
        has_detail = sum(1 for g in gaps if not g.is_paid and g.has_detail)
        has_zip = sum(1 for g in gaps if not g.is_paid and g.has_zip)
    else:
        total = complete = incomplete = paid = free = 0
        has_meta = has_listing = has_detail = has_zip = 0

    print("\n╔═══════════════════════════════════════════╗")
    print("║           v0 Template Sync                ║")
    print("╠═══════════════════════════════════════════╣")
    if has_collected:
        print(f"║  Mallar totalt:          {total:>6}           ║")
        print(f"║  Betalda (skippade):     {paid:>6}           ║")
        print(f"║  Gratis:                 {free:>6}           ║")
        print("║───────────────────────────────────────────║")
        print(f"║  Har metadata:       {has_meta:>5} / {free:<5}       ║")
        print(f"║  Har listing-bilder: {has_listing:>5} / {free:<5}       ║")
        print(f"║  Har detail-bilder:  {has_detail:>5} / {free:<5}       ║")
        print(f"║  Har ZIP:            {has_zip:>5} / {free:<5}       ║")
        print("║───────────────────────────────────────────║")
        print(f"║  Kompletta:              {complete:>6}           ║")
        print(f"║  Att synka:              {incomplete:>6}           ║")
    else:
        print("║  (ingen insamlad data ännu)               ║")
    print("║───────────────────────────────────────────║")
    print(f"║  Listing-URL i JSON:     {'  ja' if has_lp else ' nej':>5}           ║")
    print(f"║  Session (auth.json):    {'  ja' if auth_ok else ' nej':>5}           ║")
    print("╚═══════════════════════════════════════════╝")


def show_menu() -> str:
    print("\nVad vill du göra?")
    print("  1) Synka allt         (analysera + fylla luckor automatiskt)")
    print("  2) Samla in mall-ID   (uppdatera listan + listing-URL:er från v0)")
    print("  3) Logga in           (spara ny session till auth.json)")
    print("  0) Avsluta")
    return input("\nVälj [0-3]: ").strip()


def ask_int(prompt: str, default: int | None = None) -> int | None:
    hint = f" [{default}]" if default is not None else ""
    raw = input(f"{prompt}{hint}: ").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        print(f"  (ogiltigt, använder {default})")
        return default


def ask_yes(prompt: str, default: bool = True) -> bool:
    hint = " [J/n]" if default else " [j/N]"
    raw = input(f"{prompt}{hint}: ").strip().lower()
    if not raw:
        return default
    return raw in ("j", "ja", "y", "yes")


# ---------------------------------------------------------------------------
# Browser helpers
# ---------------------------------------------------------------------------

def resolve_storage() -> str | None:
    storage = os.environ.get("PLAYWRIGHT_STORAGE_STATE", "").strip() or None
    if not storage and (ROOT / "auth.json").is_file():
        storage = str(ROOT / "auth.json")
    return storage


def launch_browser(pw, *, headless: bool, storage: str | None):
    browser = pw.chromium.launch(headless=headless)
    ctx_kw: dict = {"viewport": {"width": 1400, "height": 900}}
    if storage:
        ctx_kw["storage_state"] = storage
    context = browser.new_context(**ctx_kw)
    page = context.new_page()
    return browser, context, page


# ---------------------------------------------------------------------------
# Actions
# ---------------------------------------------------------------------------

def action_login(pw) -> None:
    browser, context, page = launch_browser(pw, headless=False, storage=None)
    page.goto("https://v0.app/templates", wait_until="domcontentloaded", timeout=60_000)
    print(
        "\n--- Inloggning ---\n"
        "Logga in i Chromium-fönstret.\n"
        "Tryck Enter här när du är klar.\n",
        flush=True,
    )
    input("Enter … ")
    auth_path = ROOT / "auth.json"
    context.storage_state(path=str(auth_path))
    browser.close()
    print(f"Session sparad: {auth_path}", flush=True)


def action_collect(pw) -> None:
    storage = resolve_storage()
    if not storage:
        print("Ingen session hittad. Kör 'Logga in' först.", flush=True)
        return
    headless = ask_yes("Headless (dold webbläsare)?", default=True)
    browser, context, page = launch_browser(pw, headless=headless, storage=storage)
    print("\nSamlar in från alla kategorier …", flush=True)
    scan_urls = ["https://v0.app/templates"] + [
        f"https://v0.app/templates/{slug}" for slug in vz.BROWSE_CATEGORY_SLUGS
    ]
    ids, id_sources, merged_previews, sources = vz.collect_templates_scan(page, scan_urls)
    n_prev = sum(len(v) for v in merged_previews.values())
    print(f"\nHittade {len(ids)} unika mall-id, {n_prev} listing-URL:er.", flush=True)

    payload: dict = {
        "listUrl": "https://v0.app/templates (+ alla kategorier)",
        "kategoriLabel": vz.KATEGORI_SV["all"],
        "ids": ids,
        "count": len(ids),
        "templateSourceSlugs": {k: sorted(v) for k, v in sorted(id_sources.items())},
        "listingPreviewsByTemplateId": merged_previews,
        "sources": sources,
    }
    OUT.mkdir(parents=True, exist_ok=True)
    COLLECTED.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Sparade: {COLLECTED}", flush=True)
    browser.close()


def _fill_single_template(
    page: Page,
    gap: TemplateGap,
    listing_by_id: dict[str, list[str]],
) -> None:
    """Besök mallsidan och fyll exakt de delar som saknas."""
    folder_label = vz.folder_label_from_source_slugs(gap.slugs)
    safe_label = folder_label.replace("/", "-").replace("\\", "-")
    dest = vimg.IMAGE_ROOT / safe_label / gap.tid
    url = f"https://v0.app/templates/{gap.tid}"
    parts = gap.missing_parts

    needs_visit = not gap.has_metadata or not gap.has_detail or not gap.has_zip

    if needs_visit:
        page.goto(url, wait_until="domcontentloaded", timeout=90_000)

    if not gap.has_metadata:
        META_ROOT.mkdir(parents=True, exist_ok=True)
        meta = vimg.scrape_detail_metadata(page, gap.tid)
        (META_ROOT / f"{gap.tid}.json").write_text(
            json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8",
        )

    if not gap.has_listing:
        listing_urls = [
            u for u in listing_by_id.get(gap.tid, [])
            if isinstance(u, str) and not vimg.should_skip_url(u)
        ]
        if listing_urls:
            dest_listing = dest / "listing"
            dest_listing.mkdir(parents=True, exist_ok=True)
            for j, u in enumerate(listing_urls, 1):
                vimg.download_url_to_dir(page, u, dest_listing, j, prefix="L")

    if not gap.has_detail:
        detail_urls = vimg.collect_urls_from_page(page)
        if detail_urls:
            dest_detail = dest / "detail"
            dest_detail.mkdir(parents=True, exist_ok=True)
            for j, u in enumerate(detail_urls, 1):
                vimg.download_url_to_dir(page, u, dest_detail, j, prefix="D")

    if not gap.has_zip:
        page.wait_for_timeout(500)
        kind = vz.classify_detail(page)
        if kind == "paid":
            row = {
                "templateId": gap.tid,
                "kategoriLabel": folder_label,
                "sourceSlugs": sorted(gap.slugs),
                "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
            vz.append_jsonl(OUT / "paid-skipped.jsonl", {**row, "reason": "buy_credit"})
            print(f"  [{','.join(parts)}] {gap.tid} — betald, hoppas", flush=True)
            return
        if kind == "open":
            try:
                open_btn = page.get_by_role("button", name=vz.re.compile(r"open in", vz.re.I)).first
                open_btn.click()
                page.wait_for_url(vz.re.compile(r"/chat/"), timeout=120_000)
                safe = vz.DOWNLOAD_ROOT / safe_label / gap.tid
                path = vz.download_zip_from_chat(page, safe)
                row = {
                    "templateId": gap.tid,
                    "kategoriLabel": folder_label,
                    "sourceSlugs": sorted(gap.slugs),
                    "sourceLabelsSv": vz.source_labels_sv(gap.slugs),
                    "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                }
                vz.append_jsonl(OUT / "downloaded.jsonl", {**row, "path": str(path)})
            except Exception as e:
                row = {
                    "templateId": gap.tid,
                    "kategoriLabel": folder_label,
                    "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                }
                vz.append_jsonl(OUT / "errors.jsonl", {**row, "error": str(e)})
                print(f"  ZIP FAIL {gap.tid}: {e}", flush=True)
                return

    print(f"  [{','.join(parts)}] {gap.tid} OK", flush=True)


def action_sync(pw, gaps: list[TemplateGap], listing_by_id: dict[str, list[str]]) -> None:
    incomplete = [g for g in gaps if not g.complete]
    if not incomplete:
        print("\nAlla mallar är kompletta — inget att göra.", flush=True)
        return

    storage = resolve_storage()
    if not storage:
        print("Ingen session hittad. Kör 'Logga in' först.", flush=True)
        return

    only_media = [g for g in incomplete if g.has_zip]
    need_zip = [g for g in incomplete if not g.has_zip and not g.is_paid]
    print(f"\n  {len(only_media)} mall(ar) behöver komplettering (metadata/bilder)")
    print(f"  {len(need_zip)} mall(ar) behöver allt inkl. ZIP")

    limit = ask_int("Max antal att bearbeta (tom = alla)", default=None)
    pace = ask_int("Hastighet 1-5 (1=snabbast, 3=normal, 5=långsammast)", default=3)
    headless = ask_yes("Headless?", default=True)

    pace = max(1, min(5, pace or 3))
    sleep_ranges = {
        1: (0.3, 0.8),
        2: (0.5, 1.5),
        3: (1.0, 2.5),
        4: (2.5, 5.0),
        5: (5.0, 10.0),
    }
    sleep_lo, sleep_hi = sleep_ranges[pace]
    print(f"  Paus mellan mallar: {sleep_lo}–{sleep_hi}s (nivå {pace})", flush=True)

    to_process = list(incomplete)
    if limit is not None:
        to_process = to_process[:limit]

    browser, context, page = launch_browser(pw, headless=headless, storage=storage)
    vz.DOWNLOAD_ROOT.mkdir(parents=True, exist_ok=True)
    vimg.IMAGE_ROOT.mkdir(parents=True, exist_ok=True)

    rng = random.Random()
    print(f"\nBearbetar {len(to_process)} mall(ar) …\n", flush=True)

    for i, gap in enumerate(to_process):
        try:
            _fill_single_template(page, gap, listing_by_id)
        except Exception as e:
            print(f"  FAIL {gap.tid}: {e}", flush=True)
            row = {
                "templateId": gap.tid,
                "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
            vz.append_jsonl(OUT / "errors.jsonl", {**row, "error": str(e)})

        if i < len(to_process) - 1:
            time.sleep(rng.uniform(sleep_lo, sleep_hi))

    browser.close()
    print("\nKlart.", flush=True)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as pw:
        while True:
            gaps: list[TemplateGap] = []
            listing_by_id: dict[str, list[str]] = {}
            if COLLECTED.is_file():
                print("\nAnalyserar … ", end="", flush=True)
                ids, id_sources, listing_by_id = read_collected()
                gaps = analyze(ids, id_sources, listing_by_id)
                print("klar.", flush=True)

            show_status(gaps)
            choice = show_menu()

            if choice == "0":
                print("Hej då!", flush=True)
                break
            elif choice == "1":
                action_sync(pw, gaps, listing_by_id)
            elif choice == "2":
                action_collect(pw)
            elif choice == "3":
                action_login(pw)
            else:
                print("Ogiltigt val, försök igen.")


if __name__ == "__main__":
    main()
