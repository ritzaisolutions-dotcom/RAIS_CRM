from pathlib import Path
import sys


MESSAGE = """\
build.py is intentionally retired.

The live CRM is currently maintained directly in index.html.
This repo previously had a stale generator that could overwrite the shipped app
with an obsolete template and reintroduce broken structure.

If you want generated output again, rebuild a single canonical generator first.
Until then, edit index.html directly and run `npm run validate`.
"""


def main() -> int:
    index_path = Path("index.html")
    if not index_path.exists():
        print("index.html is missing.", file=sys.stderr)
        return 1
    print(MESSAGE)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
