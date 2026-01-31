#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
doc.py - Download documentation pages for MCP indexing.

Usage:
  python services/mpc/doc.py --auto <url> [<url>...]
"""

from __future__ import annotations

import argparse
import html
import re
import sys
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

SKIP_TAGS = {"script", "style", "noscript"}
BLOCK_TAGS = {
    "p",
    "div",
    "section",
    "article",
    "header",
    "footer",
    "nav",
    "main",
    "aside",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "table",
    "tr",
    "ul",
    "ol",
    "li",
    "pre",
    "code",
    "blockquote",
}


class HTMLTextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in SKIP_TAGS:
            self._skip_depth += 1
            return
        if tag in BLOCK_TAGS:
            self.parts.append("\n")
        if tag == "li":
            self.parts.append("- ")
        if tag == "br":
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in SKIP_TAGS and self._skip_depth > 0:
            self._skip_depth -= 1
            return
        if tag in BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip_depth > 0:
            return
        if data:
            self.parts.append(html.unescape(data))

    def get_text(self) -> str:
        raw = "".join(self.parts)
        lines = [re.sub(r"\s+", " ", line).strip() for line in raw.splitlines()]
        cleaned: list[str] = []
        for line in lines:
            if line:
                cleaned.append(line)
            elif cleaned and cleaned[-1] != "":
                cleaned.append("")
        text = "\n".join(cleaned).strip()
        return f"{text}\n" if text else ""


def normalize_url(url: str) -> str:
    cleaned = (url or "").strip().strip('"\'')
    if cleaned and not cleaned.startswith(("http://", "https://")):
        cleaned = f"https://{cleaned}"
    return cleaned


def safe_path_fragment(value: str) -> str:
    sanitized = re.sub(r"[^A-Za-z0-9._-]+", "-", value)
    return sanitized.strip("-") or "root"


def output_directory(base_dir: Path, url: str) -> Path:
    parsed = urlparse(url)
    host = parsed.netloc.replace(":", "_") or "unknown-host"
    path_part = parsed.path.strip("/") or "root"
    path_part = safe_path_fragment(path_part.replace("/", "__"))
    return base_dir / f"docgrab__{host}__{path_part}"


def extract_title(html_text: str) -> str:
    match = re.search(r"<title>(.*?)</title>", html_text, re.IGNORECASE | re.DOTALL)
    if not match:
        return ""
    return html.unescape(match.group(1).strip())


def fetch_url(url: str) -> str:
    request = Request(
        url,
        headers={
            "User-Agent": "sajtmaskin-docgrab/1.0",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )
    with urlopen(request, timeout=30) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")


def process_url(url: str, docs_dir: Path) -> bool:
    try:
        html_text = fetch_url(url)
    except Exception as exc:
        print(f"ERROR: Failed to fetch {url}: {exc}", file=sys.stderr)
        return False

    extractor = HTMLTextExtractor()
    extractor.feed(html_text)
    text = extractor.get_text()
    title = extract_title(html_text)

    out_dir = output_directory(docs_dir, url)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / "index.txt"

    header_lines = [
        f"Source: {url}",
        f"Title: {title}" if title else "Title: (unknown)",
        f"Fetched: {datetime.now(timezone.utc).isoformat()}",
        "",
    ]
    out_file.write_text("\n".join(header_lines) + text, encoding="utf-8")
    print(f"OK: Saved {url} -> {out_file}")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Download documentation pages for MCP indexing.")
    parser.add_argument("--auto", action="store_true", help="Run without prompts.")
    parser.add_argument("urls", nargs="*", help="One or more URLs to download.")
    args = parser.parse_args()

    docs_dir = Path(__file__).parent / "docs"
    docs_dir.mkdir(parents=True, exist_ok=True)

    if not args.urls:
        if args.auto:
            print("ERROR: No URLs provided.", file=sys.stderr)
            return 1
        print("Please provide one or more URLs.", file=sys.stderr)
        return 1

    ok = True
    for raw in args.urls:
        url = normalize_url(raw)
        if not url:
            continue
        ok = process_url(url, docs_dir) and ok

    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
