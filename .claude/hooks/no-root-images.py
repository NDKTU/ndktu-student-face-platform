#!/usr/bin/env python3
"""PreToolUse guard: images belong under screenshots/, never in the project root.

Reads the hook payload on stdin and denies any tool call that would create an
image file directly in the repository root. Anything deeper in the tree
(frontend/public/, docs/, ...) is left alone -- only the root is off limits,
which matches the .gitignore rule treating loose root images as accidental.
"""

import json
import os
import re
import sys

EXTS = (
    "png", "jpg", "jpeg", "gif", "webp",
    "svg", "bmp", "tif", "tiff", "ico", "avif",
)
DEST = "screenshots/"

IMAGE_RE = re.compile(r"\.(?:" + "|".join(EXTS) + r")$", re.IGNORECASE)

# Only shell tokens that unambiguously name an OUTPUT file, so reading or
# grepping an image is never blocked.
WRITE_TARGET_RE = re.compile(
    r"(?:>>?|\s-[oO]\b|\s--output(?:=|\s))\s*['\"]?"
    r"([^\s'\";|&)]+\.(?:" + "|".join(EXTS) + r"))",
    re.IGNORECASE,
)


def project_root():
    return os.path.realpath(os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd())


def is_root_image(path, root):
    if not IMAGE_RE.search(path):
        return False
    resolved = os.path.realpath(os.path.join(root, os.path.expanduser(path)))
    return os.path.dirname(resolved) == root


def deny(path):
    reason = (
        "Blocked by project rule: '%s' would land in the project root. "
        "Every screenshot and image belongs under %s. "
        "Retry with '%s%s'." % (path, DEST, DEST, os.path.basename(path))
    )
    json.dump(
        {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": reason,
            }
        },
        sys.stdout,
    )
    sys.exit(0)


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return  # never block on a payload we cannot parse

    root = project_root()
    tool = payload.get("tool_name") or ""
    tool_input = payload.get("tool_input") or {}

    if tool in ("Write", "Edit", "NotebookEdit"):
        candidates = [tool_input.get("file_path") or ""]
    elif tool.endswith("browser_take_screenshot"):
        candidates = [tool_input.get("filename") or ""]
    elif tool == "Bash":
        candidates = WRITE_TARGET_RE.findall(tool_input.get("command") or "")
    else:
        candidates = []

    for candidate in candidates:
        if candidate and is_root_image(candidate, root):
            deny(candidate)


if __name__ == "__main__":
    main()
