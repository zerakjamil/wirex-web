#!/usr/bin/env python3
"""Extract the Packet Tracer UI string inventory from the shipped Qt Linguist
template.ts into CSV + file/context inventories for the pt901-uirecon case.

Read-only: parses the app's own translation template; writes only into the
case evidence directory.
"""
import csv
import os
import sys
import xml.etree.ElementTree as ET

DEFAULT_SRC = (
    "/Applications/Cisco Packet Tracer 9.0.1/Cisco Packet Tracer 9.0.1.app"
    "/Contents/LANGUAGES/template.ts"
)

CONNECTIONS_WHITELIST = (
    "file:///",  # anchor for grep hygiene; kept small on purpose
)


def main() -> None:
    src = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "evidence"
    )
    out = os.path.abspath(out)
    os.makedirs(out, exist_ok=True)

    tree = ET.parse(src)
    root = tree.getroot()

    rows = []
    files: dict[str, int] = {}
    contexts: dict[str, int] = {}

    for ctx in root.findall("context"):
        name = ctx.findtext("name") or ""
        contexts.setdefault(name, 0)
        for msg in ctx.findall("message"):
            source = msg.findtext("source")
            if source is None:
                continue
            fns = []
            for loc in msg.findall("location"):
                fn = loc.get("filename") or ""
                fns.append(fn)
                files.setdefault(fn, 0)
                files[fn] += 1
            contexts[name] += 1
            rows.append((name, source, ";".join(sorted(set(fns)))))

    with open(os.path.join(out, "ui_strings.csv"), "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["context", "source", "locations"])
        w.writerows(rows)

    with open(os.path.join(out, "source_files.txt"), "w") as fh:
        for fn in sorted(files):
            fh.write(f"{fn}\t{files[fn]}\n")

    with open(os.path.join(out, "contexts.txt"), "w") as fh:
        for name in sorted(contexts):
            fh.write(f"{name}\t{contexts[name]}\n")

    print(
        f"messages={len(rows)} contexts={len(contexts)} "
        f"source_files={len(files)} -> {out}"
    )


if __name__ == "__main__":
    main()
