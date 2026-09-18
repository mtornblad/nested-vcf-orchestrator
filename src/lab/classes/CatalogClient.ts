/** VCFA All Apps catalog API. The transport is injected for offline tests. */
export class CatalogClient {
    constructor(private transport: (method: string, path: string, body?: any) => any) {}

    public static names(): any {
        return { foundation: "Nested VCF Modular - Foundation", esxi: "Nested VCF Modular - ESXi",
            installer: "Nested VCF Modular - Installer", jumphost: "Nested VCF Modular - Jumphost" };
    }

    public verifyItems(settings: any, stages: string[]): void {
        var self = this;
        stages.forEach(function (stage) {
            var id = settings.catalogIds[stage];
            if (typeof id !== "string" || !id.trim()) { throw new Error("Missing catalog ID for " + stage + "."); }
            var item = self.transport("GET", "/catalog/api/items/" + encodeURIComponent(id));
            if (!item || item.name !== CatalogClient.names()[stage]) {
                throw new Error("The configured catalog ID for " + stage + " does not identify the modular blueprint.");
            }
        });
    }

    public request(settings: any, stage: string, deploymentName: string, inputs: any): string {
        if (this.transport("GET", "/deployment/api/deployments/names?name=" + encodeURIComponent(deploymentName))) {
            throw new Error("Deployment name already exists. Resume with its ID or choose another lab name.");
        }
        var body: any = { deploymentName: deploymentName, projectId: settings.projectId, bulkRequestCount: 1,
            reason: "Nested VCF modular/v1: " + stage, inputs: inputs };
        if (settings.catalogVersion) { body.version = settings.catalogVersion; }
        // One submission only. A timeout can occur after VCFA accepts the order;
        // callers must inspect VCFA and resume with its deployment ID, not retry POST.
        var response = this.transport("POST", "/catalog/api/items/" + encodeURIComponent(settings.catalogIds[stage]) + "/request", body);
        if (!Array.isArray(response) || response.length !== 1 || !response[0].deploymentId) {
            throw new Error("Catalog request did not return one deployment ID. Inspect VCFA before resubmitting.");
        }
        return response[0].deploymentId;
    }

    public deployment(id: string): any {
        if (typeof id !== "string" || !id) { throw new Error("Missing deployment ID."); }
        return this.transport("GET", "/deployment/api/deployments/" + encodeURIComponent(id));
    }

    public static canonical(value: any): string {
        function sort(item: any): any {
            if (Array.isArray(item)) { return item.map(sort); }
            if (item && typeof item === "object") {
                var result: any = {};
                Object.keys(item).sort().forEach(function (key) { result[key] = sort(item[key]); });
                return result;
            }
            return item;
        }
        return JSON.stringify(sort(value));
    }

    public static checkOwnership(deployment: any, settings: any, stage: string, lab: any): void {
        if (!deployment || deployment.deleted || deployment.projectId !== settings.projectId ||
                deployment.catalogItemId !== settings.catalogIds[stage]) {
            throw new Error("Deployment does not belong to the configured project and modular " + stage + " item.");
        }
        if (!deployment.inputs || CatalogClient.canonical(deployment.inputs.lab) !== CatalogClient.canonical(lab)) {
            throw new Error("Deployment lab inputs differ. Resume with the original plan; do not mix labs.");
        }
    }

    public static complete(deployment: any): boolean {
        var requestStatus = deployment.lastRequest && deployment.lastRequest.status;
        if (["FAILED", "ABORTED", "APPROVAL_REJECTED"].indexOf(requestStatus) >= 0 ||
                /FAILED|DELETE/.test(deployment.status || "")) {
            throw new Error("Deployment " + deployment.id + " failed or was deleted. Inspect its request in VCFA.");
        }
        return deployment.status === "CREATE_SUCCESSFUL";
    }

    public static output(deployment: any, key: string): any {
        var value = deployment.outputs && deployment.outputs[key];
        return value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "value") ? value.value : value;
    }

    public static foundation(deployment: any, lab: any): any {
        if (CatalogClient.output(deployment, "contract_version") !== lab.schema ||
                CatalogClient.output(deployment, "lab_name") !== lab.lab_name) {
            throw new Error("Foundation outputs do not match the modular contract and lab name.");
        }
        var name = CatalogClient.output(deployment, "namespace_name");
        var address = CatalogClient.output(deployment, "external_ip");
        if (typeof name !== "string" || !name || typeof address !== "string" || !address) {
            throw new Error("Foundation did not return namespace_name and external_ip.");
        }
        return { namespace_name: name, external_ip: address, vpc_name: CatalogClient.output(deployment, "vpc_name") };
    }
}
