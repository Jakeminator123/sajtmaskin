#!/usr/bin/env python3
"""Compatibility wrapper: forwards to scripts/env/manage_env.py audit."""
import subprocess
import sys
from pathlib import Path

target = Path(__file__).resolve().parent / "scripts" / "env" / "manage_env.py"
sys.exit(subprocess.run([sys.executable, str(target), "audit", *sys.argv[1:]]).returncode)
