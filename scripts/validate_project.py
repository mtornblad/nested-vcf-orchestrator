#!/usr/bin/env python3
"""Check project metadata offline; compilation and Jasmine tests require Maven."""

from __future__ import annotations

import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
NS = {"m": "http://maven.apache.org/POM/4.0.0"}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile")
    args = parser.parse_args()
    errors: list[str] = []
    if args.profile is not None and not re.fullmatch(r"[A-Za-z0-9_.-]+", args.profile):
        errors.append("Maven profile contains unsupported characters")
    try:
        pom = ET.parse(ROOT / "pom.xml").getroot()
        for path, expected in (
            ("m:parent/m:groupId", "com.vmware.pscoe.o11n"),
            ("m:parent/m:artifactId", "typescript-project-all"),
            ("m:parent/m:version", "4.25.0"),
            ("m:packaging", "package"),
        ):
            if pom.findtext(path, namespaces=NS) != expected:
                errors.append(f"{path} must be {expected}")
        options = json.loads((ROOT / "tsconfig.json").read_text())["compilerOptions"]
        if options.get("experimentalDecorators") is not True:
            errors.append("experimentalDecorators must be enabled for workflow source")
        ET.parse(ROOT / "configuration" / "settings.example.xml")
        if not list((ROOT / "src").rglob("*.wf.ts")):
            errors.append("No TypeScript workflows found")
        if not list((ROOT / "src").rglob("*.test.ts")):
            errors.append("No TypeScript unit tests found")
    except (OSError, ValueError, KeyError, ET.ParseError) as error:
        errors.append(str(error))
    for error in errors:
        print(f"ERROR: {error}", file=sys.stderr)
    if errors:
        return 1
    print("Project metadata is valid. Use make test/package for TypeScript compilation and tests.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
