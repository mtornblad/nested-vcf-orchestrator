import { LabNaming } from "../classes/LabNaming";

/**
 * @param hostname - Short hostname, without the domain.
 * @param domain - DNS domain for this lab deployment.
 * @returns Normalized, validated FQDN.
 */
(function (hostname: string, domain: string): string {
    return LabNaming.qualify(hostname, domain);
});
