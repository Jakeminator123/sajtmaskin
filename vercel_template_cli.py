"""
Advanced Vercel template scraper
=================================

This module provides a command‑line interface for scraping the
Vercel template directory across *all* of the available filter groups
(Use Case, Framework, CSS, Database, CMS, Authentication, and
Experimentation).  It builds upon the simpler ``vercel_template_browser.py``
but adds the ability to select multiple filter groups at once and to
scrape every slug within a group in a single run.  The goal is to
simulate the behaviour of clicking through Vercel's filter menus
programmatically.

Key features
------------

* **Multiple groups.**  You can select one or more filter groups to
  scrape simultaneously.  For each chosen group you may either
  specify a subset of slugs or opt to scrape *all* known slugs for
  that group.  This mirrors the user experience of exploring every
  option within the UI.

* **Extensible slug catalogue.**  A dictionary named
  ``FILTER_GROUPS`` defines the known slugs for each group.  These
  lists are based on observation of the Vercel template catalogue and
  can be extended as new categories appear (e.g., additional
  databases, authentication providers, or content management systems).
  The script also accepts arbitrary slugs typed by the user.

* **Repository discovery.**  When enabled (the default), the scraper
  will fetch each template’s detail page and attempt to locate a
  GitHub repository link.  Many Vercel templates include a “GitHub
  Repo” button or link that points at the source code.  If no repo is
  found the ``repo`` field is set to ``None``.  A ``--no-github``
  command‑line flag disables this behaviour to speed up large
  scrapes.

* **JSON export.**  The ``--json`` option writes the scraped data to
  the specified file in JSON format.  The JSON structure is a
  dictionary mapping each slug to a list of template objects with
  ``name``, ``description``, ``url`` and ``repo`` keys.  If the file
  exists it will be overwritten.

Usage example
-------------

.. code:: bash

   $ python vercel_template_cli.py --groups use-case,framework --slugs ai,next.js \
         --json templates.json
   Found 30 templates under ai and 15 templates under next.js
   Results saved to templates.json

This command scrapes all templates from the ``ai`` use‑case and
``next.js`` framework categories and writes the output to
``templates.json``.

Limitations
-----------

* Vercel’s web interface relies heavily on JavaScript.  While the
  static HTML returned by ``requests`` is sufficient for most
  categories, some pages may change structure without notice.  The
  parser uses conservative heuristics (looking for ``<h3>`` tags
  inside anchors that match the slug) and may miss templates in edge
  cases.

* The predefined slug lists are not exhaustive.  If you discover a
  new category slug on Vercel’s site, simply provide it on the command
  line or add it to the appropriate list in the ``FILTER_GROUPS``
  dictionary.
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Tuple
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup


@dataclass
class Template:
    """Container for scraped template information."""

    name: str
    description: str
    url: str
    repo: Optional[str]


class VercelScraper:
    """Scrape Vercel template categories and discover repository links."""

    # Organised list of known slugs per filter group.  These values were
    # derived from Vercel's "Find your template" pages (e.g., use cases,
    # frameworks and CSS categories).  Users may extend these lists as
    # new categories appear.  Names have been normalised to lower‑case
    # kebab case to match the slug portion of the URL.
    FILTER_GROUPS: Dict[str, List[str]] = {
        "use-case": [
            "ai",
            "starter",
            "ecommerce",
            "saas",
            "blog",
            "portfolio",
            "cms",
            "backend",
            "edge-functions",
            "edge-middleware",
            "edge-config",
            "cron",
            "multi-tenant-apps",
            "realtime-apps",
            "documentation",
            "virtual-event",
            "monorepos",
            "web3",
            "vercel-firewall",
            "microfrontends",
            "authentication",
            "marketing-sites",
            "cdn",
            "admin-dashboard",
            "security",
        ],
        "framework": [
            "next.js",
            "nuxt",
            "svelte",
            "nitro",
            "turbo",
            "astro",
            "vite",
            "remix",
            "hono",
            "express",
        ],
        "css": [
            "tailwind",
            "css-modules",
        ],
        "database": [
            "postgres",
            "mongodb",
            "azure-mysql",
            "planetscale",
            "redis",
            "mysql",
            "neon",
            "tigris",
            "supabase",
        ],
        "cms": [
            "sanity",
            "contentful",
            "strapi",
            "wordpress",
            "payload",
            "ghost",
            "notion",
            "storyblok",
        ],
        "authentication": [
            "authjs",
            "clerk",
            "supabase-auth",
            "firebase-auth",
            "auth0",
            "kinde",
            "descope",
        ],
        "experimentation": [
            "flags",
            "statsig",
            "optimizely",
            "growthbook",
        ],
    }

    def __init__(self, fetch_github: bool = True) -> None:
        self.fetch_github = fetch_github
        # Standard browser headers to avoid 403 responses.
        self.headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "en-US,en;q=0.9",
        }

    def fetch(self, url: str) -> BeautifulSoup:
        """Download a URL and return a parsed BeautifulSoup object."""
        resp = requests.get(url, headers=self.headers, timeout=30)
        resp.raise_for_status()
        return BeautifulSoup(resp.text, "html.parser")

    def scrape_category(self, slug: str) -> List[Template]:
        """Scrape all templates from a single category slug."""
        url = f"https://vercel.com/templates/{slug}"
        try:
            soup = self.fetch(url)
        except requests.HTTPError as exc:
            print(f"Warning: failed to fetch {url}: {exc}")
            return []
        # Identify template cards: anchors beginning with /templates/<slug>/
        pattern = re.compile(rf"^/templates/{re.escape(slug)}/")
        results: List[Template] = []
        for a in soup.find_all("a", href=pattern):
            h3 = a.find("h3")
            if not h3 or not h3.get_text(strip=True):
                continue
            name = h3.get_text(strip=True)
            desc_div = a.find(
                "div", class_=lambda c: c and "text-label-14" in c
            )
            description = desc_div.get_text(strip=True) if desc_div else ""
            tpl_url = urljoin("https://vercel.com", a.get("href"))
            repo: Optional[str] = None
            if self.fetch_github:
                repo = self.find_repo_link(tpl_url)
            results.append(Template(name, description, tpl_url, repo))
        return results

    def find_repo_link(self, template_url: str) -> Optional[str]:
        """Extract the first GitHub repository URL from a template page."""
        try:
            soup = self.fetch(template_url)
        except requests.HTTPError:
            return None
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if "github.com" in href:
                # Ensure we capture only repository links (owner/repo pattern)
                if re.search(r"github\.com/[^/]+/[^/#?]+", href):
                    return href
        return None

    def scrape(self, slugs: Iterable[str]) -> Dict[str, List[Template]]:
        """Scrape multiple category slugs and aggregate results in a dict."""
        data: Dict[str, List[Template]] = {}
        for slug in slugs:
            templates = self.scrape_category(slug)
            data[slug] = templates
        return data


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Scrape Vercel template categories and export results",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--groups",
        type=str,
        help=(
            "Comma‑separated list of filter groups to scrape (e.g., "
            "use-case,framework,css). If omitted, the script will prompt."
        ),
    )
    parser.add_argument(
        "--slugs",
        type=str,
        help=(
            "Comma‑separated list of slugs to scrape.  If provided, the groups "
            "selection is ignored and only these slugs are scraped."
        ),
    )
    parser.add_argument(
        "--no-github",
        action="store_true",
        help="Skip fetching GitHub repository links for each template.",
    )
    parser.add_argument(
        "--json",
        type=str,
        help="Output path for saving results as JSON.  If omitted, prints to STDOUT.",
    )
    return parser.parse_args()


def prompt_for_groups() -> List[str]:
    """Prompt the user to select one or more filter groups."""
    groups = list(VercelScraper.FILTER_GROUPS.keys())
    print("Available filter groups:")
    for idx, g in enumerate(groups, start=1):
        print(f"  {idx}. {g}")
    group_input = input(
        "Enter one or more group names or numbers (comma‑separated): "
    ).strip()
    chosen: List[str] = []
    for token in [t.strip() for t in group_input.split(",") if t.strip()]:
        if token.isdigit():
            idx = int(token) - 1
            if 0 <= idx < len(groups):
                chosen.append(groups[idx])
        elif token in groups:
            chosen.append(token)
    return list(dict.fromkeys(chosen))  # remove duplicates while preserving order


def prompt_for_slugs(group: str) -> List[str]:
    """Prompt for one or more slugs within a given group."""
    slugs = VercelScraper.FILTER_GROUPS[group]
    print(f"\nAvailable slugs in group '{group}':")
    for idx, s in enumerate(slugs, start=1):
        print(f"  {idx}. {s}")
    slug_input = input(
        "Enter one or more slugs (comma‑separated), 'all' for all slugs, "
        "or leave blank to use the first: "
    ).strip().lower()
    if slug_input == "all":
        return slugs
    if not slug_input:
        return [slugs[0]]
    chosen: List[str] = []
    for token in [t.strip() for t in slug_input.split(",") if t.strip()]:
        if token.isdigit():
            idx = int(token) - 1
            if 0 <= idx < len(slugs):
                chosen.append(slugs[idx])
        else:
            chosen.append(token)
    return list(dict.fromkeys(chosen))


def main() -> None:
    args = parse_args()
    scraper = VercelScraper(fetch_github=not args.no_github)
    if args.slugs:
        # user specified explicit slugs; ignore group selection
        slugs = [s.strip() for s in args.slugs.split(",") if s.strip()]
    else:
        if args.groups:
            selected_groups = [g.strip() for g in args.groups.split(",") if g.strip()]
        else:
            selected_groups = prompt_for_groups()
        # gather slugs from selected groups
        slugs: List[str] = []
        for g in selected_groups:
            if g not in VercelScraper.FILTER_GROUPS:
                print(f"Warning: unknown group '{g}' – skipping")
                continue
            slugs += prompt_for_slugs(g)
        # remove duplicates
        slugs = list(dict.fromkeys(slugs))
    if not slugs:
        print("No slugs selected, exiting.")
        return
    data = scraper.scrape(slugs)
    # Print summary
    for slug, templates in data.items():
        print(f"{slug}: {len(templates)} templates")
    # Export to JSON or print details
    if args.json:
        # serialise dataclasses to dicts
        serialisable = {
            slug: [t.__dict__ for t in templates] for slug, templates in data.items()
        }
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump(serialisable, fh, indent=2)
        print(f"Results saved to {args.json}")
    else:
        for slug, templates in data.items():
            print(f"\n{slug} templates:")
            for tpl in templates:
                repo_part = f" (repo: {tpl.repo})" if tpl.repo else ""
                print(f"  - {tpl.name} → {tpl.url}{repo_part}")


if __name__ == "__main__":
    main()