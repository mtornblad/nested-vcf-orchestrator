/** VCF 9.1.1 specification shape migrated from Full Stack VCF b6bca4c.
 * Build an object first: JSON.stringify escapes passwords and variable-length lists.
 */
export class VcfSpec {
    public static build(lab: any, password: string): any {
        var spec: any = {
            "version": "9.1.1.0",
            "vcfInstanceName": "vcf",
            "sddcId": "mgmt",
            "workflowType": "VCF",
            "ceipEnabled": false,
            "skipEsxThumbprintValidation": true,
            "dnsSpec": {
                "subdomain": (lab.domain_name),
                "nameservers": [(lab.vyos_settings.mgmt_ip)]
            },
            "ntpServers": [(lab.vyos_settings.fqdn)],
            "hostSpecs": lab.esx_settings.servers.map(function (host: any) { return { hostname: host.name + "." + lab.domain_name, credentials: { username: "root", password: password } }; }),
            "networkSpecs": [{
                "networkType": "MANAGEMENT",
                "ipAddressVersion": "IPv4",
                "subnet": (lab.netlayout.mgmt.ipaddresses),
                "gateway": (lab.netlayout.mgmt.defaultgw),
                "vlanId": (lab.netlayout.mgmt.vlanid),
                "activeUplinks": ["uplink1", "uplink2"],
                "portGroupKey": "mgmt-cl01-vds01-pg-esx-mgmt",
                "standbyUplinks": [],
                "teamingPolicy": "loadbalance_loadbased"
            }, {
                "networkType": "VMOTION",
                "ipAddressVersion": "IPv4",
                "subnet": (lab.netlayout.vmotion.ipaddresses),
                "gateway": (lab.netlayout.vmotion.defaultgw),
                "vlanId": (lab.netlayout.vmotion.vlanid),
                "mtu": (lab.netlayout.trunk.mtu),
                "includeIpAddressRanges": [{
                    "startIpAddress": (lab.netlayout.vmotion.ip_pool.start),
                    "endIpAddress": (lab.netlayout.vmotion.ip_pool.end)
                }],
                "activeUplinks": ["uplink1", "uplink2"],
                "portGroupKey": "mgmt-cl01-vds01-pg-vmotion",
                "standbyUplinks": [],
                "teamingPolicy": "loadbalance_loadbased"
            }, {
                "networkType": "VSAN",
                "ipAddressVersion": "IPv4",
                "subnet": (lab.netlayout.vsan.ipaddresses),
                "gateway": (lab.netlayout.vsan.defaultgw),
                "vlanId": (lab.netlayout.vsan.vlanid),
                "mtu": (lab.netlayout.trunk.mtu),
                "includeIpAddressRanges": [{
                    "startIpAddress": (lab.netlayout.vsan.ip_pool.start),
                    "endIpAddress": (lab.netlayout.vsan.ip_pool.end)
                }],
                "activeUplinks": ["uplink1", "uplink2"],
                "portGroupKey": "mgmt-cl01-vds01-pg-vsan",
                "standbyUplinks": [],
                "teamingPolicy": "loadbalance_loadbased"
            }],
            "vspClusterSpec": {
                "ipv4Pool": {
                    "ipRange": {
                        "startIpAddress": (lab.vcf_settings.vsp.ip_pool.start),
                        "endIpAddress": (lab.vcf_settings.vsp.ip_pool.end)
                    }
                },
                "platformFqdn": (lab.dns_prefix) + "vsp01." + (lab.domain_name),
                "instanceFqdn": (lab.dns_prefix) + "shared01." + (lab.domain_name),
                "fleetFqdn": (lab.dns_prefix) + "fleetlcm." + (lab.domain_name),
                "systemUserPassword": (password),
                "size": "small",
                "name": "vmsp-01",
                "internalClusterCidrIpv4": (lab.vcf_settings.vsp.internal_cluster_cidr)
            },
            "nsxtSpec": {
                "vipFqdn": (lab.dns_prefix) + "nsx01." + (lab.domain_name),
                "transportVlanId": (lab.netlayout.tep.vlanid),
                "ipAddressPoolSpec": {
                    "name": (lab.netlayout.tep.ip_pool.name),
                    "description": (lab.netlayout.tep.ip_pool.description),
                    "subnets": [{
                        "cidr": (lab.netlayout.tep.ipaddresses),
                        "gateway": (lab.netlayout.tep.defaultgw),
                        "ipAddressPoolRanges": [{
                            "start": (lab.netlayout.tep.ip_pool.start),
                            "end": (lab.netlayout.tep.ip_pool.end)
                        }]
                    }]
                },
                "nsxtManagerSize": "medium",
                "nsxtAdminPassword": (password),
                "nsxtAuditPassword": (password),
                "rootNsxtManagerPassword": (password),
                "useExistingDeployment": false,
                "vpcSpec": {
                    "dtgwSpec": {
                        "vlan": (lab.netlayout.vpc.vlanid),
                        "gatewayCidr": (lab.netlayout.vpc.defaultgw) + "/24",
                        "externalIpBlockCidr": (lab.netlayout.vpc.ipaddresses),
                        "privateTgwIpBlockCidr": "172.31.0.0/16"
                    }
                },
                "nsxtManagers": [{
                    "hostname": (lab.dns_prefix) + "nsx02." + (lab.domain_name)
                }]
            },
            "vcfOperationsSpec": {
                "applianceSize": "small",
                "adminUserPassword": (password),
                "useExistingDeployment": false,
                "nodes": [{
                    "hostname": (lab.dns_prefix) + "ops01." + (lab.domain_name),
                    "rootUserPassword": (password),
                    "type": "master"
                }]
            },
            "vcfOperationsCollectorSpec": {
                "applianceSize": "small",
                "hostname": (lab.dns_prefix) + "collector." + (lab.domain_name),
                "rootUserPassword": (password),
                "useExistingDeployment": false
            },
            "licenseServerSpec": {
                "hostname": (lab.dns_prefix) + "license." + (lab.domain_name)
            },
            "vidbSpec": {
                "hostname": (lab.dns_prefix) + "vidb." + (lab.domain_name)
            },
            "saltSpec": {

            },
            "saltRaasSpec": {

            },
            "telemetryAcceptorSpec": {

            },
            "fleetLcmSpec": {
                "hostname": (lab.dns_prefix) + "fleetlcm." + (lab.domain_name)
            },
            "sddcLcmSpec": {
                "hostname": (lab.dns_prefix) + "shared01." + (lab.domain_name)
            },
            "fleetDepotSpec": {

            },
            "vcenterSpec": {
                "vcenterHostname": (lab.dns_prefix) + "vc01." + (lab.domain_name),
                "adminUserSsoPassword": (password),
                "rootVcenterPassword": (password),
                "vmSize": "small",
                "storageSize": "lstorage",
                "ssoDomain": "vsphere.local",
                "useExistingDeployment": false
            },
            "clusterSpec": {
                "datacenterName": "mgmt-dc01",
                "clusterName": "mgmt-cl01"
            },
            "datastoreSpec": {
                "vsanSpec": {
                    "vsanDedup": false,
                    "failuresToTolerate": 1,
                    "esaConfig": {
                        "enabled": true,
                        "skipHclAutoDiskClaim": (lab.vcf_settings.vsan.allow_hcl_incompatible_disks)
                    },
                    "datastoreName": "mgmt-cl01-ds-vsan01",
                    "encryptionConfig": {
                        "dataInTransitConfig": {
                            "enable": false
                        }
                    }
                }
            },
            "dvsSpecs": [{
                "dvsName": "mgmt-cl01-vds01",
                "networks": ["MANAGEMENT", "VMOTION", "VSAN"],
                "mtu": Math.min(9000, lab.netlayout.trunk.mtu + 100),
                "nsxtSwitchConfig": {
                    "transportZones": [{
                        "name": "overlay-tz-mgmt-nsxt",
                        "transportType": "OVERLAY"
                    }]
                },
                "vmnicsToUplinks": [{
                    "id": "vmnic0",
                    "uplink": "uplink1"
                }, {
                    "id": "vmnic1",
                    "uplink": "uplink2"
                }],
                "nsxTeamings": [{
                    "policy": "LOADBALANCE_SRCID",
                    "activeUplinks": ["uplink1", "uplink2"],
                    "standByUplinks": null
                }],
                "lagSpecs": null
            }],
            "sddcManagerSpec": {
                "hostname": (lab.vcf_settings.sddc_manager.fqdn),
                "localUserPassword": (password),
                "rootPassword": (password),
                "sshPassword": (password),
                "useExistingDeployment": false
            },
            "vcfAutomationSpec": {
                "ipPool": lab.vcf_settings.automation.ip_pool,
                "hostname": (lab.dns_prefix) + "auto-vip." + (lab.domain_name),
                "platformFqdn": (lab.dns_prefix) + "auto-platform." + (lab.domain_name),
                "adminUserPassword": (password),
                "nodePrefix": "mgmt-node-01",
                "internalClusterCidr": (lab.vcf_settings.automation.internal_cluster_cidr),
                "useExistingDeployment": false,
                "size": "small"
            }
        };
        if (!lab.vcf_settings.install_automation) { delete spec.vcfAutomationSpec; }
        return spec;
    }
}
