import { CatalogClient } from "./CatalogClient";

/** Runtime endpoint configuration is stored in vRO, never in the package. */
export class CatalogProfile {
    public static path(): string { return "Nested VCF Lab/Modular"; }

    public static validate(settings: any): void {
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(settings.profileName || "")) { throw new Error("Invalid catalog profile name."); }
        if (typeof settings.projectId !== "string" || !settings.projectId.trim()) { throw new Error("Project ID is required."); }
        ["timeoutMinutes", "pollSeconds"].forEach(function (key) {
            var v = settings[key]; var max = key === "timeoutMinutes" ? 1440 : 300;
            if (typeof v !== "number" || v % 1 !== 0 || v < 5 || v > max) { throw new Error("Invalid " + key + "."); }
        });
    }

    public static read(profileName: string): any {
        var category = Server.getConfigurationElementCategoryWithPath(CatalogProfile.path());
        var matches = category ? category.configurationElements.filter(function (entry) { return entry.name === profileName; }) : [];
        if (matches.length !== 1) { throw new Error("Run Configure Modular Catalog to create profile " + profileName + "."); }
        matches[0].reload();
        var attribute = matches[0].getAttributeWithKey("settings");
        if (!attribute) { throw new Error("Catalog profile is missing settings."); }
        var settings = JSON.parse(attribute.value);
        CatalogProfile.validate(settings);
        return settings;
    }

    public static save(settings: any): void {
        CatalogProfile.validate(settings);
        var category = Server.getConfigurationElementCategoryWithPath(CatalogProfile.path());
        var entries = category ? category.configurationElements.filter(function (entry) { return entry.name === settings.profileName; }) : [];
        if (entries.length > 1) { throw new Error("Duplicate catalog profiles; resolve in vRO before saving."); }
        var element = entries.length ? entries[0] : Server.createConfigurationElement(CatalogProfile.path(), settings.profileName);
        element.description = "Runtime catalog IDs and VCFA connection for nested-vcf.modular/v1.";
        element.setAttributeWithKey("settings", JSON.stringify(settings), "string");
    }

    public static client(settings: any): CatalogClient {
        var host = settings.connectionSid ? VCFAHostManager.getHostBySid(settings.connectionSid) : VCFAHostManager.defaultHostData;
        if (!host) { throw new Error("No VCFA plugin connection found. Configure a shared-session All Apps connection in vRO."); }
        var client = host.createRestClient();
        return new CatalogClient(function (method: string, path: string, body?: any): any {
            var request = client.createRequest(method, path, body === undefined ? "" : JSON.stringify(body));
            request.setHeader("Content-Type", "application/json");
            request.setHeader("Accept", "application/json");
            var response: VCFARestResponse;
            try { response = client.execute(request); }
            catch (_) { throw new Error("VCFA " + method + " request failed. For POST, inspect VCFA before resubmitting."); }
            if (method === "GET" && path.indexOf("/deployment/api/deployments/names?") === 0 &&
                    (response.statusCode === 200 || response.statusCode === 404)) { return response.statusCode === 200; }
            // A newly accepted deployment can be briefly absent from the read API.
            if (method === "GET" && path.indexOf("/deployment/api/deployments/") === 0 && response.statusCode === 404) { return null; }
            if (response.statusCode < 200 || response.statusCode >= 300) {
                throw new Error("VCFA " + method + " returned HTTP " + response.statusCode + ". Check connection, project access and catalog publication.");
            }
            try { return JSON.parse(response.contentAsString); }
            catch (_) { throw new Error("VCFA returned an invalid JSON response. For POST, inspect VCFA before resubmitting."); }
        });
    }
}
