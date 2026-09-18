#!/usr/bin/env python3
"""Generate the modular vRO custom form from its field catalog (no Maven needed)."""
import argparse
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

def form():
    fields = json.loads((ROOT / "configuration/modular-request-fields.json").read_text())
    schema = {}; pages = {}
    for f in fields:
        key = f["name"]
        constraints = {"required": f.get("required", True)}
        for source, target in [("minLength", "min-length"), ("minimum", "min-value"), ("maximum", "max-value")]:
            if source in f: constraints[target] = f[source]
        schema[key] = {"label": f["title"], "description": f.get("description", ""),
                       "type": {"dataType": "integer" if f["type"] == "number" else f["type"], "isMultiple": False},
                       "constraints": constraints}
        if "default" in f: schema[key]["default"] = f["default"]
        page = pages.setdefault(f["page"], {"id": "page_" + f["page"].lower(), "title": f["page"], "sections": [], "state": {}})
        toggle = {"ESXi": "deploy_esxi", "Installer": "deploy_installer", "Jumphost": "deploy_jumphost"}.get(f["page"])
        if toggle:
            page["state"]["visible"] = [{"equals": {toggle: True}, "value": True}, {"equals": {toggle: False}, "value": False}]
            schema[key]["constraints"]["required"] = [{"equals": {toggle: True}, "value": f.get("required", True)}, {"equals": {toggle: False}, "value": False}]
        display = {"string": "textField", "number": "integerField", "boolean": "checkbox"}[f["type"]]
        if key == "resume_deployments": display = "textArea"
        field = {"id": key, "display": display, "state": {"visible": True, "read-only": False}, "signpostPosition": "right-middle"}
        if len(page["sections"]) and len(page["sections"][-1]["fields"]) == 1 and display != "textArea":
            page["sections"][-1]["fields"].append(field)
        else:
            page["sections"].append({"id": "section_" + key, "fields": [field]})
    return {"layout": {"pages": list(pages.values())}, "schema": schema, "options": {"externalValidations": []}}

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument("--check", action="store_true"); args = parser.parse_args()
    target = ROOT / "src/lab/workflows/DeployModularLab.wf.form.json"
    content = json.dumps(form(), indent=2) + "\n"
    if args.check:
        if not target.exists() or target.read_text() != content: raise SystemExit("Modular form is out of date; run scripts/generate_modular_form.py")
    else: target.write_text(content)
