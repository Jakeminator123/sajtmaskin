#!/usr/bin/env python3
"""
ETT skript för att synka alla v0 community templates.

Kör:  python scripts/v0_sync_templates.py

Skriptet:
  1. Samlar in alla mall-ID + listing-URL:er (om det behövs)
  2. Analyserar vad varje mall redan har på disk
  3. Fyller exakt de luckor som saknas (metadata, listing, detail, ZIP)
  4. Inga dubbletter — allt söks per mall-ID oavsett kategori-mapp

Avbryt tryggt med Ctrl+C — allt sparas löpande, nästa körning fortsätter.
"""

from __future__ import annotations

import json
import os
import random
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

import atexit
import signal

from playwright.sync_api import Page, sync_playwright

# PIDs of Playwright-launched Chromium processes (only these are killed on exit).
_BROWSER_PIDS: list[int] = []


def _register_browser_pid(browser) -> None:
    try:
        proc = getattr(browser, "process", None)
        pid = getattr(proc, "pid", None) if proc is not None else None
        if pid is not None:
            _BROWSER_PIDS.append(int(pid))
    except Exception:
        pass


def _kill_chromium_on_exit():
    """Kill only Chromium processes we started (not every chromium.exe on the machine)."""
    import subprocess
    for pid in set(_BROWSER_PIDS):
        subprocess.run(
            ["taskkill", "/F", "/PID", str(pid), "/T"],
            capture_output=True,
        )


atexit.register(_kill_chromium_on_exit)

try:
    signal.signal(signal.SIGBREAK, lambda *_: sys.exit(0))
except (AttributeError, OSError):
    pass

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from utils import zips as vz
from utils import media as vimg

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out"
COLLECTED = OUT / "collected-template-ids.json"
META_ROOT = OUT / "template-metadata"  # legacy; new metadata goes inside template folder


# ---------------------------------------------------------------------------
# Per-template gap analysis
# ---------------------------------------------------------------------------

@dataclass
class TemplateGap:
    tid: str
    slugs: set[str] = field(default_factory=set)
    has_zip: bool = False
    has_metadata: bool = False
    has_detail: bool = False
    has_listing: bool = False
    is_paid: bool = False

    @property
    def complete(self) -> bool:
        return self.is_paid or (
            self.has_zip and self.has_metadata and self.has_detail and self.has_listing
        )

    @property
    def missing_parts(self) -> list[str]:
        if self.is_paid:
            return []
        p = []
        if not self.has_metadata:
            p.append("metadata")
        if not self.has_listing:
            p.append("listing")
        if not self.has_detail:
            p.append("detail")
        if not self.has_zip:
            p.append("ZIP")
        return p


FOLDER_SEP = "__"


def slugify(title: str, max_len: int = 60) -> str:
    s = title.split(" - ")[0].strip()
    s = re.sub(r"[^\w\s-]", "", s.lower())
    s = re.sub(r"[\s_]+", "-", s).strip("-")
    return s[:max_len].rstrip("-") or "template"


def make_folder_name(tid: str, title: str | None = None) -> str:
    if title:
        return f"{slugify(title)}{FOLDER_SEP}{tid}"
    return tid


def tid_from_folder(name: str) -> str:
    if FOLDER_SEP in name:
        return name.rsplit(FOLDER_SEP, 1)[-1]
    return name


def get_title_for_tid(tid: str, folder: Path | None = None) -> str | None:
    candidates = []
    if folder and (folder / "metadata.json").is_file():
        candidates.append(folder / "metadata.json")
    legacy = META_ROOT / f"{tid}.json"
    if legacy.is_file():
        candidates.append(legacy)
    for p in candidates:
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            t = data.get("ogTitle") or data.get("h1")
            if t:
                return t
        except Exception:
            pass
    return None


def _dir_has_files(d: Path) -> bool:
    try:
        return d.is_dir() and any(d.iterdir())
    except OSError:
        return False


def _folder_file_count(folder: Path) -> int:
    """Count files under folder (for picking the richer duplicate tid folder)."""
    n = 0
    try:
        for p in folder.rglob("*"):
            if p.is_file():
                n += 1
    except OSError:
        return -1
    return n


def _load_jsonl_ids(path: Path, key: str = "templateId") -> set[str]:
    ids: set[str] = set()
    if not path.is_file():
        return ids
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                tid = json.loads(line).get(key)
                if isinstance(tid, str):
                    ids.add(tid)
            except json.JSONDecodeError:
                pass
    return ids


def _scan_template_folders() -> dict[str, Path]:
    """Scan downloads/ once. Return tid -> folder path."""
    found: dict[str, Path] = {}
    counts: dict[str, int] = {}
    if not vz.DOWNLOAD_ROOT.is_dir():
        return found
    for cat_dir in vz.DOWNLOAD_ROOT.iterdir():
        if not cat_dir.is_dir() or cat_dir.name == "template-images":
            continue
        for tid_dir in cat_dir.iterdir():
            if tid_dir.is_dir():
                tid = tid_from_folder(tid_dir.name)
                cnt = _folder_file_count(tid_dir)
                if tid in found:
                    old_cnt = counts.get(tid, -1)
                    if cnt > old_cnt:
                        print(
                            f"  Varning: {tid} finns i flera kategorimappar — "
                            f"använder {tid_dir} ({cnt} filer) istället för "
                            f"{found[tid]} ({old_cnt}).",
                            flush=True,
                        )
                        found[tid] = tid_dir
                        counts[tid] = cnt
                else:
                    found[tid] = tid_dir
                    counts[tid] = cnt
    return found


def analyze(
    ids: list[str],
    id_sources: dict[str, set[str]],
    listing_by_id: dict[str, list[str]],
    folders: dict[str, Path] | None = None,
) -> list[TemplateGap]:
    if folders is None:
        folders = _scan_template_folders()
    paid = _load_jsonl_ids(OUT / "paid-skipped.jsonl")
    results: list[TemplateGap] = []
    for tid in ids:
        slugs = id_sources.get(tid, {vz.BROWSE_ALL_KEY})
        base = folders.get(tid)
        has_zip = base is not None and any(base.glob("*.zip"))
        has_metadata = (
            (base is not None and (base / "metadata.json").is_file())
            or (META_ROOT / f"{tid}.json").is_file()
        )
        has_detail = base is not None and _dir_has_files(base / "detail")
        listing_urls = [u for u in listing_by_id.get(tid, []) if not vimg.should_skip_url(u)]
        has_listing_files = base is not None and _dir_has_files(base / "listing")
        if has_listing_files:
            has_listing = True
        elif len(listing_urls) > 0:
            has_listing = False
        else:
            listing_dir = (base / "listing") if base is not None else None
            if (
                base is not None
                and listing_dir is not None
                and listing_dir.is_dir()
                and not _dir_has_files(listing_dir)
            ):
                has_listing = False
            else:
                has_listing = True
        results.append(TemplateGap(
            tid=tid,
            slugs=slugs,
            has_zip=has_zip,
            has_metadata=has_metadata,
            has_detail=has_detail,
            has_listing=has_listing,
            is_paid=tid in paid,
        ))
    return results


def _clean_restart_dupes() -> int:
    """Remove duplicate ZIPs within the same template folder (keep newest)."""
    from collections import defaultdict
    folder_zips: dict[str, list[tuple[Path, float]]] = defaultdict(list)
    for z in vz.DOWNLOAD_ROOT.glob("**/*.zip"):
        try:
            if z.is_file():
                folder_zips[str(z.parent)].append((z, z.stat().st_mtime))
        except OSError:
            pass
    removed = 0
    for _, zips in folder_zips.items():
        if len(zips) <= 1:
            continue
        zips.sort(key=lambda x: -x[1])
        for z, _ in zips[1:]:
            try:
                z.unlink()
                removed += 1
            except OSError:
                pass
    return removed


def _migrate_folder_names() -> int:
    """Rename old ID-only folders to slug__ID format using metadata."""
    renamed = 0
    if not vz.DOWNLOAD_ROOT.is_dir():
        return 0
    for cat_dir in vz.DOWNLOAD_ROOT.iterdir():
        if not cat_dir.is_dir() or cat_dir.name == "template-images":
            continue
        for tid_dir in list(cat_dir.iterdir()):
            if not tid_dir.is_dir():
                continue
            folder_name = tid_dir.name
            if FOLDER_SEP in folder_name:
                continue
            tid = folder_name
            title = get_title_for_tid(tid)
            if not title:
                meta_in = tid_dir / "metadata.json"
                if meta_in.is_file():
                    try:
                        title = json.loads(
                            meta_in.read_text(encoding="utf-8")
                        ).get("ogTitle")
                    except Exception:
                        pass
            if not title:
                continue
            new_name = make_folder_name(tid, title)
            if new_name == folder_name:
                continue
            new_path = cat_dir / new_name
            if new_path.exists():
                continue
            try:
                tid_dir.rename(new_path)
                renamed += 1
            except OSError:
                pass
    return renamed


# ---------------------------------------------------------------------------
# Read / write collected JSON
# ---------------------------------------------------------------------------

def read_collected() -> tuple[list[str], dict[str, set[str]], dict[str, list[str]]]:
    try:
        text = COLLECTED.read_text(encoding="utf-8")
    except OSError as e:
        print(f"Varning: kunde inte läsa {COLLECTED}: {e}", flush=True)
        return [], {}, {}
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        print(
            f"Varning: ogiltig JSON i {COLLECTED}: {e} — antas tom lista.",
            flush=True,
        )
        return [], {}, {}
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
    auth_ok = (ROOT / "auth.json").is_file()
    has_lp = _has_listing_previews()

    if gaps:
        total = len(gaps)
        paid = sum(1 for g in gaps if g.is_paid)
        free = total - paid
        complete = sum(1 for g in gaps if g.complete)
        to_sync = total - complete
        has_meta = sum(1 for g in gaps if not g.is_paid and g.has_metadata)
        has_list = sum(1 for g in gaps if not g.is_paid and g.has_listing)
        has_det = sum(1 for g in gaps if not g.is_paid and g.has_detail)
        has_zip = sum(1 for g in gaps if not g.is_paid and g.has_zip)
    else:
        total = paid = free = complete = to_sync = 0
        has_meta = has_list = has_det = has_zip = 0

    print("\n╔═══════════════════════════════════════════╗")
    print("║           v0 Template Sync                ║")
    print("╠═══════════════════════════════════════════╣")
    if total:
        print(f"║  Mallar totalt:          {total:>6}           ║")
        print(f"║  Betalda (skippade):     {paid:>6}           ║")
        print(f"║  Gratis:                 {free:>6}           ║")
        print("║───────────────────────────────────────────║")
        print(f"║  Har metadata:       {has_meta:>5} / {free:<5}       ║")
        print(f"║  Har listing-bilder: {has_list:>5} / {free:<5}       ║")
        print(f"║  Har detail-bilder:  {has_det:>5} / {free:<5}       ║")
        print(f"║  Har ZIP:            {has_zip:>5} / {free:<5}       ║")
        print("║───────────────────────────────────────────║")
        print(f"║  Kompletta:              {complete:>6}           ║")
        print(f"║  Att synka:              {to_sync:>6}           ║")
    else:
        print("║  (ingen insamlad data ännu)               ║")
    print("║───────────────────────────────────────────║")
    print(f"║  Listing-URL i JSON:     {'  ja' if has_lp else ' nej':>5}           ║")
    print(f"║  Session (auth.json):    {'  ja' if auth_ok else ' nej':>5}           ║")
    print("╚═══════════════════════════════════════════╝")


def ask_int(prompt: str, default: int | None = None) -> int | None:
    hint = f" [{default}]" if default is not None else ""
    raw = input(f"{prompt}{hint}: ").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def ask_yes(prompt: str, default: bool = True) -> bool:
    hint = " [J/n]" if default else " [j/N]"
    raw = input(f"{prompt}{hint}: ").strip().lower()
    if not raw:
        return default
    return raw in ("j", "ja", "y", "yes")


# ---------------------------------------------------------------------------
# Browser
# ---------------------------------------------------------------------------

def resolve_storage() -> str | None:
    storage = os.environ.get("PLAYWRIGHT_STORAGE_STATE", "").strip() or None
    if not storage and (ROOT / "auth.json").is_file():
        storage = str(ROOT / "auth.json")
    return storage


def _find_chrome_path() -> str | None:
    import shutil
    for candidate in (
        os.path.join(os.environ.get("PROGRAMFILES", ""), "Google", "Chrome", "Application", "chrome.exe"),
        os.path.join(os.environ.get("PROGRAMFILES(X86)", ""), "Google", "Chrome", "Application", "chrome.exe"),
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "Google", "Chrome", "Application", "chrome.exe"),
    ):
        if os.path.isfile(candidate):
            return candidate
    return shutil.which("chrome") or shutil.which("google-chrome")


def _action_login(pw) -> None:
    """Copy v0/Vercel cookies from Chrome profile, then verify."""
    import sqlite3, shutil, tempfile

    user_data = Path(os.environ.get("LOCALAPPDATA", "")) / "Google" / "Chrome" / "User Data"
    profiles_to_try = [
        "Profile 7", "Profile 12", "Profile 20", "Profile 21",
        "Profile 23", "Profile 27", "Default",
    ]
    cookie_db = None
    for prof in profiles_to_try:
        candidate = user_data / prof / "Network" / "Cookies"
        if candidate.is_file():
            cookie_db = candidate
            break
        candidate2 = user_data / prof / "Cookies"
        if candidate2.is_file():
            cookie_db = candidate2
            break

    if cookie_db:
        print(f"\nHittade cookies i {cookie_db.parent.parent.name}.", flush=True)
        print("Stäng Chrome om det inte redan är stängt, tryck Enter …", flush=True)
        input()

        tmp = Path(tempfile.mkdtemp()) / "Cookies"
        try:
            shutil.copy2(cookie_db, tmp)
            conn = sqlite3.connect(str(tmp))
            rows = conn.execute(
                "SELECT name, encrypted_value, host_key, path, is_secure, "
                "expires_utc, is_httponly FROM cookies "
                "WHERE host_key LIKE '%v0.app%' OR host_key LIKE '%vercel.com%'"
            ).fetchall()
            conn.close()
        except Exception as e:
            print(f"Kunde inte läsa: {e}", flush=True)
            rows = []
        finally:
            tmp.unlink(missing_ok=True)
            try:
                tmp.parent.rmdir()
            except OSError:
                pass

        if rows:
            print(f"Hittade {len(rows)} cookies. Testar …", flush=True)
    else:
        rows = []

    browser = pw.chromium.launch(headless=False)
    _register_browser_pid(browser)
    context = browser.new_context(viewport={"width": 1400, "height": 900})
    page = context.new_page()
    page.goto("https://v0.app/templates", wait_until="domcontentloaded", timeout=60_000)
    print(
        "\n╔═══════════════════════════════════════════╗\n"
        "║  Webbläsarfönster öppnat.                 ║\n"
        "║                                           ║\n"
        "║  Logga in om du inte redan är det:        ║\n"
        "║    • Sign In → GitHub (Google blockeras)  ║\n"
        "║                                           ║\n"
        "║  Tryck Enter HÄR när du är inloggad.      ║\n"
        "╚═══════════════════════════════════════════╝\n",
        flush=True,
    )
    input("Enter … ")
    auth_path = ROOT / "auth.json"
    context.storage_state(path=str(auth_path))
    browser.close()
    print(f"Session sparad: {auth_path}", flush=True)


PACE_PROFILES: dict[int, dict] = {
    1: {"sleep": (0.3, 0.8),  "label": "Full fart",    "chromium_args": []},
    2: {"sleep": (0.5, 1.5),  "label": "Snabb",        "chromium_args": []},
    3: {"sleep": (1.5, 3.0),  "label": "Normal",       "chromium_args": ["--disable-gpu"]},
    4: {"sleep": (3.0, 6.0),  "label": "Lugn (20–30%)", "chromium_args": ["--disable-gpu", "--renderer-process-limit=1", "--disable-background-networking"]},
    5: {"sleep": (6.0, 12.0), "label": "Minimal (10%)", "chromium_args": ["--disable-gpu", "--renderer-process-limit=1", "--disable-background-networking", "--disable-extensions", "--single-process"]},
}


def launch_browser(pw, *, headless: bool, storage: str | None, pace: int = 3):
    profile = PACE_PROFILES.get(pace, PACE_PROFILES[3])
    browser = pw.chromium.launch(
        headless=headless,
        args=profile["chromium_args"],
    )
    _register_browser_pid(browser)
    ctx_kw: dict = {"viewport": {"width": 1400, "height": 900}}
    if storage:
        ctx_kw["storage_state"] = storage
    context = browser.new_context(**ctx_kw)
    page = context.new_page()
    return browser, context, page


# ---------------------------------------------------------------------------
# Fill a single template
# ---------------------------------------------------------------------------

def _fill_single(
    page: Page,
    gap: TemplateGap,
    listing_by_id: dict[str, list[str]],
    existing_folders: dict[str, Path],
) -> str:
    folder_label = vz.folder_label_from_source_slugs(gap.slugs)
    safe_label = folder_label.replace("/", "-").replace("\\", "-")
    parts = gap.missing_parts
    needs_visit = not gap.has_metadata or not gap.has_detail or not gap.has_zip

    if needs_visit:
        page.goto(
            f"https://v0.app/templates/{gap.tid}",
            wait_until="domcontentloaded",
            timeout=90_000,
        )
        try:
            if page.get_by_role("heading", name="Not Found").count() > 0:
                vz.append_jsonl(OUT / "errors.jsonl", {
                    "templateId": gap.tid,
                    "error": "not_found",
                    "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                })
                print(f"  NOT FOUND {gap.tid}", flush=True)
                return "not_found"
        except Exception:
            pass

    if not gap.has_metadata and needs_visit:
        meta = vimg.scrape_detail_metadata(page, gap.tid)
        meta_text = json.dumps(meta, indent=2, ensure_ascii=False)
    else:
        meta_text = None

    title = get_title_for_tid(gap.tid)
    if not title and meta_text:
        try:
            title = json.loads(meta_text).get("ogTitle")
        except Exception:
            pass

    folder_name = make_folder_name(gap.tid, title)
    existing = existing_folders.get(gap.tid)

    if existing and existing.name != folder_name:
        new_path = existing.parent / folder_name
        if not new_path.exists():
            try:
                existing.rename(new_path)
                existing = new_path
            except OSError:
                pass

    dest = existing or (vz.DOWNLOAD_ROOT / safe_label / folder_name)
    dest.mkdir(parents=True, exist_ok=True)

    if meta_text and not gap.has_metadata:
        (dest / "metadata.json").write_text(meta_text, encoding="utf-8")

    list_ok = list_fail = 0
    if not gap.has_listing:
        urls = [
            u for u in listing_by_id.get(gap.tid, [])
            if isinstance(u, str) and not vimg.should_skip_url(u)
        ]
        if urls:
            d = dest / "listing"
            d.mkdir(parents=True, exist_ok=True)
            for j, u in enumerate(urls, 1):
                ok, _info = vimg.download_url_to_dir(page, u, d, j, prefix="L")
                if ok:
                    list_ok += 1
                else:
                    list_fail += 1

    det_ok = det_fail = 0
    if not gap.has_detail:
        urls = vimg.collect_urls_from_page(page)
        if urls:
            d = dest / "detail"
            d.mkdir(parents=True, exist_ok=True)
            for j, u in enumerate(urls, 1):
                ok, _info = vimg.download_url_to_dir(page, u, d, j, prefix="D")
                if ok:
                    det_ok += 1
                else:
                    det_fail += 1

    if list_fail:
        print(
            f"  listing-bilder: {list_ok} OK, {list_fail} misslyckade ({gap.tid})",
            flush=True,
        )
    if det_fail:
        print(
            f"  detail-bilder: {det_ok} OK, {det_fail} misslyckade ({gap.tid})",
            flush=True,
        )

    if not gap.has_zip:
        page.wait_for_timeout(500)
        kind = vz.classify_detail(page)
        if kind == "paid":
            vz.append_jsonl(OUT / "paid-skipped.jsonl", {
                "templateId": gap.tid,
                "kategoriLabel": folder_label,
                "sourceSlugs": sorted(gap.slugs),
                "reason": "buy_credit",
                "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            })
            print(f"  [{','.join(parts)}] {gap.tid} — betald", flush=True)
            return "paid"
        if kind == "unknown":
            vz.append_jsonl(OUT / "errors.jsonl", {
                "templateId": gap.tid,
                "error": "unknown_detail_type",
                "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            })
            print(
                f"  OKÄND DETALJSIDA {gap.tid} (ingen synlig Open in / betald-knapp)",
                flush=True,
            )
            return "unknown"
        if kind == "open":
            try:
                page.get_by_role(
                    "button", name=re.compile(r"open in", re.I)
                ).first.click()
                page.wait_for_url(re.compile(r"/chat/"), timeout=120_000)
                path = vz.download_zip_from_chat(page, dest)
                final = dest / "template.zip"
                if path.name != "template.zip" and not final.exists():
                    try:
                        path.rename(final)
                    except OSError:
                        pass
                vz.append_jsonl(OUT / "downloaded.jsonl", {
                    "templateId": gap.tid,
                    "kategoriLabel": folder_label,
                    "sourceSlugs": sorted(gap.slugs),
                    "path": str(dest / "template.zip"),
                    "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                })
            except Exception as e:
                vz.append_jsonl(OUT / "errors.jsonl", {
                    "templateId": gap.tid,
                    "error": str(e),
                    "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                })
                print(f"  ZIP FAIL {gap.tid}: {e}", flush=True)
                return "zip_fail"

    display = title[:45] if title else gap.tid
    print(f"  [{','.join(parts)}] {display} OK", flush=True)
    return "ok"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    vz.DOWNLOAD_ROOT.mkdir(parents=True, exist_ok=True)


    dupes = _clean_restart_dupes()
    if dupes:
        print(f"Rensade {dupes} dubbla ZIP-filer.", flush=True)
    migrated = _migrate_folder_names()
    if migrated:
        print(f"Döpte om {migrated} mappar till läsbara namn.", flush=True)

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

            print("\nVad vill du göra?")
            print("  1) Logga in + hämta allt  (logga in → samla lista → ladda ner)")
            print("  2) Hämta allt             (samla lista + ladda ner, befintlig session)")
            print("  3) Bara synka             (ladda ner saknade, ingen ny lista)")
            print("  4) Logga in               (bara spara ny session)")
            print("  0) Avsluta")
            choice = input("\nVälj [0-4]: ").strip()

            if choice == "0":
                print("Hej då!", flush=True)
                break

            elif choice == "4":
                _action_login(pw)

            elif choice == "1":
                _action_login(pw)
                storage = resolve_storage()
                if not storage:
                    print("Inloggning misslyckades.", flush=True)
                    continue
                print("\n  Hastighet:")
                for lvl, prof in PACE_PROFILES.items():
                    print(f"    {lvl}) {prof['label']}")
                pace = ask_int("Välj", default=3)
                headless = ask_yes("Headless?", default=True)
                _do_collect(pw, headless=headless, storage=storage)
                _do_sync(
                    pw, headless=headless, storage=storage,
                    limit=None, pace=pace or 3,
                )

            elif choice == "2":
                storage = resolve_storage()
                if not storage:
                    print("Ingen session — kör val 1 eller 4 först.", flush=True)
                    continue
                print("\n  Hastighet:")
                for lvl, prof in PACE_PROFILES.items():
                    print(f"    {lvl}) {prof['label']}")
                pace = ask_int("Välj", default=3)
                headless = ask_yes("Headless?", default=True)
                _do_collect(pw, headless=headless, storage=storage)
                _do_sync(
                    pw, headless=headless, storage=storage,
                    limit=None, pace=pace or 3,
                )

            elif choice == "3":
                storage = resolve_storage()
                if not storage:
                    print("Ingen session — kör val 1 eller 4 först.", flush=True)
                    continue
                print("\n  Hastighet:")
                for lvl, prof in PACE_PROFILES.items():
                    print(f"    {lvl}) {prof['label']}")
                pace = ask_int("Välj", default=3)
                headless = ask_yes("Headless?", default=True)
                _do_sync(
                    pw, headless=headless, storage=storage,
                    limit=None, pace=pace or 3,
                )

            else:
                print("Ogiltigt val.")


def _check_name_duplicates(folders: dict[str, Path]) -> None:
    """Warn about templates with identical names but different IDs."""
    from collections import defaultdict
    name_to_tids: dict[str, list[str]] = defaultdict(list)
    for tid, path in folders.items():
        name = path.name.rsplit(FOLDER_SEP, 1)[0] if FOLDER_SEP in path.name else ""
        if name:
            name_to_tids[name].append(tid)
    dupes = {n: tids for n, tids in name_to_tids.items() if len(tids) > 1}
    if dupes:
        print(f"\n  Varning: {len(dupes)} mallnamn med flera ID:", flush=True)
        for name, tids in list(dupes.items())[:5]:
            print(f"    {name} → {', '.join(tids)}", flush=True)


def _do_collect(pw, headless: bool, storage: str) -> None:
    """Collect all template IDs + listing URLs from v0."""
    browser, context, page = launch_browser(
        pw, headless=headless, storage=storage
    )
    print("\nSamlar in alla kategorier …", flush=True)
    scan_urls = ["https://v0.app/templates"] + [
        f"https://v0.app/templates/{s}" for s in vz.BROWSE_CATEGORY_SLUGS
    ]
    ids, src, previews, sources = vz.collect_templates_scan(page, scan_urls)
    n_prev = sum(len(v) for v in previews.values())
    print(
        f"\nHittade {len(ids)} unika mall-id, {n_prev} listing-URL:er.",
        flush=True,
    )
    payload = json.dumps(
        {
            "ids": ids,
            "count": len(ids),
            "templateSourceSlugs": {
                k: sorted(v) for k, v in sorted(src.items())
            },
            "listingPreviewsByTemplateId": previews,
            "sources": sources,
        },
        indent=2,
        ensure_ascii=False,
    )
    tmp = COLLECTED.with_suffix(COLLECTED.suffix + ".tmp")
    tmp.write_text(payload, encoding="utf-8")
    tmp.replace(COLLECTED)
    browser.close()
    print(f"Sparade: {COLLECTED}", flush=True)


def _is_session_dead(page) -> bool:
    """Check if v0 redirected to login page."""
    try:
        url = page.url.lower()
        return "vercel.com/login" in url or "accounts.google.com" in url
    except Exception:
        return False


def _consecutive_zip_fails_suggest_logout(fails: int) -> bool:
    return fails >= 3


def _do_sync(
    pw,
    *,
    headless: bool,
    storage: str,
    limit: int | None,
    pace: int,
) -> None:
    """Analyze gaps + fill them."""
    print("Analyserar … ", end="", flush=True)
    ids, id_sources, listing_by_id = read_collected()
    folders = _scan_template_folders()
    gaps = analyze(ids, id_sources, listing_by_id, folders)
    print("klar.", flush=True)
    show_status(gaps)

    _check_name_duplicates(folders)

    incomplete = [g for g in gaps if not g.complete]
    if not incomplete:
        print("\nAlla mallar är kompletta!", flush=True)
        return

    pace = max(1, min(5, pace))
    profile = PACE_PROFILES[pace]
    sleep_lo, sleep_hi = profile["sleep"]

    to_process = list(incomplete)
    if limit is not None:
        to_process = to_process[:limit]

    browser, context, page = launch_browser(
        pw, headless=headless, storage=storage, pace=pace
    )
    rng = random.Random()
    print(
        f"\nBearbetar {len(to_process)} mall(ar) "
        f"— {profile['label']} (paus {sleep_lo}–{sleep_hi}s) …\n",
        flush=True,
    )
    folders_disk = _scan_template_folders()
    done = 0
    consecutive_zip_fails = 0
    try:
        for i, gap in enumerate(to_process):
            try:
                status = _fill_single(page, gap, listing_by_id, folders_disk)
                done += 1
                if status == "zip_fail":
                    consecutive_zip_fails += 1
                else:
                    consecutive_zip_fails = 0
            except Exception as e:
                err_str = str(e)
                print(f"  FAIL {gap.tid}: {err_str}", flush=True)
                vz.append_jsonl(OUT / "errors.jsonl", {
                    "templateId": gap.tid,
                    "error": err_str,
                    "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                })
                if "Timeout" in err_str or "Connection closed" in err_str:
                    consecutive_zip_fails += 1

            if _is_session_dead(page):
                print(
                    f"\n  Session utgången! (omdirigerad till login)"
                    f"\n  {done}/{len(to_process)} klara."
                    f"\n  Kör igen — logga in med val 4 först.\n",
                    flush=True,
                )
                break

            if _consecutive_zip_fails_suggest_logout(consecutive_zip_fails):
                print(
                    f"\n  {consecutive_zip_fails} ZIP-fel i rad — session kan ha gått ut."
                    f"\n  {done}/{len(to_process)} klara."
                    f"\n  Kör igen — logga in med val 4 om det fortsätter.\n",
                    flush=True,
                )
                break

            if i < len(to_process) - 1:
                time.sleep(rng.uniform(sleep_lo, sleep_hi))
    except KeyboardInterrupt:
        print(
            f"\n\nAvbruten! {done}/{len(to_process)} klara."
            " Allt sparat — kör igen för att fortsätta.",
            flush=True,
        )
    finally:
        try:
            browser.close()
        except Exception:
            pass
    print(f"\nKlart. {done}/{len(to_process)} bearbetade.", flush=True)


def auto_full(
    *,
    collect: bool = False,
    limit: int | None = None,
    pace: int = 3,
    headless: bool = True,
) -> None:
    """Non-interactive: optionally collect, then sync."""
    OUT.mkdir(parents=True, exist_ok=True)
    vz.DOWNLOAD_ROOT.mkdir(parents=True, exist_ok=True)

    dupes = _clean_restart_dupes()
    if dupes:
        print(f"Rensade {dupes} dubbla ZIP-filer.", flush=True)
    migrated = _migrate_folder_names()
    if migrated:
        print(f"Döpte om {migrated} mappar.", flush=True)

    storage = resolve_storage()
    if not storage:
        print("Ingen session (auth.json) — kör interaktivt med val 3 först.", flush=True)
        return

    with sync_playwright() as pw:
        if collect or not COLLECTED.is_file():
            _do_collect(pw, headless=headless, storage=storage)

        if not COLLECTED.is_file():
            print("Ingen mall-lista — avbryter.", flush=True)
            return

        _do_sync(
            pw,
            headless=headless,
            storage=storage,
            limit=limit,
            pace=pace,
        )


if __name__ == "__main__":
    import argparse as _ap

    _p = _ap.ArgumentParser(add_help=False)
    _p.add_argument("--go", action="store_true", help="Synka (utan insamling)")
    _p.add_argument("--full", action="store_true", help="Samla in + synka allt (natt-läge)")
    _p.add_argument("--limit", type=int, default=None)
    _p.add_argument("--pace", type=int, default=3, choices=range(1, 6))
    _p.add_argument("--headless", type=int, default=1, choices=(0, 1))
    _args, _ = _p.parse_known_args()

    if _args.full:
        auto_full(
            collect=True,
            limit=_args.limit,
            pace=_args.pace,
            headless=bool(_args.headless),
        )
    elif _args.go:
        auto_full(
            collect=False,
            limit=_args.limit,
            pace=_args.pace,
            headless=bool(_args.headless),
        )
    else:
        main()
