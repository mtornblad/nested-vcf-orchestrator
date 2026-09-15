import { Workflow, RootItem, Item, DecisionItem, WaitingTimerItem, WorkflowEndItem, In, Out, Err, DefaultErrorHandler } from "vrotsc-annotations";
import { LabPlan } from "../classes/LabPlan";
import { LabDefaults } from "../classes/LabDefaults";
import { VcfSpec } from "../classes/VcfSpec";
import { CatalogProfile } from "../classes/CatalogProfile";
import { CatalogClient } from "../classes/CatalogClient";
import { ModularRun } from "../classes/ModularRun";

@Workflow({
    "id": "f7be53c8-9837-47c3-9aee-ce206e457440",
    "name": "Deploy Modular VCF Lab",
    "path": "Nested VCF Lab/Modular",
    "version": "0.1.0",
    "description": "Order Foundation, ESXi, Installer and Jumphost through the VCFA All Apps catalog.",
    "restartMode": 1,
    "resumeFromFailedMode": 2,
    "input": {
        "profile_name": {
            "type": "string",
            "title": "Catalog configuration",
            "required": true,
            "description": "Configuration created with Configure Modular Catalog; separate from your Maven build profile."
        },
        "lab_name": {
            "type": "string",
            "title": "Lab name",
            "required": true
        },
        "lab_password": {
            "type": "string",
            "title": "Shared lab password",
            "required": true,
            "description": "Plaintext lab input. Used by guest bootstrap and the generated VCF JSON; no password is stored in source."
        },
        "vyos_rest_api_key": {
            "type": "string",
            "title": "VyOS REST API key",
            "required": true
        },
        "deploy_esxi": {
            "type": "boolean",
            "title": "Deploy ESXi hosts",
            "required": true
        },
        "deploy_installer": {
            "type": "boolean",
            "title": "Deploy VCF Installer",
            "required": true
        },
        "deploy_jumphost": {
            "type": "boolean",
            "title": "Deploy Windows jumphost",
            "required": true
        },
        "region_name": {
            "type": "string",
            "title": "Region",
            "required": true
        },
        "namespace_class": {
            "type": "string",
            "title": "Namespace class",
            "required": true
        },
        "seg_name": {
            "type": "string",
            "title": "Supervisor selector",
            "required": true
        },
        "zone_name": {
            "type": "string",
            "title": "Zone",
            "required": true
        },
        "storage_policy": {
            "type": "string",
            "title": "Storage policy",
            "required": true
        },
        "storage_limit_gib": {
            "type": "number",
            "title": "Namespace storage quota (GiB)",
            "required": true
        },
        "cpu_limit": {
            "type": "string",
            "title": "Namespace CPU limit",
            "required": true
        },
        "memory_limit_gib": {
            "type": "number",
            "title": "Namespace memory limit (GiB)",
            "required": true
        },
        "dns_prefix": {
            "type": "string",
            "title": "Hostname prefix",
            "required": true
        },
        "domain_name": {
            "type": "string",
            "title": "DNS domain",
            "required": true
        },
        "lab_cidr": {
            "type": "string",
            "title": "Lab private network (/16)",
            "required": true,
            "description": "This first modular contract uses /24 networks inside one private /16. Host IPs follow this prefix."
        },
        "vlan_base": {
            "type": "number",
            "title": "First VLAN (management)",
            "required": true
        },
        "dns_forwarder": {
            "type": "string",
            "title": "Upstream DNS server",
            "required": true
        },
        "ntp_server": {
            "type": "string",
            "title": "Upstream NTP server",
            "required": true
        },
        "fabric_mtu": {
            "type": "number",
            "title": "Nested network MTU",
            "required": true,
            "description": "Keeps your tested default. A higher value requires an outer network that carries it."
        },
        "vyos_image": {
            "type": "string",
            "title": "VyOS VM image",
            "required": true
        },
        "vyos_class": {
            "type": "string",
            "title": "VyOS VM class",
            "required": true
        },
        "esx_image": {
            "type": "string",
            "title": "ESXi VM image",
            "required": true
        },
        "esx_class": {
            "type": "string",
            "title": "ESXi VM class",
            "required": true
        },
        "esx_count": {
            "type": "number",
            "title": "Number of ESXi hosts",
            "required": true
        },
        "esx_first_host": {
            "type": "number",
            "title": "First management host number",
            "required": true,
            "description": "Hosts are allocated sequentially in management /24. Validation rejects collisions with appliances and pools."
        },
        "esx_vsan_disk_enabled": {
            "type": "boolean",
            "title": "Add one vSAN NVMe disk per host",
            "required": true
        },
        "esx_vsan_disk_size_gib": {
            "type": "number",
            "title": "vSAN disk size per host (GiB)",
            "required": true
        },
        "vsan_allow_hcl_incompatible_disks": {
            "type": "boolean",
            "title": "Allow auto claim of HCL incompatible disks",
            "required": true
        },
        "installer_image": {
            "type": "string",
            "title": "Installer VM image",
            "required": true
        },
        "installer_class": {
            "type": "string",
            "title": "Installer VM class",
            "required": true
        },
        "installer_host": {
            "type": "number",
            "title": "Installer management host number",
            "required": true
        },
        "install_automation": {
            "type": "boolean",
            "title": "Include VCF Automation in the specification",
            "required": true
        },
        "run_vcf_installation": {
            "type": "boolean",
            "title": "Run VCF bring-up through the existing custom resource",
            "required": true,
            "description": "Enable after testing guest readiness. Uses your existing VCF and installer-certificate workflows."
        },
        "depot_url": {
            "type": "string",
            "title": "VCF depot URL",
            "required": false,
            "description": "Required when Run VCF bring-up is selected; the Installer must reach this URL."
        },
        "jumphost_image": {
            "type": "string",
            "title": "Windows VM image",
            "required": true
        },
        "jumphost_class": {
            "type": "string",
            "title": "Windows VM class",
            "required": true
        },
        "jumphost_host": {
            "type": "number",
            "title": "Jumphost uplink host number",
            "required": true
        },
        "resume_deployments": {
            "type": "string",
            "title": "Existing deployment IDs (JSON)",
            "required": false,
            "description": "Leave empty for a new lab. To resume, paste deploymentIds from the earlier workflow run and use the same lab inputs."
        }
    },
    "output": {
        "deploymentIds": {
            "type": "string"
        },
        "labPlanJson": {
            "type": "string"
        },
        "vcfDeploymentJson": {
            "type": "string"
        },
        "foundationInfo": {
            "type": "string"
        },
        "summary": {
            "type": "string"
        }
    },
    "attributes": {
        "planJson": { "type": "string" },
        "specJson": { "type": "string" },
        "idsJson": { "type": "string" },
        "foundationJson": { "type": "string" },
        "runStateJson": {
            "type": "string"
        },
        "stageComplete": {
            "type": "boolean",
            "value": false
        },
        "deadline": {
            "type": "Date"
        },
        "nextPoll": {
            "type": "Date"
        },
        "errorMessage": {
            "type": "string"
        }
    }
})
export class DeployModularLab {
    @RootItem({ target: "submitStage" })
    public prepare(
        profile_name: string,
        lab_name: string,
        lab_password: string,
        vyos_rest_api_key: string,
        deploy_esxi: boolean,
        deploy_installer: boolean,
        deploy_jumphost: boolean,
        region_name: string,
        namespace_class: string,
        seg_name: string,
        zone_name: string,
        storage_policy: string,
        storage_limit_gib: number,
        cpu_limit: string,
        memory_limit_gib: number,
        dns_prefix: string,
        domain_name: string,
        lab_cidr: string,
        vlan_base: number,
        dns_forwarder: string,
        ntp_server: string,
        fabric_mtu: number,
        vyos_image: string,
        vyos_class: string,
        esx_image: string,
        esx_class: string,
        esx_count: number,
        esx_first_host: number,
        esx_vsan_disk_enabled: boolean,
        esx_vsan_disk_size_gib: number,
        vsan_allow_hcl_incompatible_disks: boolean,
        installer_image: string,
        installer_class: string,
        installer_host: number,
        install_automation: boolean,
        run_vcf_installation: boolean,
        depot_url: string,
        jumphost_image: string,
        jumphost_class: string,
        jumphost_host: number,
        resume_deployments: string,
        @Out labPlanJson: string, @Out vcfDeploymentJson: string,
        @Out runStateJson: string, @Out deploymentIds: string,
        @Out planJson: string, @Out specJson: string, @Out idsJson: string
    ): void {
        var supplied: any = { profile_name: profile_name, lab_name: lab_name, lab_password: lab_password, vyos_rest_api_key: vyos_rest_api_key, deploy_esxi: deploy_esxi, deploy_installer: deploy_installer, deploy_jumphost: deploy_jumphost, region_name: region_name, namespace_class: namespace_class, seg_name: seg_name, zone_name: zone_name, storage_policy: storage_policy, storage_limit_gib: storage_limit_gib, cpu_limit: cpu_limit, memory_limit_gib: memory_limit_gib, dns_prefix: dns_prefix, domain_name: domain_name, lab_cidr: lab_cidr, vlan_base: vlan_base, dns_forwarder: dns_forwarder, ntp_server: ntp_server, fabric_mtu: fabric_mtu, vyos_image: vyos_image, vyos_class: vyos_class, esx_image: esx_image, esx_class: esx_class, esx_count: esx_count, esx_first_host: esx_first_host, esx_vsan_disk_enabled: esx_vsan_disk_enabled, esx_vsan_disk_size_gib: esx_vsan_disk_size_gib, vsan_allow_hcl_incompatible_disks: vsan_allow_hcl_incompatible_disks, installer_image: installer_image, installer_class: installer_class, installer_host: installer_host, install_automation: install_automation, run_vcf_installation: run_vcf_installation, depot_url: depot_url, jumphost_image: jumphost_image, jumphost_class: jumphost_class, jumphost_host: jumphost_host, resume_deployments: resume_deployments };
        var options = LabDefaults.values();
        Object.keys(supplied).forEach(function (key) {
            if (supplied[key] !== null && supplied[key] !== undefined) { options[key] = supplied[key]; }
        });
        var lab = LabPlan.create(options);
        var state = ModularRun.start(options);
        var settings = CatalogProfile.read(profile_name);
        var client = CatalogProfile.client(settings);
        client.verifyItems(settings, state.stages);
        // Validate every supplied ID before placing any new order.
        Object.keys(state.ids).forEach(function (stage) {
            CatalogClient.checkOwnership(client.deployment(state.ids[stage]), settings, stage, lab);
        });
        labPlanJson = JSON.stringify(lab);
        vcfDeploymentJson = JSON.stringify(VcfSpec.build(lab, lab_password), null, 2);
        deploymentIds = JSON.stringify(state.ids);
        planJson = labPlanJson;
        specJson = vcfDeploymentJson;
        idsJson = deploymentIds;
        runStateJson = JSON.stringify(state);
        System.log("Validated modular lab " + lab.lab_name + ": " + state.stages.join(" -> "));
    }

    @Item({ target: "checkStage" })
    public submitStage(
        profile_name: string, lab_password: string, vyos_rest_api_key: string,
        @In planJson: string, @In specJson: string,
        @In @Out runStateJson: string, @Out deploymentIds: string,
        @Out idsJson: string, @Out deadline: Date
    ): void {
        var state = JSON.parse(runStateJson); var lab = JSON.parse(planJson);
        var stage = state.stages[state.index];
        var settings = CatalogProfile.read(profile_name);
        var client = CatalogProfile.client(settings);
        if (!state.ids[stage]) {
            state.ids[stage] = client.request(settings, stage, lab.lab_name + "-" + stage,
                ModularRun.inputs(state, lab, lab_password, vyos_rest_api_key, specJson));
        }
        deploymentIds = JSON.stringify(state.ids);
        idsJson = deploymentIds;
        runStateJson = JSON.stringify(state);
        deadline = new Date(new Date().getTime() + settings.timeoutMinutes * 60000);
        System.log("Tracking " + stage + " deployment " + state.ids[stage]);
    }

    @Item({ target: "isStageComplete" })
    public checkStage(profile_name: string, @In planJson: string, @In deadline: Date,
        @In @Out runStateJson: string, @Out stageComplete: boolean,
        @Out foundationInfo: string, @Out foundationJson: string): void {
        var state = JSON.parse(runStateJson); var settings = CatalogProfile.read(profile_name);
        var deployment = CatalogProfile.client(settings).deployment(state.ids[state.stages[state.index]]);
        stageComplete = ModularRun.poll(state, deployment, JSON.parse(planJson), settings, new Date().getTime(), deadline.getTime());
        foundationInfo = JSON.stringify(state.foundation);
        foundationJson = foundationInfo;
        runStateJson = JSON.stringify(state);
    }

    @DecisionItem({ target: "advanceStage", else: "schedulePoll" })
    public isStageComplete(@In stageComplete: boolean): boolean { return stageComplete; }

    @Item({ target: "waitForDeployment" })
    public schedulePoll(profile_name: string, @Out nextPoll: Date): void {
        nextPoll = new Date(new Date().getTime() + CatalogProfile.read(profile_name).pollSeconds * 1000);
    }

    @WaitingTimerItem({ target: "checkStage" })
    public waitForDeployment(@In nextPoll: Date): void { /* Persisted vRO timer; no blocking sleep. */ }

    @Item({ target: "hasMoreStages" })
    public advanceStage(@In @Out runStateJson: string): void {
        var state = JSON.parse(runStateJson); state.index++; runStateJson = JSON.stringify(state);
    }

    @DecisionItem({ target: "submitStage", else: "finish" })
    public hasMoreStages(@In runStateJson: string): boolean {
        var state = JSON.parse(runStateJson); return state.index < state.stages.length;
    }

    @Item({ target: "end" })
    public finish(@In planJson: string, @In idsJson: string, @In foundationJson: string, @Out summary: string): void {
        var lab = JSON.parse(planJson); var foundation = JSON.parse(foundationJson);
        summary = "Lab " + lab.lab_name + " provisioned. Namespace: " + foundation.namespace_name +
            ". External address: " + foundation.external_ip + ". Deployment IDs: " + idsJson +
            ". Guest bootstrap and VCF readiness must be checked in the guests.";
        System.log(summary);
    }

    @DefaultErrorHandler({ target: "reportFailure", exceptionBinding: "errorMessage" })
    public defaultError(@Err errorMessage: string): void { /* Canvas binding only. */ }

    @Item({ target: "failedEnd" })
    public reportFailure(@In idsJson: string, @In errorMessage: string, @Out summary: string): void {
        summary = errorMessage + ". Existing deployments retained: " + (idsJson || "{}");
        System.error("Modular lab stopped. Existing deployments are retained. Deployment IDs: " + (idsJson || "{}"));
    }

    @WorkflowEndItem({ endMode: 1 })
    public failedEnd(@Err errorMessage: string): void { /* End the token as failed. */ }
}
