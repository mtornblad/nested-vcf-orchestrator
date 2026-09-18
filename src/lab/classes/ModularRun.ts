import { CatalogClient } from "./CatalogClient";

/** Serializable state. No bearer tokens or guest passwords are kept here. */
export class ModularRun {
    public static start(options: any): any {
        var stages = ["foundation"];
        if (options.deploy_esxi) { stages.push("esxi"); }
        if (options.deploy_installer) { stages.push("installer"); }
        if (options.deploy_jumphost) { stages.push("jumphost"); }
        var ids: any = {};
        if (options.resume_deployments && options.resume_deployments.trim()) {
            try { ids = JSON.parse(options.resume_deployments); }
            catch (_) { throw new Error("Existing deployment IDs must be a JSON object."); }
            if (!ids || Array.isArray(ids) || typeof ids !== "object") { throw new Error("Existing deployment IDs must be an object."); }
            Object.keys(ids).forEach(function (key) {
                if (stages.indexOf(key) < 0 || typeof ids[key] !== "string" || !ids[key]) { throw new Error("Invalid resume deployment entry: " + key); }
            });
            if (Object.keys(ids).length && !ids.foundation) { throw new Error("Resume must include the original foundation deployment ID."); }
        }
        return { stages: stages, index: 0, ids: ids, foundation: null, runVcf: options.run_vcf_installation, depotUrl: options.depot_url || "" };
    }

    public static inputs(state: any, lab: any, password: string, apiKey: string, specJson: string): any {
        var stage = state.stages[state.index];
        var inputs: any = { lab: lab, lab_password: password };
        if (stage === "foundation") { inputs.vyos_rest_api_key = apiKey; }
        else {
            if (!state.foundation || !state.foundation.namespace_name) { throw new Error("Foundation outputs are required before ordering " + stage + "."); }
            inputs.namespace_name = state.foundation.namespace_name;
        }
        if (stage === "installer") {
            inputs.external_ip = state.foundation.external_ip;
            inputs.vcf_spec_json = specJson;
            inputs.run_vcf_installation = state.runVcf;
            inputs.depot_url = state.depotUrl;
        }
        return inputs;
    }

    public static poll(state: any, deployment: any, lab: any, settings: any, now: number, deadline: number): boolean {
        if (now >= deadline) { throw new Error("Deployment wait expired. VCFA may still be working; resume using deploymentIds after inspection."); }
        if (!deployment) { return false; }
        var stage = state.stages[state.index];
        CatalogClient.checkOwnership(deployment, settings, stage, lab);
        if (!CatalogClient.complete(deployment)) { return false; }
        if (stage === "foundation") { state.foundation = CatalogClient.foundation(deployment, lab); }
        return true;
    }
}
