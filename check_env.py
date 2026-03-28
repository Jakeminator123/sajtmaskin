#!/usr/bin/env python3
"""Moved to scripts/env/check_env.py — this wrapper forwards all arguments."""
import subprocess, sys
from pathlib import Path

target = Path(__file__).resolve().parent / "scripts" / "env" / "check_env.py"
sys.exit(subprocess.run([sys.executable, str(target), *sys.argv[1:]]).returncode)
