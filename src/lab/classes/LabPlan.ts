import { LabDefaults } from "./LabDefaults";

/** The public, versioned contract shared by all four catalog requests. */
export class LabPlan {
    public static create(values: any): any {
        var o = LabDefaults.values();
        Object.keys(values).forEach(function (key) {
            if (values[key] !== undefined && values[key] !== null) { o[key] = values[key]; }
        });
        function label(value: string, name: string, max: number): string {
            if (typeof value !== "string" || value.length > max || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value)) {
                throw new Error(name + " must be a lowercase DNS label, at most " + max + " characters.");
            }
            return value;
        }
        label(o.lab_name, "Lab name", 28);
        if (!/^[a-z0-9-]*$/.test(o.dns_prefix) || o.dns_prefix.length > 30) {
            throw new Error("Invalid hostname prefix.");
        }
        if (typeof o.domain_name !== "string" || o.domain_name.length > 190 || o.domain_name.split(".").length < 2) {
            throw new Error("Supply a DNS domain with at least two labels.");
        }
        o.domain_name.split(".").forEach(function (part) { label(part, "DNS domain label", 63); });
        ["vyos01", "vcf-installer", "jump01", "sddcm01"].forEach(function (suffix) {
            label(o.dns_prefix + suffix, "Generated hostname", 63);
        });
        function integer(key: string, minimum: number, maximum: number): void {
            var value = o[key];
            if (typeof value !== "number" || value % 1 !== 0 || value < minimum || value > maximum) {
                throw new Error(key + " must be an integer between " + minimum + " and " + maximum + ".");
            }
        }
        integer("esx_count", 1, 64);
        integer("esx_first_host", 2, 254);
        integer("installer_host", 2, 254);
        integer("jumphost_host", 3, 254);
        integer("fabric_mtu", 1600, 9000);
        integer("vlan_base", 1, 4090);
        integer("esx_vsan_disk_size_gib", 1, 65536);
        integer("storage_limit_gib", 1, 1048576);
        integer("memory_limit_gib", 1, 1048576);
        ["deploy_esxi", "deploy_installer", "deploy_jumphost", "esx_vsan_disk_enabled",
            "vsan_allow_hcl_incompatible_disks", "install_automation", "run_vcf_installation"].forEach(function (key) {
            if (typeof o[key] !== "boolean") { throw new Error(key + " must be a boolean."); }
        });
        if (typeof o.lab_password !== "string" || o.lab_password.length < 15) {
            throw new Error("The shared lab password must contain at least 15 characters.");
        }
        if (typeof o.vyos_rest_api_key !== "string" || o.vyos_rest_api_key.length < 12) {
            throw new Error("The VyOS REST API key must contain at least 12 characters.");
        }
        function address(value: string): boolean {
            return typeof value === "string" && /^(\d{1,3}\.){3}\d{1,3}$/.test(value) &&
                value.split(".").every(function (part) { return Number(part) <= 255 && String(Number(part)) === part; });
        }
        if (!address(o.dns_forwarder)) { throw new Error("Upstream DNS must be an IPv4 address."); }
        if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(o.ntp_server)) { throw new Error("Invalid upstream NTP server."); }
        if (typeof o.lab_cidr !== "string" || !/^\d{1,3}\.\d{1,3}\.0\.0\/16$/.test(o.lab_cidr) ||
                !address(o.lab_cidr.split("/")[0])) {
            throw new Error("This contract requires a canonical private /16, for example 172.16.0.0/16.");
        }
        var octets = o.lab_cidr.split(".");
        var first = Number(octets[0]); var second = Number(octets[1]);
        if (!(first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168))) {
            throw new Error("The lab /16 must be an RFC 1918 private network.");
        }
        if (o.lab_cidr === "172.31.0.0/16") { throw new Error("172.31.0.0/16 is reserved for the nested transit gateway pool."); }
        var prefix = first + "." + second;
        var management = prefix + ".1.";
        var uplink = prefix + ".0.";
        if (o.dns_forwarder === uplink + "2" || o.dns_forwarder.split(".")[0] === "127") {
            throw new Error("The upstream DNS server must not point back to the VyOS resolver.");
        }
        function reserved(host: number): boolean {
            return host >= 110 && host <= 212 || o.install_automation && host >= 20 && host <= 99;
        }
        if (reserved(o.installer_host)) { throw new Error("Installer address overlaps a VCF appliance or address pool."); }
        var servers: any[] = [];
        for (var index = 0; index < o.esx_count; index++) {
            var host = o.esx_first_host + index;
            if (host > 254 || reserved(host) || host === o.installer_host) {
                throw new Error("ESXi address " + management + host + " overlaps the Installer, a VCF pool, or the subnet boundary.");
            }
            servers.push({ name: o.dns_prefix + "esx" + (index + 1 < 10 ? "0" : "") + (index + 1), ip: management + host });
        }
        if (o.run_vcf_installation && (!o.deploy_esxi || !o.deploy_installer || !o.esx_vsan_disk_enabled)) {
            throw new Error("VCF bring-up requires ESXi, Installer, and the vSAN capacity disks in this variant.");
        }
        if (o.run_vcf_installation && !/^https?:\/\/[^\s]+$/.test(o.depot_url)) { throw new Error("A reachable depot URL is required for VCF bring-up."); }
        ["region_name", "namespace_class", "seg_name", "zone_name", "storage_policy", "vyos_image", "vyos_class"].forEach(function (key) {
            label(o[key], key, 253);
        });
        ["esx", "installer", "jumphost"].forEach(function (role) {
            if (o[role === "esx" ? "deploy_esxi" : "deploy_" + role]) {
                label(o[role + "_image"], role + " image", 253);
                label(o[role + "_class"], role + " class", 253);
            }
        });
        if (!/^\d+(?:\.\d+)?(?:m|k|M|G|T)?$/.test(o.cpu_limit)) { throw new Error("Invalid namespace CPU quantity."); }
        function fqdn(suffix: string): string { return o.dns_prefix + suffix + "." + o.domain_name; }
        var layout: any = {};
        ["mgmt", "vmotion", "vsan", "tep", "vpc", "trunk", "uplink"].forEach(function (name, i) {
            var network = i < 5 ? i + 1 : name === "trunk" ? 100 : 0;
            layout[name] = {
                name: i < 5 ? "vlan" + (o.vlan_base + i) : name,
                ipaddresses: prefix + "." + network + ".0/24",
                defaultgw: prefix + "." + network + ".1",
                description: name, access_mode: "Private",
                connectivity_state: name === "uplink" ? "Connected" : "Disconnected"
            };
            if (i < 5) { layout[name].vlanid = o.vlan_base + i; }
        });
        layout.trunk.mtu = o.fabric_mtu;
        layout.vmotion.ip_pool = { start: prefix + ".2.2", end: prefix + ".2.100" };
        layout.vsan.ip_pool = { start: prefix + ".3.2", end: prefix + ".3.100" };
        layout.tep.ip_pool = { name: "mgmt-cl01-tep01", description: "ESXi Host Overlay TEP IP Pool", start: prefix + ".4.10", end: prefix + ".4.100" };
        var automationPool: string[] = [];
        for (var n = 20; n <= 99; n++) { automationPool.push(management + n); }
        return {
            schema: "nested-vcf.modular/v1", lab_name: o.lab_name, dns_prefix: o.dns_prefix, domain_name: o.domain_name,
            namespace_settings: {
                generate_name: o.lab_name + "-ns", region_name: o.region_name, class_name: o.namespace_class,
                seg_name: o.seg_name, storage: { policy: o.storage_policy, limit: o.storage_limit_gib + "Gi" },
                zone: { name: o.zone_name, cpu_limit: o.cpu_limit, cpu_reservation: "0", memory_limit: o.memory_limit_gib + "Gi", memory_reservation: "0" }
            },
            vpc_settings: {
                network: o.lab_cidr, generate_name: o.lab_name + "-vpc", attachment_generate_name: o.lab_name + "-attachment",
                nat_rule_name_jump: o.lab_name + "-rdp", nat_rule_name_installer: o.lab_name + "-https",
                nat_rule_name_vyos: o.lab_name + "-ssh", ip_alloc_name: o.lab_name + "-external-ip"
            },
            vyos_settings: {
                vm_image: o.vyos_image, vm_class: o.vyos_class, hostname: o.dns_prefix + "vyos01", fqdn: fqdn("vyos01"),
                mgmt_ip: uplink + "2", mgmt_mask: "24", mgmt_gw: uplink + "1", management_network: "uplink", trunk_network: "trunk",
                enable_ssh: "true", enable_rest: "true",
                dns: { local_resolver: "127.0.0.1", forwarder: o.dns_forwarder, allow_from: o.lab_cidr,
                    additional_a_records: [{ zone: "dclab.se", name: "vis-appliance", address: "10.114.10.9" }] },
                ntp: { upstream_server: o.ntp_server, allow_from: o.lab_cidr }
            },
            esx_settings: { vm_image: o.esx_image, vm_class: o.esx_class, servers: servers,
                vsan_disk: { enabled: o.esx_vsan_disk_enabled, size: o.esx_vsan_disk_size_gib + "Gi", storage_class: o.storage_policy, claim_suffix: "vsan-capacity" } },
            installer_settings: { vm_image: o.installer_image, vm_class: o.installer_class, ip: management + o.installer_host, hostname: o.dns_prefix + "vcf-installer", fqdn: fqdn("vcf-installer") },
            jumphost_settings: { vm_image: o.jumphost_image, vm_class: o.jumphost_class, ip: uplink + o.jumphost_host, hostname: o.dns_prefix + "jump01" },
            vcf_settings: {
                install_automation: o.install_automation, vsan: { allow_hcl_incompatible_disks: o.vsan_allow_hcl_incompatible_disks },
                vsp: { ip_pool: { start: management + "110", end: management + "199" }, internal_cluster_cidr: "240.0.0.0/15" },
                nsx: {}, operations: {}, operations_collector: {}, vcenter: {},
                sddc_manager: { hostname: o.dns_prefix + "sddcm01", fqdn: fqdn("sddcm01"), ip: management + "207" },
                automation: { internal_cluster_cidr: "198.18.0.0/15", ip_pool: automationPool }
            }, netlayout: layout
        };
    }
}
