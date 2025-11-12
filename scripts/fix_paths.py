#!/usr/bin/env python3
"""
Fix common HTTrack/Squarespace export path problems in HTML files:
- Convert relative CDN image paths like "../images.squarespace-cdn.com/..." to "https://images.squarespace-cdn.com/..."
- Replace "https_/images.squarespace-cdn.com" artifacts with proper "https://images.squarespace-cdn.com"
- Strip the mirrored-folder hostname "proyectooficial-j892d73v9-truenojf10-gmailcoms-projects.vercel.app/" from links so they become root-relative

This edits files in-place and prints changed files. Run a git diff after to review.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
print(f"Scanning HTML files under: {ROOT}")

html_files = list(ROOT.rglob('*.html'))
print(f"Found {len(html_files)} .html files")

img_pattern = re.compile(r'(?:\.{2}/)+images\.squarespace-cdn\.com', flags=re.IGNORECASE)
https_underscore = 'https_/images.squarespace-cdn.com'
mirrored_host = 'proyectooficial-j892d73v9-truenojf10-gmailcoms-projects.vercel.app/'
mirrored_host_bare = 'proyectooficial-j892d73v9-truenojf10-gmailcoms-projects.vercel.app'

changed_files = []
for f in html_files:
    text = f.read_text(encoding='utf-8', errors='ignore')
    new = text

    # ../images.squarespace-cdn.com  -> https://images.squarespace-cdn.com
    new = img_pattern.sub('https://images.squarespace-cdn.com', new)

    # https_/images.squarespace-cdn.com -> https://images.squarespace-cdn.com
    if https_underscore in new:
        new = new.replace(https_underscore, 'https://images.squarespace-cdn.com')

    # Strip mirrored host occurrences (only this exact host)
    if mirrored_host in new:
        new = new.replace(mirrored_host, '')
    if mirrored_host_bare in new:
        # in some cases it may appear without trailing slash
        new = new.replace(mirrored_host_bare, '')

    # Also fix occasional '../../https_/images...'
    new = re.sub(r'(?:\.{2}/)+https_/?/images\.squarespace-cdn\.com', 'https://images.squarespace-cdn.com', new)

    if new != text:
        # Backup original file
        bak = f.with_suffix(f.suffix + '.bak')
        try:
            if not bak.exists():
                bak.write_text(text, encoding='utf-8')
        except Exception as e:
            print(f"Warning: could not write backup for {f}: {e}")
        f.write_text(new, encoding='utf-8')
        changed_files.append(str(f.relative_to(ROOT)))

print(f"Modified {len(changed_files)} files")
for cf in changed_files[:200]:
    print(cf)

if len(changed_files) == 0:
    print('No files changed — nothing to commit')
else:
    print('\nNext steps: review changes with "git status" and "git diff". If OK, run:')
    print('  git add . && git commit -m "fix: normalize CDN image URLs and remove mirrored-folder host from HTML"')
