import { Workflow, RootItem, Out } from "vrotsc-annotations";
import { CatalogProfile } from "../classes/CatalogProfile";

@Workflow({
    id: "83d0e868-a3c9-4457-b1b7-39d1df07e7f0",
    name: "Configure Modular Catalog", path: "Nested VCF Lab/Modular", version: "0.1.0",
    description: "Validate catalog mappings and save a runtime profile for Deploy Modular VCF Lab.",
    input: {
        profileName: { type: "string", title: "Catalog profile name", required: true },
        connectionSid: { type: "string", title: "VCFA connection SID (empty uses the default connection)" },
        projectId: { type: "string", title: "VCFA project ID", required: true },
        foundationId: { type: "string", title: "Foundation catalog item ID", required: true },
        esxiId: { type: "string", title: "ESXi catalog item ID", required: true },
        installerId: { type: "string", title: "Installer catalog item ID", required: true },
        jumphostId: { type: "string", title: "Jumphost catalog item ID", required: true },
        catalogVersion: { type: "string", title: "Catalog version (empty uses the published version)" },
        timeoutMinutes: { type: "number", title: "Timeout per deployment (minutes)", required: true },
        pollSeconds: { type: "number", title: "Poll interval (seconds)", required: true }
    },
    output: { configurationPath: { type: "string" } }
})
export class ConfigureModularCatalog {
    @RootItem({ target: "end" })
    public configure(profileName: string, connectionSid: string, projectId: string,
        foundationId: string, esxiId: string, installerId: string, jumphostId: string,
        catalogVersion: string, timeoutMinutes: number, pollSeconds: number,
        @Out configurationPath: string): void {
        var settings = { profileName: profileName, connectionSid: connectionSid || "", projectId: projectId,
            catalogIds: { foundation: foundationId, esxi: esxiId, installer: installerId, jumphost: jumphostId },
            catalogVersion: catalogVersion || "", timeoutMinutes: timeoutMinutes, pollSeconds: pollSeconds };
        CatalogProfile.validate(settings);
        CatalogProfile.client(settings).verifyItems(settings, ["foundation", "esxi", "installer", "jumphost"]);
        CatalogProfile.save(settings);
        configurationPath = CatalogProfile.path() + "/" + profileName;
        System.log("Saved modular catalog configuration: " + configurationPath);
    }
}
