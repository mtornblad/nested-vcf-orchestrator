#!/usr/bin/env python3
"""Validate imported vRO IDs, forms, links and optional VCFA action bindings."""
from __future__ import annotations

import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NS = {"w": "http://vmware.com/vco/workflow"}
ACTION_CALL = re.compile(r'System\.getModule\(["\']([^"\']+)["\']\)\.([A-Za-z_$][\w$]*)')


def read_elements(root: Path) -> tuple[dict, dict[str, tuple[dict, ET.Element]]]:
    manifest = json.loads((root / "native/import-manifest.json").read_text())
    source = root / "native/src/main/resources"
    elements = {}
    for entry in manifest["elements"]:
        uid = entry["id"]
        if uid in elements:
            raise ValueError(f"Duplicate native element ID: {uid}")
        path = source / entry["path"]
        if not path.resolve().is_relative_to(source.resolve()):
            raise ValueError("Native source path escapes its source directory")
        elements[uid] = (entry, ET.parse(path).getroot())
    return manifest, elements


def validate(root: Path = ROOT, automation: Path | None = None) -> list[str]:
    errors: list[str] = []
    source = root / "native/src/main/resources"
    manifest, elements = read_elements(root)
    expected_infos = set()
    expected_forms = set()
    actions = {e["category"] + "/" + e["name"] for e, _ in elements.values() if e["type"] == "ScriptModule"}
    external = {e["id"] for e in manifest["external_workflows"]}
    workflows = {uid for uid, (e, _) in elements.items() if e["type"] == "Workflow"}

    for uid, (entry, tree) in elements.items():
        path = source / entry["path"]
        label = entry["name"]
        if tree.get("id") != uid:
            errors.append(f"{label}: data and manifest IDs differ")
        info_path = path.with_name(path.stem + ".element_info.xml")
        expected_infos.add(info_path)
        info = {e.get("key"): e.text for e in ET.parse(info_path).getroot().findall("entry")}
        for key, expected in (("id", uid), ("name", label), ("type", entry["type"]), ("categoryPath", entry["category"])):
            if info.get(key) != expected:
                errors.append(f"{label}: incorrect metadata {key}")
        for form_path in entry["forms"]:
            p = source / form_path
            if not p.resolve().is_relative_to(source.resolve()):
                raise ValueError("Form path escapes its source directory")
            expected_forms.add(p)
            form = json.loads(p.read_text())
            if "schema" not in form or "layout" not in form:
                errors.append(f"{label}: form lacks schema/layout")

        for item in tree.iter():
            script_module = item.get("script-module")
            if script_module and script_module not in actions:
                errors.append(f"{label}: missing action {script_module}")
            link = item.get("linked-workflow-id")
            if item.tag.rsplit("}", 1)[-1] == "reference" and item.get("type") == "Workflow":
                link = item.get("id")
            if link and link not in workflows | external:
                errors.append(f"{label}: missing linked workflow {link}")
            if item.tag.rsplit("}", 1)[-1] == "script":
                script = item.text or ""
                for module, action in ACTION_CALL.findall(script):
                    if module + "/" + action not in actions:
                        errors.append(f"{label}: missing script action {module}/{action}")
                if re.search(r'System\.(?:log|warn|error)\([^;\n]*contentAsString', script):
                    errors.append(f"{label}: raw API response is logged")
                if re.search(r'\b(?:var|let|const)\s+(?:password|token)\s*=\s*["\'][^"\']+["\']', script):
                    errors.append(f"{label}: embedded credential in script")
        if entry["type"] != "Workflow":
            continue
        parameters = tree.findall("w:input/w:param", NS)
        main_form = json.loads(path.with_suffix(".form.json").read_text())
        if {p.get("name") for p in parameters} != set(main_form["schema"]):
            errors.append(f"{label}: workflow input/form fields differ")
        for attribute in tree.findall("w:attrib", NS):
            value = attribute.findtext("w:value", default="", namespaces=NS)
            if re.search("password|token|secret", attribute.get("name", ""), re.I) and value.strip():
                errors.append(f"{label}: exported credential attribute has a value")
        items = {item.get("name") for item in tree.findall("w:workflow-item", NS)}
        for item in tree.findall("w:workflow-item", NS):
            for key in ("out-name", "alt-out-name", "catch-name"):
                if item.get(key) and item.get(key) not in items:
                    errors.append(f"{label}: unresolved canvas target {item.get(key)}")
        if tree.get("root-name") not in items:
            errors.append(f"{label}: invalid canvas entry point")

    if expected_infos != set(source.rglob("*.element_info.xml")):
        errors.append("Native inventory does not match the packaged element metadata")
    if expected_forms != set(source.rglob("*.form.json")):
        errors.append("Native inventory does not match the packaged forms")
    for resource, operations in manifest["custom_resource_bindings"].items():
        for operation, uid in operations.items():
            if uid not in workflows:
                errors.append(f"{resource}.{operation}: missing workflow {uid}")

    if automation is not None:
        paths = sorted(automation.glob("**/src/main/resources/custom-resources/*/details.json"))
        if not paths:
            errors.append("No custom-resource definitions found in the automation checkout")
        seen: set[str] = set()
        for path in paths:
            resource = json.loads(path.read_text())
            name = resource.get("resourceType")
            if name not in manifest["custom_resource_bindings"]:
                continue
            seen.add(name)
            for operation, uid in manifest["custom_resource_bindings"][name].items():
                action = resource.get("mainActions", {}).get(operation, {})
                if action.get("id") != uid:
                    errors.append(f"{path}: {operation} workflow ID differs")
                    continue
                tree = elements[uid][1]
                expected = {p.get("name"): p.get("type") for p in tree.findall("w:input/w:param", NS)}
                actual = {p["name"]: p["type"] for p in action.get("inputParameters", [])}
                if actual != expected:
                    errors.append(f"{path}: {operation} inputs differ from workflow: expected {sorted(expected)}")
                outputs = {p.get("name"): p.get("type") for p in tree.findall("w:output/w:param", NS)}
                for param in action.get("outputParameters", []):
                    if outputs.get(param["name"]) != param["type"]:
                        errors.append(f"{path}: {operation} output {param['name']} differs")
        if seen != set(manifest["custom_resource_bindings"]):
            errors.append("Expected VCF and certificate custom-resource definitions were not both found")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--automation", type=Path, help="Check IDs and parameters against this automation checkout")
    args = parser.parse_args()
    try:
        errors = validate(automation=args.automation)
    except (OSError, ValueError, KeyError, ET.ParseError) as error:
        errors = [str(error)]
    for error in errors:
        print(f"ERROR: {error}", file=sys.stderr)
    if errors:
        return 1
    print("Native workflows, actions, forms and dependency contracts are valid.")
    print("Runtime dependency: Configurator certificate-delete workflow 8a70a326-ffd7-4fef-97e0-2002ac49f5bd.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
