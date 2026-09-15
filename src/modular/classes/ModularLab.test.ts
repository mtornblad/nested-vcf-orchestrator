import { LabDefaults } from "./LabDefaults";
import { LabPlan } from "./LabPlan";
import { VcfSpec } from "./VcfSpec";
import { CatalogClient } from "./CatalogClient";
import { ModularRun } from "./ModularRun";

describe("Modular VCF lab contract", function () {
    function options(): any {
        var o = LabDefaults.values(); o.lab_password = 'Test-only-"quote\\slash$123'; o.vyos_rest_api_key = "test-only-api-key"; return o;
    }
    function settings(): any {
        return { projectId: "project-1", catalogIds: { foundation: "foundation-1", esxi: "esxi-1", installer: "installer-1", jumphost: "jumphost-1" } };
    }
    function deployment(lab: any): any {
        return { id: "dep-1", projectId: "project-1", catalogItemId: "foundation-1", inputs: { lab: lab },
            status: "CREATE_SUCCESSFUL", outputs: { contract_version: lab.schema, lab_name: lab.lab_name,
                namespace_name: "actual-namespace-abc", external_ip: "192.0.2.10", vpc_name: "actual-vpc" } };
    }
    [2, 4, 8].forEach(function (count) {
        it("renders valid JSON and hostnames for " + count + " hosts", function () {
            var o = options(); o.esx_count = count; var lab = LabPlan.create(o);
            var spec = JSON.parse(JSON.stringify(VcfSpec.build(lab, o.lab_password)));
            expect(spec.hostSpecs.length).toBe(count);
            expect(spec.hostSpecs[count - 1].hostname).toBe("mtesx0" + count + ".dclab.se");
            expect(spec.hostSpecs[0].credentials.password).toBe(o.lab_password);
            expect(spec.vspClusterSpec.systemUserPassword).toBe(o.lab_password);
            expect(JSON.stringify(lab)).not.toContain(o.lab_password);
        });
    });
    it("moves all addresses together and keeps Installer/SDDC identities separate", function () {
        var o = options(); o.lab_cidr = "10.44.0.0/16"; o.installer_host = 11; o.jumphost_host = 5;
        var lab = LabPlan.create(o); var spec = VcfSpec.build(lab, o.lab_password);
        expect(lab.installer_settings.ip).toBe("10.44.1.11");
        expect(lab.jumphost_settings.ip).toBe("10.44.0.5");
        expect(lab.vcf_settings.vsp.ip_pool.start).toBe("10.44.1.110");
        expect(spec.sddcManagerSpec.hostname).not.toBe(lab.installer_settings.fqdn);
        expect(spec.ntpServers[0]).toBe(lab.vyos_settings.fqdn);
        expect(lab.vyos_settings.dns.local_resolver).toBe("127.0.0.1");
    });
    it("rejects address collisions and a DNS forwarding loop", function () {
        var o = options(); o.esx_count = 10;
        expect(function () { LabPlan.create(o); }).toThrowError(/overlaps/);
        o = options(); o.esx_first_host = 10;
        expect(function () { LabPlan.create(o); }).toThrowError(/overlaps/);
        o = options(); o.dns_forwarder = "172.16.0.2";
        expect(function () { LabPlan.create(o); }).toThrowError(/upstream DNS/);
    });
    it("includes Automation only on request, keeps the HCL option and caps DVS MTU", function () {
        var o = options(); o.fabric_mtu = 9000; o.install_automation = true;
        var spec = VcfSpec.build(LabPlan.create(o), o.lab_password);
        expect(spec.vcfAutomationSpec.ipPool.length).toBe(80);
        expect(spec.datastoreSpec.vsanSpec.esaConfig.skipHclAutoDiskClaim).toBe(true);
        expect(spec.dvsSpecs[0].mtu).toBe(9000);
        o.install_automation = false;
        expect(VcfSpec.build(LabPlan.create(o), o.lab_password).vcfAutomationSpec).toBeUndefined();
    });
    it("selects ordered stages and refuses children without a foundation", function () {
        var o = options(); o.deploy_esxi = false; o.deploy_installer = false;
        var state = ModularRun.start(o);
        expect(state.stages).toEqual(["foundation", "jumphost"]);
        state.index = 1;
        expect(function () { ModularRun.inputs(state, LabPlan.create(o), o.lab_password, o.vyos_rest_api_key, "{}"); }).toThrowError(/Foundation outputs/);
    });
    it("passes the realized namespace to children and sends only the required credentials", function () {
        var o = options(); var lab = LabPlan.create(o); var state = ModularRun.start(o);
        expect(ModularRun.poll(state, deployment(lab), lab, settings(), 1, 100)).toBe(true);
        state.index = 1;
        var inputs = ModularRun.inputs(state, lab, o.lab_password, o.vyos_rest_api_key, "{}");
        expect(inputs.namespace_name).toBe("actual-namespace-abc");
        expect(inputs.vyos_rest_api_key).toBeUndefined();
        state.index = 2;
        inputs = ModularRun.inputs(state, lab, o.lab_password, o.vyos_rest_api_key, '{"version":"9.1.1.0"}');
        expect(inputs.external_ip).toBe("192.0.2.10");
        expect(inputs.run_vcf_installation).toBe(false);
    });
    it("treats approvals and eventual 404 as pending and enforces the deadline", function () {
        var o = options(); var lab = LabPlan.create(o); var state = ModularRun.start(o); var d = deployment(lab);
        d.status = "CREATE_INPROGRESS"; d.lastRequest = { status: "APPROVAL_PENDING" };
        expect(ModularRun.poll(state, d, lab, settings(), 1, 100)).toBe(false);
        expect(ModularRun.poll(state, null, lab, settings(), 1, 100)).toBe(false);
        expect(function () { ModularRun.poll(state, d, lab, settings(), 100, 100); }).toThrowError(/expired/);
    });
    it("stops on failure or approval rejection before ordering downstream resources", function () {
        var d = deployment(LabPlan.create(options())); d.lastRequest = { status: "APPROVAL_REJECTED" };
        expect(function () { CatalogClient.complete(d); }).toThrowError(/failed/);
        d.lastRequest = {}; d.status = "CREATE_FAILED";
        expect(function () { CatalogClient.complete(d); }).toThrowError(/failed/);
    });
    it("refuses resume IDs from another project, blueprint, or lab", function () {
        var lab = LabPlan.create(options()); var d = deployment(lab);
        d.projectId = "other";
        expect(function () { CatalogClient.checkOwnership(d, settings(), "foundation", lab); }).toThrowError();
        d.projectId = "project-1"; d.catalogItemId = "full-stack";
        expect(function () { CatalogClient.checkOwnership(d, settings(), "foundation", lab); }).toThrowError();
        d.catalogItemId = "foundation-1"; d.inputs = { lab: { lab_name: "other" } };
        expect(function () { CatalogClient.checkOwnership(d, settings(), "foundation", lab); }).toThrowError(/inputs differ/);
    });
    it("accepts JSON property reordering and both documented output representations", function () {
        expect(CatalogClient.canonical({ b: 1, a: [2] })).toBe(CatalogClient.canonical({ a: [2], b: 1 }));
        var lab = LabPlan.create(options()); var d = deployment(lab);
        Object.keys(d.outputs).forEach(function (key) { d.outputs[key] = { value: d.outputs[key] }; });
        expect(CatalogClient.foundation(d, lab).namespace_name).toBe("actual-namespace-abc");
        delete d.outputs.namespace_name;
        expect(function () { CatalogClient.foundation(d, lab); }).toThrowError(/namespace_name/);
    });
    it("submits the All Apps API contract once and parses its array response", function () {
        var calls: any[] = [];
        var client = new CatalogClient(function (method, path, body) { if (method === "GET") { return false; } calls.push({ method: method, path: path, body: body }); return [{ deploymentId: "new-id" }]; });
        expect(client.request(settings(), "foundation", "lab-foundation", { lab: {} })).toBe("new-id");
        expect(calls.length).toBe(1);
        expect(calls[0].path).toBe("/catalog/api/items/foundation-1/request");
        expect(calls[0].body.projectId).toBe("project-1");
        expect(calls[0].body.bulkRequestCount).toBe(1);
    });
    it("does not retry an ambiguous POST and requires foundation in a resume set", function () {
        var count = 0;
        var client = new CatalogClient(function (method) { if (method === "GET") { return false; } count++; throw new Error("connection interrupted"); });
        expect(function () { client.request(settings(), "foundation", "lab", {}); }).toThrowError();
        expect(count).toBe(1);
        var o = options(); o.resume_deployments = '{"esxi":"id"}';
        expect(function () { ModularRun.start(o); }).toThrowError(/foundation/);
    });
    it("refuses a duplicate deployment name without submitting an order", function () {
        var posts = 0;
        var client = new CatalogClient(function (method) { if (method === "POST") { posts++; } return true; });
        expect(function () { client.request(settings(), "foundation", "existing-lab", {}); }).toThrowError(/already exists/);
        expect(posts).toBe(0);
    });
});
