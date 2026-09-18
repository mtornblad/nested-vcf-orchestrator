from __future__ import annotations

import importlib.util
import json
import shutil
import subprocess
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("validate_native", ROOT / "scripts/validate_native.py")
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)
NS = validator.NS


class NativeSourceTests(unittest.TestCase):
    def checkout(self) -> Path:
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        shutil.copytree(ROOT / "native", root / "native")
        return root

    def test_imported_dependencies_and_forms_are_complete(self):
        self.assertEqual([], validator.validate(ROOT))
        manifest, elements = validator.read_elements(ROOT)
        self.assertEqual(14, sum(e["type"] == "Workflow" for e, _ in elements.values()))
        self.assertEqual(10, sum(e["type"] == "ScriptModule" for e, _ in elements.values()))
        self.assertEqual(15, sum(len(e["forms"]) for e, _ in elements.values()))

    def test_unknown_workflow_reference_is_rejected(self):
        root = self.checkout()
        p = root / "native/src/main/resources/Workflow/Advania/Custom Resources/VCF/Create VCF.xml"
        p.write_text(p.read_text().replace("6338706b-b8b4-4b6c-9488-219af138d1d3", "unknown-workflow"))
        self.assertTrue(any("missing linked workflow unknown-workflow" in e for e in validator.validate(root)))

    def test_exported_secret_defaults_are_rejected(self):
        root = self.checkout()
        p = root / "native/src/main/resources/Workflow/Advania/Test/Get Bundles Status.xml"
        tree = ET.parse(p)
        attribute = ET.SubElement(tree.getroot(), "{" + NS["w"] + "}attrib", name="password", type="SecureString")
        ET.SubElement(attribute, "{" + NS["w"] + "}value").text = "synthetic-test-default"
        tree.write(p)
        self.assertTrue(any("credential attribute has a value" in e for e in validator.validate(root)))

    def test_missing_interaction_form_is_rejected(self):
        root = self.checkout()
        p = root / "native/src/main/resources/Workflow/Advania/Custom Resources/Certificate Trust/Import vcf installer certificate_input_form_item12.form.json"
        p.unlink()
        with self.assertRaises(FileNotFoundError):
            validator.validate(root)

    def test_test_workflow_connections_are_runtime_inputs(self):
        _, elements = validator.read_elements(ROOT)
        for uid, names in (
            ("1ffa45c0-723c-4e18-9132-49cd0b673381", {"bundleId", "baseUrl", "username", "password"}),
            ("db99072e-4a21-4b8c-a93e-a1adfd964c07", {"baseUrl", "project", "token"}),
        ):
            tree = elements[uid][1]
            self.assertEqual(names, {p.get("name") for p in tree.findall("w:input/w:param", NS)})

    def test_action_binding_detects_missing_sddc_spec(self):
        root = self.checkout()
        manifest, elements = validator.read_elements(root)
        automation = root / "automation"
        for name, operations in manifest["custom_resource_bindings"].items():
            resource = {"resourceType": name, "mainActions": {}}
            for operation, uid in operations.items():
                tree = elements[uid][1]
                resource["mainActions"][operation] = {
                    "id": uid,
                    "inputParameters": [{"name": p.get("name"), "type": p.get("type")} for p in tree.findall("w:input/w:param", NS)],
                }
            path = automation / "src/main/resources/custom-resources" / name / "details.json"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(resource))
        self.assertEqual([], validator.validate(root, automation))
        path = automation / "src/main/resources/custom-resources/Custom.vcf/details.json"
        resource = json.loads(path.read_text())
        resource["mainActions"]["create"]["inputParameters"] = [
            p for p in resource["mainActions"]["create"]["inputParameters"] if p["name"] != "sddcSpec"
        ]
        path.write_text(json.dumps(resource))
        self.assertTrue(any("create inputs differ" in e for e in validator.validate(root, automation)))

    def test_scripts_parse_and_authentication_does_not_log_tokens(self):
        # These actions use a fake REST host. No request is sent to an appliance.
        _, elements = validator.read_elements(ROOT)
        actions = {}
        scripts = []
        for entry, tree in elements.values():
            for item in tree.iter():
                if item.tag.rsplit("}", 1)[-1] == "script" and item.text:
                    scripts.append(item.text)
            if entry["type"] == "ScriptModule":
                actions[entry["name"]] = tree.findtext("script")
        program = r'''
const fs = require("fs");
const vm = require("vm");
const assert = require("assert");
const data = JSON.parse(fs.readFileSync(0, "utf8"));
for (const source of data.scripts) new vm.Script("(function () {\n" + source + "\n})");
const logs = [];
let response = { statusCode: 200, contentAsString: '{"accessToken":"synthetic-access-token"}', getAllHeaders: () => [] };
const context = {
    System: { log: x => logs.push(x), warn: x => logs.push(x), error: x => logs.push(x) },
    restHost: { createRequest: () => ({ setHeader: () => {}, execute: () => response }) },
    username: "synthetic-user", password: "synthetic-password"
};
function run(name) { return vm.runInNewContext("(function () {\n" + data.actions[name] + "\n})()", context, { timeout: 1000 }); }
assert.strictEqual(run("getToken"), "synthetic-access-token");
assert.strictEqual(run("vcfUiReady"), true);
response = { statusCode: 503, contentAsString: '{"sensitive":"synthetic-access-token"}', getAllHeaders: () => [] };
assert.strictEqual(run("vcfUiReady"), false);
assert(!logs.join("\n").includes("synthetic-access-token"));
assert(!logs.join("\n").includes("synthetic-password"));
'''
        result = subprocess.run(["node", "-e", program], input=json.dumps({"actions": actions, "scripts": scripts}), text=True, capture_output=True)
        self.assertEqual(0, result.returncode, result.stderr)


if __name__ == "__main__":
    unittest.main()
