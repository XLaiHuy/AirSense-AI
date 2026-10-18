"""Pytest configuration ensuring domain, adapters, and api packages are on sys.path."""
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

paths = [
    REPO_ROOT / "packages" / "domain" / "src",
    REPO_ROOT / "packages" / "data_adapters" / "src",
    REPO_ROOT / "apps" / "api" / "src",
]

for p in paths:
    if p.exists() and str(p) not in sys.path:
        sys.path.insert(0, str(p))
