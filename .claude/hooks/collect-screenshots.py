#!/usr/bin/env python3
"""PostToolUse: relocate Playwright MCP screenshots into screenshots/.

The Playwright MCP server resolves relative filenames against its --output-dir,
which is a scratch area for session traces and console logs. Any image landing
there is a screenshot, so move it where the project rule says screenshots live.
Never overwrites: a colliding name gets a -1, -2, ... suffix.
"""

import os
import shutil
import sys

EXTS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp",
    ".svg", ".bmp", ".tif", ".tiff", ".ico", ".avif",
}
SCRATCH = os.path.join(".claude", "playwright-mcp")
DEST = "screenshots"


def unique(path):
    if not os.path.exists(path):
        return path
    stem, ext = os.path.splitext(path)
    n = 1
    while os.path.exists("%s-%d%s" % (stem, n, ext)):
        n += 1
    return "%s-%d%s" % (stem, n, ext)


def main():
    sys.stdin.read()  # drain the payload; the scan below is what matters

    root = os.path.realpath(os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd())
    scratch = os.path.join(root, SCRATCH)
    dest = os.path.join(root, DEST)
    if not os.path.isdir(scratch):
        return

    moved = []
    for name in os.listdir(scratch):
        src = os.path.join(scratch, name)
        if not os.path.isfile(src):
            continue
        if os.path.splitext(name)[1].lower() not in EXTS:
            continue
        os.makedirs(dest, exist_ok=True)
        target = unique(os.path.join(dest, name))
        shutil.move(src, target)
        moved.append(os.path.relpath(target, root))

    if moved:
        sys.stdout.write(
            '{"systemMessage": "Screenshot moved to %s"}' % ", ".join(moved)
        )


if __name__ == "__main__":
    main()
