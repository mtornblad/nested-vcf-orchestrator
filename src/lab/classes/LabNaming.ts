/** Pure naming logic shared by actions and workflows. */
export class LabNaming {
    public static qualify(hostname: string, domain: string): string {
        const name = hostname.trim().toLowerCase();
        const zone = domain.trim().toLowerCase().replace(/\.$/, "");
        const label = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

        if (!label.test(name)) {
            throw new Error("hostname must be one DNS label of 1 to 63 characters");
        }
        const parts: string[] = zone.split(".");
        if (parts.length < 2) {
            throw new Error("domain must contain at least two DNS labels");
        }
        for (const part of parts) {
            if (!label.test(part)) {
                throw new Error("domain contains an invalid DNS label");
            }
        }
        const fqdn = name + "." + zone;
        if (fqdn.length > 253) {
            throw new Error("FQDN must not exceed 253 characters");
        }
        return fqdn;
    }
}
