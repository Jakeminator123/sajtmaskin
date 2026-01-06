#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
docgrab.py — Ladda ner dokumentation “smart”
- Försöker: llms-full.txt / llms.txt / llms-small.txt (snabbast)
- Fallback: sitemap.xml / sitemap.xml.gz
- Fallback: sidebar/nav-länkar från HTML (best effort)
- Interaktiv meny: start, allt, välj, filter, etc.
- Sparar i en undermapp i samma katalog som du kör skriptet från.

Kör:
  py docgrab.py

Tips:
- Tom rad på URL-prompten avslutar.
"""

from __future__ import annotations

import gzip
import re
import sys
import time
import json
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable, Optional
from urllib.parse import urljoin, urlsplit, urlunsplit
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
import xml.etree.ElementTree as ET


USER_AGENT = "docgrab/2.0 (Python urllib) +https://local"
TIMEOUT_SEC = 30
DELAY_SEC = 0.15
MAX_PAGES_DEFAULT = 250


# -----------------------------
# Helpers: URL + filnamn
# -----------------------------

def normalize_url(raw: str) -> str:
    raw = (raw or "").strip()

    # vanliga copy/paste-missar: avslutande citattecken
    raw = raw.strip().strip('\'"').rstrip('\'"')

    if not raw:
        return ""
    if not re.match(r"^https?://", raw, re.IGNORECASE):
        raw = "https://" + raw
    raw = raw.rstrip("/")
    return raw


def split_root_and_base(url: str) -> tuple[str, str]:
    parts = urlsplit(url)
    root = urlunsplit((parts.scheme, parts.netloc, "", "", ""))
    base = urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))
    base = base.rstrip("/")
    return root, base


def safe_slug(s: str) -> str:
    s = re.sub(r"[^A-Za-z0-9._-]+", "_", s)
    s = s.strip("_")
    return s or "site"


def slug_from_url(url: str) -> str:
    parts = urlsplit(url)
    host = parts.netloc.replace(":", "_")
    path = parts.path.strip("/")
    if path:
        return safe_slug(f"{host}__{path}")
    return safe_slug(host)


def ensure_dir(p: Path) -> Path:
    p.mkdir(parents=True, exist_ok=True)
    return p


# -----------------------------
# HTTP
# -----------------------------

@dataclass
class FetchResult:
    url: str
    status: int
    headers: dict
    body: bytes


def fetch(url: str, timeout: int = TIMEOUT_SEC, retries: int = 2) -> Optional[FetchResult]:
    """
    Best effort fetch med enkel retry/backoff.
    Returnerar None om misslyckas.
    """
    last_err = None
    for attempt in range(retries + 1):
        try:
            req = Request(
                url,
                headers={
                    "User-Agent": USER_AGENT,
                    "Accept-Encoding": "gzip",
                },
            )
            with urlopen(req, timeout=timeout) as resp:
                status = getattr(resp, "status", 200)
                headers = dict(resp.headers.items())
                body = resp.read()
                # gzip?
                ce = headers.get("Content-Encoding", "").lower()
                ct = headers.get("Content-Type", "").lower()
                if "gzip" in ce:
                    try:
                        body = gzip.decompress(body)
                    except Exception:
                        pass
                # ibland skickas gzip som fil utan header
                if url.endswith(".gz") and not body.startswith(b"<?xml"):
                    try:
                        body = gzip.decompress(body)
                    except Exception:
                        pass
                return FetchResult(url=url, status=status, headers=headers, body=body)
        except (HTTPError, URLError) as e:
            last_err = e
            # backoff
            time.sleep(0.4 * (attempt + 1))
        except Exception as e:
            last_err = e
            time.sleep(0.4 * (attempt + 1))
    return None


def looks_textlike(headers: dict, body: bytes) -> bool:
    ctype = (headers.get("Content-Type", "") or "").lower()
    if "text/" in ctype or "application/json" in ctype or "application/xml" in ctype or "application/xhtml" in ctype:
        return True
    sample = body[:2048]
    if b"\x00" in sample:
        return False
    return True


def decode_bytes(body: bytes, headers: dict) -> str:
    ctype = headers.get("Content-Type", "")
    m = re.search(r"charset=([A-Za-z0-9._-]+)", ctype, re.IGNORECASE)
    if m:
        enc = m.group(1).strip()
        try:
            return body.decode(enc, errors="replace")
        except Exception:
            pass
    # fallback
    try:
        return body.decode("utf-8", errors="replace")
    except Exception:
        return body.decode(errors="replace")


# -----------------------------
# HTML -> “markdown-ish” text
# -----------------------------

def extract_main_html(html: str) -> str:
    """
    Best effort: plocka ut <main> eller <article> (om finns).
    Annars returnera original.
    """
    candidates = []
    for tag in ("main", "article"):
        for m in re.finditer(rf"(?is)<{tag}\b[^>]*>(.*?)</{tag}>", html):
            candidates.append(m.group(1))
    if not candidates:
        return html
    # välj den längsta (oftast content)
    return max(candidates, key=len)


class MarkdownishParser(HTMLParser):
    IGNORE_TAGS = {"script", "style", "noscript"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self._ignore_depth = 0
        self._in_pre = False
        self._in_code_inline = False
        self._pending_heading: Optional[int] = None
        self._li_prefix_pending = False

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()

        if tag in self.IGNORE_TAGS:
            self._ignore_depth += 1
            return
        if self._ignore_depth > 0:
            return

        if tag in {"p", "div", "section", "article", "header", "table", "tr"}:
            self.out.append("\n\n")
        elif tag in {"br"}:
            self.out.append("\n")
        elif tag in {"ul", "ol"}:
            self.out.append("\n\n")
        elif tag == "li":
            self.out.append("\n- ")
            self._li_prefix_pending = True
        elif tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            self.out.append("\n\n")
            self._pending_heading = int(tag[1])
        elif tag == "pre":
            self._in_pre = True
            self.out.append("\n\n```text\n")
        elif tag == "code":
            # om vi redan är i pre, låt vara (pre hanterar blocket)
            if not self._in_pre:
                self._in_code_inline = True
                self.out.append("`")

    def handle_endtag(self, tag):
        tag = tag.lower()

        if tag in self.IGNORE_TAGS:
            if self._ignore_depth > 0:
                self._ignore_depth -= 1
            return
        if self._ignore_depth > 0:
            return

        if tag in {"p", "div", "section", "article", "header"}:
            self.out.append("\n\n")
        elif tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            self.out.append("\n\n")
            self._pending_heading = None
        elif tag == "pre":
            self._in_pre = False
            self.out.append("\n```\n\n")
        elif tag == "code":
            if self._in_code_inline:
                self.out.append("`")
                self._in_code_inline = False
        elif tag == "li":
            self.out.append("\n")

    def handle_data(self, data):
        if self._ignore_depth > 0:
            return
        if not data:
            return

        if self._pending_heading is not None and not self._in_pre:
            # första texten efter hX => skriv rubrikprefix
            prefix = "#" * max(1, min(6, self._pending_heading))
            # skriv prefix bara en gång per rubrik-block
            # (om flera data-chunks kommer, vill vi inte upprepa)
            if not (self.out and self.out[-1].startswith(prefix + " ")):
                self.out.append(f"{prefix} ")

        if self._in_pre:
            self.out.append(data)
        else:
            # kläm whitespace
            s = re.sub(r"\s+", " ", data)
            # undvik att "- " följs av extra spaces
            if self._li_prefix_pending:
                s = s.lstrip()
                self._li_prefix_pending = False
            self.out.append(s)

    def get_text(self) -> str:
        txt = "".join(self.out)
        # städa whitespace
        txt = re.sub(r"[ \t]+\n", "\n", txt)
        txt = re.sub(r"\n{4,}", "\n\n\n", txt)
        return txt.strip() + "\n"


def html_to_markdownish(html: str) -> str:
    # ta bort uppenbara layout-block (best effort)
    html = re.sub(r"(?is)<(nav|aside|footer)\b.*?>.*?</\1>", " ", html)
    main = extract_main_html(html)
    p = MarkdownishParser()
    p.feed(main)
    return p.get_text()


# -----------------------------
# Upptäckt av sidor
# -----------------------------

def try_llms_files(base_url: str) -> dict[str, FetchResult]:
    """
    Försök hitta llms-full.txt / llms.txt / llms-small.txt på några vanliga ställen.
    Returnerar dict: filename -> FetchResult
    """
    root, base = split_root_and_base(base_url)

    variants = ["llms-full.txt", "llms.txt", "llms-small.txt"]
    candidates: list[str] = []

    # under den path du gav (t.ex. https://vercel.com/docs/llms-full.txt)
    for v in variants:
        candidates.append(f"{base}/{v}")

    # på root (t.ex. https://example.com/llms.txt)
    for v in variants:
        candidates.append(f"{root}/{v}")

    # om du gav root, prova /docs/
    if urlsplit(base).path.strip("/") == "":
        for v in variants:
            candidates.append(f"{root}/docs/{v}")

    found: dict[str, FetchResult] = {}
    seen = set()

    for u in candidates:
        if u in seen:
            continue
        seen.add(u)

        r = fetch(u)
        if not r or r.status != 200 or not r.body:
            continue
        if not looks_textlike(r.headers, r.body):
            continue

        fname = u.rstrip("/").split("/")[-1]
        # behåll första träffen per filtyp
        if fname not in found:
            found[fname] = r

    return found


def extract_urls_from_llms_txt(text: str, base_url: str) -> list[str]:
    """
    Plockar ut URL:er ur llms.txt / llms-full.txt (Markdown),
    normaliserar till absoluta URL:er och filtrerar till samma host + docs-prefix.
    Skippar trasiga/placeholder-URL:er som kan trigga ValueError ("Invalid IPv6 URL").
    """
    base = urlsplit(base_url)
    base_host = base.netloc
    base_prefix = base.path.rstrip("/") or "/"

    candidates: set[str] = set()

    # 1) Markdown-länkar: [titel](url)
    for raw in re.findall(r"\[[^\]]+\]\(([^)]+)\)", text):
        candidates.add(raw)

    # 2) “Bare” URL:er: https://...
    for raw in re.findall(r"https?://[^\s<>()\"\']+", text):
        candidates.add(raw)

    out: set[str] = set()

    for raw in candidates:
        u = raw.strip().strip(".,;:")  # ta bort vanlig trailing punkt/komma

        # Gör absoluta URL:er
        if u.startswith("/"):
            u = urljoin(base_url, u)
        elif not (u.startswith("http://") or u.startswith("https://")):
            continue

        # Parse säkert (här händer din crash idag)
        try:
            parts = urlsplit(u)
        except ValueError:
            # Ex: https://[team].vercel.app/... eller andra placeholders
            continue

        if parts.netloc != base_host:
            continue

        # Begränsa till samma docs-"rot" som bas-URL:en (ex /docs)
        if not (parts.path == base_prefix or parts.path.startswith(base_prefix + "/")):
            continue

        # Normalisera: ta bort fragment (#...), behåll query om du vill
        normalized = urlunsplit((parts.scheme, parts.netloc, parts.path, parts.query, ""))
        out.add(normalized)

    return sorted(out)


def fetch_sitemap_urls(base_url: str) -> list[str]:
    root, base = split_root_and_base(base_url)
    base_path = urlsplit(base).path.rstrip("/")

    sitemap_candidates = [
        f"{base}/sitemap.xml",
        f"{root}/sitemap.xml",
        f"{base}/sitemap.xml.gz",
        f"{root}/sitemap.xml.gz",
    ]

    xml_text = None

    for s in sitemap_candidates:
        r = fetch(s)
        if not r or r.status != 200 or not r.body:
            continue
        try:
            xml_text = decode_bytes(r.body, r.headers)
            break
        except Exception:
            continue

    if not xml_text:
        return []

    try:
        root_el = ET.fromstring(xml_text.encode("utf-8", errors="ignore"))
    except Exception:
        try:
            root_el = ET.fromstring(xml_text)
        except Exception:
            return []

    ns = ""
    if root_el.tag.startswith("{"):
        ns = root_el.tag.split("}")[0] + "}"

    def get_loc(el) -> str:
        loc = el.find(f"{ns}loc")
        return (loc.text or "").strip() if loc is not None else ""

    urls: list[str] = []

    # sitemapindex?
    if root_el.tag.endswith("sitemapindex"):
        for sm in root_el.findall(f"{ns}sitemap"):
            loc = get_loc(sm)
            if not loc:
                continue
            sub = fetch(loc)
            if not sub or sub.status != 200 or not sub.body:
                continue
            try:
                sub_text = decode_bytes(sub.body, sub.headers)
                sub_root = ET.fromstring(sub_text.encode("utf-8", errors="ignore"))
            except Exception:
                continue

            sub_ns = ""
            if sub_root.tag.startswith("{"):
                sub_ns = sub_root.tag.split("}")[0] + "}"

            for uel in sub_root.findall(f"{sub_ns}url"):
                loc2 = uel.find(f"{sub_ns}loc")
                if loc2 is not None and loc2.text:
                    urls.append(loc2.text.strip())
    else:
        for uel in root_el.findall(f"{ns}url"):
            loc = uel.find(f"{ns}loc")
            if loc is not None and loc.text:
                urls.append(loc.text.strip())

    # filtrera på base + dedupe
    base_norm = base.rstrip("/")
    out: list[str] = []
    seen = set()

    for u in urls:
        u = normalize_url(u)
        if not u:
            continue

        if urlsplit(u).netloc != urlsplit(base_norm).netloc:
            continue

        if base_path:
            if not urlsplit(u).path.startswith(base_path):
                continue

        if u not in seen:
            seen.add(u)
            out.append(u)

    return out


class SidebarLinkParser(HTMLParser):
    """
    Best effort: plocka <a href> inne i:
      - nav / aside
      - eller element vars class/id innehåller sidebar/menu/nav/toc/docs
    """
    KEYWORDS = ("sidebar", "menu", "nav", "toc", "docs", "navigation")

    def __init__(self, root: str, base: str):
        super().__init__(convert_charrefs=True)
        self.root = root
        self.base = base
        self.base_host = urlsplit(root).netloc
        self.base_path = urlsplit(base).path.rstrip("/")
        self._stack: list[tuple[str, dict]] = []
        self.urls: list[str] = []
        self._seen = set()
        self._ignore_depth = 0

    def _in_candidate(self) -> bool:
        # explicit nav/aside i stacken?
        for tag, attrs in self._stack:
            if tag in ("nav", "aside"):
                return True
            cls = (attrs.get("class", "") or "").lower()
            _id = (attrs.get("id", "") or "").lower()
            blob = f"{cls} {_id}"
            if any(k in blob for k in self.KEYWORDS):
                return True
        return False

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        attrs_dict = {k.lower(): (v or "") for k, v in attrs}

        if tag in ("script", "style", "noscript"):
            self._ignore_depth += 1
            return
        if self._ignore_depth > 0:
            return

        self._stack.append((tag, attrs_dict))

        if tag == "a" and self._in_candidate():
            href = (attrs_dict.get("href") or "").strip()
            if not href or href.startswith("#") or href.lower().startswith("javascript:"):
                return
            if href.startswith("/"):
                href = urljoin(self.root, href)
            else:
                href = urljoin(self.base + "/", href)

            href = normalize_url(href)
            if not href:
                return
            if urlsplit(href).netloc != self.base_host:
                return
            if self.base_path and not urlsplit(href).path.startswith(self.base_path):
                return
            if href not in self._seen:
                self._seen.add(href)
                self.urls.append(href)

    def handle_endtag(self, tag):
        tag = tag.lower()

        if tag in ("script", "style", "noscript"):
            if self._ignore_depth > 0:
                self._ignore_depth -= 1
            return
        if self._ignore_depth > 0:
            return

        if self._stack:
            self._stack.pop()


def discover_pages(base_url: str) -> tuple[str, list[str], dict[str, FetchResult]]:
    """
    Returnerar (metod, urls, llms_files_found)
    """
    llms_files = try_llms_files(base_url)

    # om llms.txt finns, försök plocka sidor därifrån
    if "llms.txt" in llms_files:
        text = decode_bytes(llms_files["llms.txt"].body, llms_files["llms.txt"].headers)
        urls = extract_urls_from_llms_txt(text, base_url)
        if urls:
            return "llms.txt", urls, llms_files

    # annars sitemap
    urls = fetch_sitemap_urls(base_url)
    if urls:
        return "sitemap.xml", urls, llms_files

    # annars sidebar/nav från HTML
    root, base = split_root_and_base(base_url)
    r = fetch(base_url)
    if r and r.status == 200 and r.body:
        html = decode_bytes(r.body, r.headers)
        parser = SidebarLinkParser(root, base)
        parser.feed(html)
        if parser.urls:
            return "sidebar/nav", parser.urls, llms_files

    return "ingen", [], llms_files


# -----------------------------
# Nedladdning + skriv filer
# -----------------------------

def url_to_page_slug(url: str) -> str:
    parts = urlsplit(url)
    path = parts.path.strip("/") or "index"
    # korta extremt långa slugs
    slug = safe_slug(path)
    if len(slug) > 140:
        slug = slug[:140]
    return slug


def save_text(path: Path, text: str):
    path.write_text(text, encoding="utf-8")


def save_bytes(path: Path, data: bytes):
    path.write_bytes(data)


def download_pages(urls: list[str], out_dir: Path, delay: float = DELAY_SEC, max_pages: int = MAX_PAGES_DEFAULT) -> list[Path]:
    """
    Laddar ner varje URL, sparar:
      - raw (html/txt) i raw/
      - markdown-ish i md/
    Returnerar lista med md-filer (Path).
    """
    urls = urls[:max_pages]

    raw_dir = ensure_dir(out_dir / "raw")
    md_dir = ensure_dir(out_dir / "md")

    md_paths: list[Path] = []

    for i, u in enumerate(urls, start=1):
        print(f"  [{i}/{len(urls)}] {u}")
        r = fetch(u)
        if not r or r.status != 200 or not r.body:
            print("    ! misslyckades")
            continue

        # spara raw
        slug = url_to_page_slug(u)
        ctype = (r.headers.get("Content-Type", "") or "").lower()

        # råfiländelse
        ext = ".html"
        if "text/markdown" in ctype:
            ext = ".md"
        elif "text/plain" in ctype:
            ext = ".txt"
        elif "application/json" in ctype:
            ext = ".json"

        raw_path = raw_dir / f"{slug}{ext}"
        save_bytes(raw_path, r.body)

        # bygg md
        text = decode_bytes(r.body, r.headers)

        if "text/html" in ctype or ext == ".html":
            md_body = html_to_markdownish(text)
        else:
            # om det redan är text/markdown/plain: använd som det är
            md_body = text if text.endswith("\n") else (text + "\n")

        md = []
        md.append(f"# {u}\n")
        md.append(f"> Källa: {u}\n\n")
        md.append(md_body)

        md_path = md_dir / f"{slug}.md"
        save_text(md_path, "".join(md))
        md_paths.append(md_path)

        time.sleep(delay)

    return md_paths


def build_combined(md_paths: list[Path], out_path: Path, title: str):
    parts = [f"# {title}\n\n"]
    for p in md_paths:
        try:
            parts.append(p.read_text(encoding="utf-8"))
            parts.append("\n\n---\n\n")
        except Exception:
            continue
    save_text(out_path, "".join(parts))


# -----------------------------
# Interaktiv meny
# -----------------------------

def print_preview(urls: list[str], limit: int = 15):
    for i, u in enumerate(urls[:limit], start=1):
        print(f"  {i:>3}. {u}")
    if len(urls) > limit:
        print(f"  ... ({len(urls) - limit} till)")


def parse_selection(sel: str, n: int) -> list[int]:
    """
    Tar t.ex. "1,3,10-12" => [1,3,10,11,12] (1-baserat)
    """
    sel = (sel or "").strip()
    if not sel:
        return []
    out: set[int] = set()

    for part in sel.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-", 1)
            try:
                start = int(a.strip())
                end = int(b.strip())
            except ValueError:
                continue
            if start > end:
                start, end = end, start
            for x in range(start, end + 1):
                if 1 <= x <= n:
                    out.add(x)
        else:
            try:
                x = int(part)
            except ValueError:
                continue
            if 1 <= x <= n:
                out.add(x)

    return sorted(out)


def choose_action(base_url: str, method: str, pages: list[str], llms_files: dict[str, FetchResult]) -> tuple[str, list[str]]:
    """
    Returnerar (action, urls)
    action:
      - "start"
      - "full_single"  (llms-full om finns, annars combined från urls)
      - "all_pages"
      - "select_pages"
      - "skip"
    """
    has_llms_full = "llms-full.txt" in llms_files
    has_llms_txt = "llms.txt" in llms_files

    print(f"\nUpptäckt:")
    print(f"  Bas: {base_url}")
    print(f"  Metod för sidlista: {method} (hittade {len(pages)} sidor)")
    print(f"  llms-full.txt: {'JA' if has_llms_full else 'NEJ'}")
    print(f"  llms.txt:      {'JA' if has_llms_txt else 'NEJ'}")

    if pages:
        print("\nFörhandsvisning av sidor:")
        print_preview(pages, limit=12)

    while True:
        print("\nVälj:")
        print("  1) Ladda ner bara startsidan")
        print("  2) Ladda ner allt som ETT dokument (prioriterar llms-full.txt om den finns)")
        if pages:
            print("  3) Ladda ner ALLA sidor (separata .md + combined)")
            print("  4) Välj sidor via index (t.ex. 1,3,10-20)")
            print("  5) Filter (regex) på URL och ladda ner matchande")
        print("  0) Hoppa över")

        choice = input("> ").strip()

        if choice == "1":
            return "start", [base_url]

        if choice == "2":
            # om llms-full finns, behöver vi inga pages alls
            return "full_single", pages[:] if pages else [base_url]

        if choice == "3" and pages:
            return "all_pages", pages[:]

        if choice == "4" and pages:
            print(f"Ange val (1-{len(pages)}), t.ex. 1,3,10-20:")
            sel = input("> ").strip()
            idxs = parse_selection(sel, len(pages))
            chosen = [pages[i - 1] for i in idxs]
            if not chosen:
                print("Inget val matchade. Försök igen.")
                continue
            return "select_pages", chosen

        if choice == "5" and pages:
            print("Ange regex (matchas mot URL):")
            pattern = input("> ").strip()
            try:
                rx = re.compile(pattern)
            except re.error as e:
                print(f"Ogiltig regex: {e}")
                continue
            chosen = [u for u in pages if rx.search(u)]
            if not chosen:
                print("Inga URL:er matchade filtret.")
                continue
            print(f"Matchade {len(chosen)} sidor. Förhandsvisning:")
            print_preview(chosen, limit=12)
            return "select_pages", chosen

        if choice == "0":
            return "skip", []

        print("Ogiltigt val. Försök igen.")


def write_llms_files(llms_files: dict[str, FetchResult], out_dir: Path):
    if not llms_files:
        return
    llms_dir = ensure_dir(out_dir / "llms")
    for name, fr in llms_files.items():
        p = llms_dir / name
        save_bytes(p, fr.body)


def run_for_url(base_url: str):
    base_url = normalize_url(base_url)
    if not base_url:
        return

    site_dir = ensure_dir(Path.cwd() / f"docgrab__{slug_from_url(base_url)}")
    print(f"\n==> Sparar till: {site_dir}")

    method, pages, llms_files = discover_pages(base_url)

    # spara llms-filer (om hittade)
    write_llms_files(llms_files, site_dir)

    action, chosen_urls = choose_action(base_url, method, pages, llms_files)
    if action == "skip":
        print("Hoppar över.")
        return

    # action: full_single
    if action == "full_single":
        if "llms-full.txt" in llms_files:
            out = site_dir / "combined__llms-full.txt"
            save_bytes(out, llms_files["llms-full.txt"].body)
            print(f"\nKlart: sparade {out.name} (llms-full.txt).")
            return
        # annars bygg combined från valda sidor
        md_paths = download_pages(chosen_urls, site_dir, max_pages=MAX_PAGES_DEFAULT)
        combined = site_dir / "combined.md"
        build_combined(md_paths, combined, title=base_url)
        print(f"\nKlart: {combined.name}")
        return

    # annars laddar vi sidor (start / all / select)
    md_paths = download_pages(chosen_urls, site_dir, max_pages=MAX_PAGES_DEFAULT)
    combined = site_dir / "combined.md"
    build_combined(md_paths, combined, title=base_url)

    # liten metadatafil
    meta = {
        "base_url": base_url,
        "discovery_method": method,
        "downloaded_pages": len(md_paths),
        "chosen_urls_count": len(chosen_urls),
        "timestamp_unix": int(time.time()),
    }
    save_text(site_dir / "meta.json", json.dumps(meta, ensure_ascii=False, indent=2))

    print(f"\nKlart: {combined.name} (+ {len(md_paths)} sidor i md/).")


def run_for_url_auto(base_url: str, mode: str = "full"):
    """
    Non-interactive version of run_for_url.
    mode: "full" = prioritize llms-full.txt, "all" = download all pages, "start" = just start page
    """
    base_url = normalize_url(base_url)
    if not base_url:
        return

    site_dir = ensure_dir(Path.cwd() / f"docgrab__{slug_from_url(base_url)}")
    print(f"\n==> Sparar till: {site_dir}")

    method, pages, llms_files = discover_pages(base_url)

    # Save llms files if found
    write_llms_files(llms_files, site_dir)

    print(f"Upptäckt: {method} ({len(pages)} sidor)")
    print(f"  llms-full.txt: {'JA' if 'llms-full.txt' in llms_files else 'NEJ'}")
    print(f"  llms.txt:      {'JA' if 'llms.txt' in llms_files else 'NEJ'}")

    if mode == "full":
        # Prefer llms-full.txt
        if "llms-full.txt" in llms_files:
            out = site_dir / "combined__llms-full.txt"
            save_bytes(out, llms_files["llms-full.txt"].body)
            print(f"Klart: sparade {out.name} (llms-full.txt).")
            return
        # Fallback to combined from pages
        if pages:
            md_paths = download_pages(pages, site_dir, max_pages=MAX_PAGES_DEFAULT)
            combined = site_dir / "combined.md"
            build_combined(md_paths, combined, title=base_url)
            print(f"Klart: {combined.name}")
            return
        # Just download start page
        md_paths = download_pages([base_url], site_dir, max_pages=1)
        if md_paths:
            print(f"Klart: laddade startsidan.")

    elif mode == "all":
        chosen = pages if pages else [base_url]
        md_paths = download_pages(chosen, site_dir, max_pages=MAX_PAGES_DEFAULT)
        combined = site_dir / "combined.md"
        build_combined(md_paths, combined, title=base_url)
        print(f"Klart: {combined.name} ({len(md_paths)} sidor).")

    elif mode == "start":
        md_paths = download_pages([base_url], site_dir, max_pages=1)
        print(f"Klart: laddade startsidan.")


def main() -> int:
    # Check for --auto flag
    auto_mode = "--auto" in sys.argv
    mode = "full"
    
    if "--all" in sys.argv:
        mode = "all"
    elif "--start" in sys.argv:
        mode = "start"

    # Filter out flags
    args = [normalize_url(a) for a in sys.argv[1:] 
            if normalize_url(a) and not a.startswith("--")]
    
    if args:
        if auto_mode:
            for u in args:
                run_for_url_auto(u, mode)
        else:
            for u in args:
                run_for_url(u)
        return 0

    print("Klistra in en docs-URL (tom rad avslutar):")
    print("Tips: Kör med --auto för icke-interaktivt läge")
    print("      --auto --all  = ladda ner alla sidor")
    print("      --auto        = prioritera llms-full.txt")
    while True:
        try:
            u = normalize_url(input("> "))
        except EOFError:
            break
        if not u:
            break
        run_for_url(u)

    print("Hejdå.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
