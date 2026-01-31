#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
download-docs.py - Enkelt skript för att ladda ner dokumentation till MCP-servern

Användning:
  python scripts/download-docs.py

Skriptet frågar interaktivt efter en URL och laddar ner dokumentationen
till services/mpc/docs/ där MCP-servern automatiskt kan använda den.
"""

import sys
import os
from pathlib import Path

# Hitta projektroten (mappen med package.json)
PROJECT_ROOT = Path(__file__).parent.parent
DOCS_DIR = PROJECT_ROOT / "services" / "mpc" / "docs"
DOC_PY = PROJECT_ROOT / "services" / "mpc" / "doc.py"


def normalize_url(url: str) -> str:
    """Normalisera URL - ta bort citattecken och whitespace"""
    url = (url or "").strip().strip('"\'').rstrip('"\'').strip()
    if url and not url.startswith("http"):
        # Lägg till https:// om det saknas
        url = f"https://{url}"
    return url


def check_dependencies():
    """Kontrollera att doc.py finns"""
    if not DOC_PY.exists():
        print(f"❌ Fel: Kan inte hitta doc.py på {DOC_PY}")
        print(f"   Kontrollera att services/mpc/doc.py finns.")
        return False
    
    if not DOCS_DIR.exists():
        print(f"❌ Fel: Dokumentationsmappen finns inte: {DOCS_DIR}")
        print(f"   Skapar mappen...")
        DOCS_DIR.mkdir(parents=True, exist_ok=True)
    
    return True


def main():
    print("\n" + "="*60)
    print("📚 SAJTMASKIN - Dokumentationsnedladdning")
    print("="*60)
    print(f"\nDokumentation sparas i: {DOCS_DIR}")
    print("MCP-servern indexerar automatiskt alla filer här.\n")
    
    if not check_dependencies():
        return 1
    
    # Ändra till docs-mappen för att doc.py ska fungera korrekt
    original_cwd = os.getcwd()
    os.chdir(DOCS_DIR)
    
    try:
        print("Ange URL till dokumentationen du vill ladda ner.")
        print("Exempel:")
        print("  - https://ai-sdk.dev/docs")
        print("  - https://platform.openai.com/docs")
        print("  - https://v0.dev/docs")
        print("\nTryck Enter utan URL för att avsluta.\n")
        
        while True:
            try:
                url_input = input("📥 URL: ").strip()
                
                if not url_input:
                    print("\n👋 Avslutar...")
                    break
                
                url = normalize_url(url_input)
                
                if not url:
                    print("⚠️  Ogiltig URL. Försök igen.\n")
                    continue
                
                print(f"\n🔄 Laddar ner dokumentation från: {url}")
                print("   Detta kan ta en stund...\n")
                
                # Anropa doc.py med subprocess för bättre isolering
                import subprocess
                
                try:
                    # Kör doc.py med --auto flaggan
                    result = subprocess.run(
                        [sys.executable, str(DOC_PY), "--auto", url],
                        cwd=str(DOCS_DIR),
                        capture_output=False,  # Visa output direkt
                        text=True
                    )
                    
                    if result.returncode == 0:
                        print(f"\n✅ Klart! Dokumentationen är nu tillgänglig för MCP-servern.")
                        print(f"   Filerna finns i: {DOCS_DIR}")
                        print(f"\n   💡 Tips: Starta om MCP-servern (eller vänta tills Cursor startar den)")
                        print(f"   för att den nya dokumentationen ska bli sökbar.\n")
                    else:
                        print(f"\n⚠️  Nedladdningen avslutades med kod {result.returncode}")
                        print(f"   Kontrollera outputen ovan för mer information.\n")
                        
                except Exception as e:
                    print(f"\n❌ Fel vid nedladdning: {e}")
                    print(f"   Kontrollera att URL:en är korrekt och att du har internetanslutning.\n")
                    import traceback
                    if "--debug" in sys.argv:
                        traceback.print_exc()
                
            except KeyboardInterrupt:
                print("\n\n👋 Avslutar...")
                break
            except EOFError:
                print("\n\n👋 Avslutar...")
                break
    
    finally:
        # Återställ working directory
        os.chdir(original_cwd)
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
