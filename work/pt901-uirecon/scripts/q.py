#!/usr/bin/env python3
"""Query helper for the pt901-uirecon ui_strings.csv evidence.

Usage:
  python3 q.py --context NAME [--grep REGEX] [--limit N] [--show-loc]
  python3 q.py --grep REGEX [--context NAME]
"""
import argparse
import csv
import os
import re
import sys

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "evidence")
CSV = os.path.join(BASE, "ui_strings.csv")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--context")
    ap.add_argument("--grep")
    ap.add_argument("--limit", type=int, default=400)
    ap.add_argument("--show-loc", action="store_true")
    a = ap.parse_args()
    pat = re.compile(a.grep, re.I) if a.grep else None
    n = 0
    with open(CSV, newline="") as fh:
        for row in csv.DictReader(fh):
            if a.context and row["context"] != a.context:
                continue
            if pat and not pat.search(row["source"]):
                continue
            loc = ""
            if a.show_loc and row["locations"]:
                loc = "  @" + row["locations"].split(";")[0]
            print(f'{row["context"]}: {row["source"]}{loc}')
            n += 1
            if n >= a.limit:
                break
    print(f"-- {n} rows", file=sys.stderr)


if __name__ == "__main__":
    main()
