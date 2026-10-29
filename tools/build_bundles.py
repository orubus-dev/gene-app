#!/usr/bin/env python3
"""Build the two model bundles the app downloads.
Usage: python3 tools/build_bundles.py /path/to/Gene-checkout
Writes model/gene-src.zip and model/gene-mind.zip next to this script's repo."""
import os, sys, zipfile

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(HERE), "gene")

EXCLUDE_DIRS = {"__pycache__", "mind", "scripts", "tests", ".git", "node_modules",
                ".github", "download", "docs"}

def build():
    src_zip = os.path.join(HERE, "model", "gene-src.zip")
    with zipfile.ZipFile(src_zip, "w", zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(SRC):
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
            for f in files:
                if f.endswith((".pyc", ".log")):
                    continue
                full = os.path.join(root, f)
                z.write(full, os.path.relpath(full, SRC))

    mind_zip = os.path.join(HERE, "model", "gene-mind.zip")
    with zipfile.ZipFile(mind_zip, "w", zipfile.ZIP_DEFLATED) as z:
        mdir = os.path.join(SRC, "mind")
        for f in sorted(os.listdir(mdir)):
            if "archive" in f or f.endswith((".log", ".jsonl.archive")):
                continue
            z.write(os.path.join(mdir, f), f)

    for p in (src_zip, mind_zip):
        print(f"{os.path.basename(p)}: {os.path.getsize(p)/1e6:.2f} MB")

if __name__ == "__main__":
    build()
