#!/usr/bin/env python3
"""
Strip mirrored-folder host/prefix from files.
Replaces occurrences of the specific mirrored-folder segment with nothing so

Example:
https://puntorestaurado-.../proyectooficial-j892d73v9-truenojf10-gmailcoms-projects.vercel.app/index.html
becomes
https://puntorestaurado-.../index.html

Creates a .bak backup per file before writing.
"""
import sys
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
# The mirrored folder segment to remove (as it appears in paths)
MIRROR_SEG = "proyectooficial-j892d73v9-truenojf10-gmailcoms-projects.vercel.app/"

# File extensions to process
EXTS = [".html", ".htm", ".css", ".js", ".json"]

modified = []

for path in ROOT.rglob("*"):
    if not path.is_file():
        continue
    if path.suffix.lower() not in EXTS:
        continue
    try:
        text = path.read_text(encoding="utf-8", errors="surrogatepass")
    except Exception:
        # fallback binary-open and decode
        try:
            text = path.read_text(encoding="latin-1")
        except Exception:
            continue

    if MIRROR_SEG in text:
        new_text = text.replace(MIRROR_SEG, "")
        if new_text != text:
            bak = path.with_suffix(path.suffix + ".bak")
            bak.write_bytes(path.read_bytes())
            path.write_text(new_text, encoding="utf-8")
            modified.append(str(path.relative_to(ROOT)))

# Print summary
print(f"Scanned: {ROOT}")
print(f"Modified {len(modified)} files")
for p in modified:
    print(p)

if not modified:
    print("No files changed.")
else:
    print("Backups saved with .bak suffix next to each modified file.")

sys.exit(0)
