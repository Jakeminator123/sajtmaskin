#!/usr/bin/env python3
"""
KOSTNADSFRI LINK GENERATOR
===========================

Generates password-protected company pages for the kostnadsfri flow.
Uses the same deterministic password algorithm as the Node.js backend.

SETUP:
  1. Install requests:  pip install requests
  2. Set your seed key:
       export KOSTNADSFRI_PASSWORD_SEED="your-secret-seed-here"
       export KOSTNADSFRI_API_KEY="your-api-key-here"
       export SAJTMASKIN_BASE_URL="https://sajtmaskin.vercel.app"  (optional)

USAGE:
  # Generate a link for a company (password auto-generated):
  python kostnadsfri_generator.py "IKEA AB" --industry retail --website https://ikea.se

  # Generate with explicit password:
  python kostnadsfri_generator.py "IKEA AB" --password mittlosenord123

  # Just preview slug + password without creating (dry-run):
  python kostnadsfri_generator.py "IKEA AB" --dry-run

  # Batch create from a CSV file:
  python kostnadsfri_generator.py --batch companies.csv

  CSV format (first row is header):
    companyName,industry,website,contactEmail,contactName
    IKEA AB,retail,https://ikea.se,info@ikea.se,Anna Svensson
    Cafe Södermalm,cafe,https://cafesoder.se,,

OUTPUT:
  For each company, prints:
    Company:  IKEA AB
    Slug:     ikea-ab
    Password: kR7mXp2q
    URL:      https://sajtmaskin.vercel.app/kostnadsfri/ikea-ab

HOW THE PASSWORD WORKS:
  The password is deterministic: same slug + same seed = same password.
  This means you can regenerate the password anytime without storing it,
  as long as you have the same KOSTNADSFRI_PASSWORD_SEED.

  Algorithm: HMAC-SHA256(seed, slug) -> first 12 hex chars -> base54 encoding -> 8 chars
  Character set: abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789
  (no ambiguous chars: no l, i, I, o, O, 0, 1)
"""

import argparse
import csv
import hashlib
import hmac
import os
import re
import sys
from typing import Optional

# ── Configuration ──────────────────────────────────────────────────

DEFAULT_BASE_URL = "https://sajtmaskin.vercel.app"
PASSWORD_CHARS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"


# ── Slug generation (mirrors generateSlug in index.ts) ─────────────

def generate_slug(company_name: str) -> str:
    """Generate a URL-safe slug from a company name."""
    slug = company_name.lower().strip()
    # Replace Swedish/special characters
    replacements = {"å": "a", "ä": "a", "ö": "o", "é": "e", "ü": "u"}
    for char, replacement in replacements.items():
        slug = slug.replace(char, replacement)
    # Replace non-alphanumeric with hyphens
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    # Remove leading/trailing hyphens and collapse multiples
    slug = slug.strip("-")
    slug = re.sub(r"-{2,}", "-", slug)
    return slug


# ── Password generation (mirrors generatePassword in index.ts) ─────

def generate_password(slug: str, seed: Optional[str] = None) -> str:
    """
    Deterministic password generator.
    Same slug + same seed = same password, matching the Node.js implementation.
    """
    key = seed or os.environ.get("KOSTNADSFRI_PASSWORD_SEED") or os.environ.get("KOSTNADSFRI_API_KEY") or "default-seed"
    digest = hmac.new(key.encode(), slug.encode(), hashlib.sha256).hexdigest()
    # Take first 12 hex chars -> convert to readable password
    return _hex_to_readable_password(digest[:12])


def _hex_to_readable_password(hex_str: str) -> str:
    """Convert hex string to an 8-char readable password (mirrors hexToReadablePassword)."""
    num = int(hex_str, 16)
    base = len(PASSWORD_CHARS)
    result = []
    for _ in range(8):
        result.append(PASSWORD_CHARS[num % base])
        num //= base
    return "".join(result)


# ── API call ───────────────────────────────────────────────────────

def create_page_via_api(
    company_name: str,
    industry: Optional[str] = None,
    website: Optional[str] = None,
    contact_email: Optional[str] = None,
    contact_name: Optional[str] = None,
    password: Optional[str] = None,
    expires_in_days: Optional[int] = None,
) -> dict:
    """Create a kostnadsfri page via the API."""
    import requests

    base_url = os.environ.get("SAJTMASKIN_BASE_URL", DEFAULT_BASE_URL)
    api_key = os.environ.get("KOSTNADSFRI_API_KEY")

    if not api_key:
        raise ValueError("KOSTNADSFRI_API_KEY environment variable is required")

    body = {"companyName": company_name}
    if industry:
        body["industry"] = industry
    if website:
        body["website"] = website
    if contact_email:
        body["contactEmail"] = contact_email
    if contact_name:
        body["contactName"] = contact_name
    if password:
        body["password"] = password
    if expires_in_days:
        body["expiresInDays"] = expires_in_days

    response = requests.post(
        f"{base_url}/api/kostnadsfri",
        json=body,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
        },
    )

    data = response.json()
    if not response.ok or not data.get("success"):
        raise RuntimeError(f"API error: {data.get('error', 'Unknown error')}")

    return data["page"]


BUSINESS_SUFFIXES = {"ab", "hb", "kb", "ek", "ef"}

def _slug_to_display(slug: str) -> str:
    """Convert slug back to display name: 'ikea-ab' -> 'Ikea AB'"""
    return " ".join(
        w.upper() if w in BUSINESS_SUFFIXES else w.capitalize()
        for w in slug.split("-")
    )


# ── Output formatting ──────────────────────────────────────────────

def print_result(company_name: str, slug: str, password: str, url: str):
    """Print a nicely formatted result."""
    print(f"\n  Company:  {company_name}")
    print(f"  Slug:     {slug}")
    print(f"  Password: {password}")
    print(f"  URL:      {url}")
    print()


# ── CLI ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Generate kostnadsfri company pages for SajtMaskin",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Example: python kostnadsfri_generator.py \"IKEA AB\" --industry retail",
    )
    parser.add_argument("company_name", nargs="?", help="Company name (e.g. 'IKEA AB')")
    parser.add_argument("--industry", help="Industry ID (cafe, restaurant, retail, tech, consulting, health, creative, education, ecommerce, realestate, other)")
    parser.add_argument("--website", help="Existing website URL")
    parser.add_argument("--email", help="Contact email")
    parser.add_argument("--contact", help="Contact person name")
    parser.add_argument("--password", help="Explicit password (auto-generated if omitted)")
    parser.add_argument("--expires", type=int, help="Expires in N days")
    parser.add_argument("--dry-run", action="store_true", help="Preview slug + password without calling API")
    parser.add_argument("--batch", help="Path to CSV file for batch creation")
    parser.add_argument("--seed", help="Override KOSTNADSFRI_PASSWORD_SEED")
    parser.add_argument("--verify", action="store_true", help="Run verification: show slug + password for test companies")
    parser.add_argument("--interactive", action="store_true", help="Interactive mode: type company names one by one")

    args = parser.parse_args()

    base_url = os.environ.get("SAJTMASKIN_BASE_URL", DEFAULT_BASE_URL)
    seed = args.seed or os.environ.get("KOSTNADSFRI_PASSWORD_SEED") or os.environ.get("KOSTNADSFRI_API_KEY") or "default-seed"

    # Verify mode — prove the algorithm works with examples
    if args.verify:
        print("\n  PASSWORD VERIFICATION")
        print("  " + "=" * 55)
        print(f"  Seed: {seed[:8]}...{seed[-4:]}" if len(seed) > 12 else f"  Seed: {seed}")
        print()
        test_companies = [
            "IKEA AB",
            "Café Södermalm",
            "Alfa Rekrytering AB",
            "Mitt Företag",
            "Stockholms HB",
        ]
        for name in test_companies:
            slug = generate_slug(name)
            pwd = generate_password(slug, seed)
            url = f"{base_url}/kostnadsfri/{slug}"
            print(f"  {name}")
            print(f"    Slug:     {slug}")
            print(f"    Password: {pwd}")
            print(f"    URL:      {url}")
            print()
        print("  To verify these match Node.js, run in the project root:")
        print('  node -e "import(\'./src/lib/kostnadsfri/index.ts\')"')
        print("  or use --dry-run with a company name.\n")
        return

    # Batch mode
    if args.batch:
        with open(args.batch, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                name = row.get("companyName", "").strip()
                if not name:
                    continue
                slug = generate_slug(name)
                pwd = args.password or generate_password(slug, seed)

                if args.dry_run:
                    url = f"{base_url}/kostnadsfri/{slug}"
                    print_result(name, slug, pwd, url)
                else:
                    try:
                        page = create_page_via_api(
                            company_name=name,
                            industry=row.get("industry", "").strip() or None,
                            website=row.get("website", "").strip() or None,
                            contact_email=row.get("contactEmail", "").strip() or None,
                            contact_name=row.get("contactName", "").strip() or None,
                            password=pwd,
                            expires_in_days=args.expires,
                        )
                        print_result(name, page["slug"], page["password"], page["url"])
                    except Exception as e:
                        print(f"  ERROR for {name}: {e}", file=sys.stderr)
        return

    # No arguments at all -> interactive mode
    if not args.company_name and not args.batch and not args.verify:
        args.interactive = True

    # Interactive mode — type company names and get instant results
    if args.interactive:
        if seed == "default-seed":
            seed = input("  KOSTNADSFRI_PASSWORD_SEED not set.\n  Enter seed: ").strip()
            if not seed:
                print("  No seed provided. Exiting.", file=sys.stderr)
                sys.exit(1)
        print(f"\n  INTERACTIVE MODE (Ctrl+C to exit)")
        print("  " + "-" * 40)
        print(f"  Seed: {seed[:8]}..." if len(seed) > 8 else f"  Seed: {seed}")
        print(f"  Type a company name or slug to get the password.\n")
        try:
            while True:
                name = input("  Company name or slug: ").strip()
                if not name:
                    continue
                # If it looks like a slug already (lowercase, hyphens), use directly
                if name == name.lower() and " " not in name:
                    slug = name
                    display_name = _slug_to_display(slug)
                else:
                    slug = generate_slug(name)
                    display_name = name
                pwd = generate_password(slug, seed)
                url = f"{base_url}/kostnadsfri/{slug}"
                print(f"    Company:  {display_name}")
                print(f"    Slug:     {slug}")
                print(f"    Password: {pwd}")
                print(f"    URL:      {url}")
                print()
        except (KeyboardInterrupt, EOFError):
            print("\n  Done.\n")
        return

    # Single mode requires company_name
    if not args.company_name:
        parser.print_help()
        sys.exit(1)

    slug = generate_slug(args.company_name)
    pwd = args.password or generate_password(slug, seed)

    if args.dry_run:
        url = f"{base_url}/kostnadsfri/{slug}"
        print_result(args.company_name, slug, pwd, url)
        return

    try:
        page = create_page_via_api(
            company_name=args.company_name,
            industry=args.industry,
            website=args.website,
            contact_email=args.email,
            contact_name=args.contact,
            password=pwd,
            expires_in_days=args.expires,
        )
        print_result(args.company_name, page["slug"], page["password"], page["url"])
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
