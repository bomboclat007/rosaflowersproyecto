#!/usr/bin/env python3
"""
fix_urls.py

Recorre archivos de texto en el repo (html, htm, js, css, json, txt), excluye archivos *.bak,
y aplica una serie de reemplazos regex para corregir URLs corrompidas por HTTrack/mirror.

Para cada archivo modificado se crea un respaldo con sufijo .bak (no tocamos .bak existentes).

Uso: python scripts/fix_urls.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXTS = {'.html', '.htm', '.js', '.css', '.json', '.txt'}

patterns = [
    # 1) Remove mirror-host prefix that precedes a protocol, keep captured protocol
    (re.compile(r"proyectooficial-[^/\\\s]+/(https?://)", re.IGNORECASE), r"\1"),
    # 2) Remove any leading ../ (or ../../) immediately before an absolute URL
    (re.compile(r"(?:\.\./)+(?=https?://)", re.IGNORECASE), r""),
    # 3) Fix single-slash protocol corruptions: https:/something -> https://something
    (re.compile(r"(https?):/([^/])", re.IGNORECASE), r"\1://\2"),
    # 4) Fix HTTrack-encoded _https_/ or _https_\ or _http_/ variants -> proper protocol
    (re.compile(r"_https_\\?/|_https_/", re.IGNORECASE), r"https://"),
    (re.compile(r"_http_\\?/|_http_/", re.IGNORECASE), r"http://"),
    # 5) If any leftover mirror prefix directly followed by https: or http: remove prefix
    (re.compile(r"proyectooficial-[^/\\\s]+/(?=https?:)" , re.IGNORECASE), r""),
]

def should_process(path: Path) -> bool:
    if path.suffix.lower() not in EXTS:
        return False
    if path.name.endswith('.bak'):
        return False
    return True

def process_file(path: Path) -> bool:
    text = path.read_text(encoding='utf-8', errors='replace')
    original = text
    for pat, repl in patterns:
        text = pat.sub(repl, text)
    if text != original:
        bak = path.with_suffix(path.suffix + '.bak')
        # if .bak exists, make a numbered bak to avoid overwriting
        if bak.exists():
            i = 1
            while True:
                bak_i = path.with_suffix(path.suffix + f'.bak{i}')
                if not bak_i.exists():
                    bak = bak_i
                    break
                i += 1
        bak.write_text(original, encoding='utf-8')
        path.write_text(text, encoding='utf-8')
        print(f"Modified: {path} -> backup: {bak.name}")
        return True
    return False

def main():
    files = list(ROOT.rglob('*'))
    changed = 0
    candidates = [p for p in files if p.is_file() and should_process(p)]
    print(f"Found {len(candidates)} candidate files to scan")
    for p in candidates:
        try:
            if process_file(p):
                changed += 1
        except Exception as e:
            print(f"Error processing {p}: {e}")
    print(f"Done. Modified {changed} files.")

if __name__ == '__main__':
    main()
