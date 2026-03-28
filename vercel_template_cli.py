#!/usr/bin/env python3
"""Moved to scripts/manual/vercel_template_cli.py — this wrapper forwards all arguments."""
import subprocess, sys
from pathlib import Path

target = Path(__file__).resolve().parent / "scripts" / "manual" / "vercel_template_cli.py"
sys.exit(subprocess.run([sys.executable, str(target), *sys.argv[1:]]).returncode)
