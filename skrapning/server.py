"""
Local server to receive template data from Chrome extension
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from pathlib import Path
import json
import httpx
import asyncio
from datetime import datetime

app = Flask(__name__)
CORS(app)  # Allow requests from Chrome extension

OUTPUT_DIR = Path("v0_templates")
IMAGES_DIR = OUTPUT_DIR / "images"

# Create output directories
OUTPUT_DIR.mkdir(exist_ok=True)
IMAGES_DIR.mkdir(exist_ok=True)


@app.route("/api/templates", methods=["POST"])
def save_templates():
    """Receive and save template data"""
    try:
        data = request.json
        templates = data.get("templates", [])

        if not templates:
            return jsonify({"error": "No templates provided"}), 400

        print(f"\n📥 Received {len(templates)} templates from extension")

        # Download images synchronously
        print("📥 Downloading images...")
        download_images_sync(templates)

        # Save all data
        save_templates_data(templates)

        return jsonify(
            {
                "success": True,
                "count": len(templates),
                "output_dir": str(OUTPUT_DIR.absolute()),
            }
        )

    except Exception as e:
        print(f"❌ Error: {e}")
        return jsonify({"error": str(e)}), 500


def download_images_sync(templates):
    """Download images using asyncio"""
    asyncio.run(download_images(templates))


async def download_images(templates):
    """Download all preview images"""
    async with httpx.AsyncClient() as client:
        for i, template in enumerate(templates, 1):
            if not template.get("preview_image_url"):
                print(f"  [{i}/{len(templates)}] {template['id']}: No image found")
                continue

            try:
                image_path = IMAGES_DIR / template["image_filename"]

                # Skip if already downloaded
                if image_path.exists():
                    print(
                        f"  [{i}/{len(templates)}] {template['id']}: Already downloaded"
                    )
                    continue

                # Download image
                response = await client.get(template["preview_image_url"], timeout=30.0)
                response.raise_for_status()

                # Save image
                image_path.write_bytes(response.content)
                print(f"  [{i}/{len(templates)}] {template['id']}: ✓ Downloaded")

            except Exception as e:
                print(f"  [{i}/{len(templates)}] {template['id']}: ✗ Error - {e}")


def save_templates_data(templates):
    """Save template data to JSON, CSV, and Markdown"""
    # Save as JSON
    json_path = OUTPUT_DIR / "templates.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(templates, f, indent=2, ensure_ascii=False)
    print(f"✓ Saved JSON: {json_path}")

    # Save as CSV
    csv_path = OUTPUT_DIR / "templates.csv"
    with open(csv_path, "w", encoding="utf-8") as f:
        f.write(
            "ID,Title,Slug,Views,Likes,Author,Category,View URL,Edit URL,Image URL,Image Filename,Author Avatar\n"
        )
        for t in templates:
            f.write(
                f'"{t["id"]}","{t["title"]}","{t["slug"]}","{t["views"]}","{t["likes"]}","{t["author"]}","{t["category"]}","{t["view_url"]}","{t["edit_url"]}","{t["preview_image_url"]}","{t["image_filename"]}","{t["author_avatar"]}"\n'
            )
    print(f"✓ Saved CSV: {csv_path}")

    # Save as Markdown
    md_path = OUTPUT_DIR / "templates.md"
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(f"# V0 Landing Page Templates\n\n")
        f.write(f'Scraped on: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}\n\n')
        f.write(f"Total templates: {len(templates)}\n\n")
        f.write("---\n\n")

        for t in templates:
            f.write(f'## {t["title"] or t["id"]}\n\n')

            if t["preview_image_url"]:
                f.write(f'![preview](images/{t["image_filename"]})\n\n')

            f.write(f'- **ID**: `{t["id"]}`\n')
            f.write(f'- **Category**: {t["category"]}\n')

            if t["views"] or t["likes"]:
                f.write(f'- **Stats**: 👁️ {t["views"]} views | ❤️ {t["likes"]} likes\n')

            if t["author"]:
                f.write(f'- **Author**: {t["author"]}\n')

            f.write(f'- **View**: {t["view_url"]}\n')
            f.write(f'- **Edit**: {t["edit_url"]}\n')
            f.write("\n---\n\n")
    print(f"✓ Saved Markdown: {md_path}")


@app.route("/api/health", methods=["GET"])
def health():
    """Health check endpoint"""
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("🚀 V0 Templates Scraper Server")
    print("=" * 60)
    print(f"📁 Output directory: {OUTPUT_DIR.absolute()}")
    print(f"🌐 Server running on: http://localhost:5000")
    print(f"📥 Ready to receive templates from Chrome extension!")
    print("=" * 60 + "\n")

    app.run(port=5000, debug=True)
