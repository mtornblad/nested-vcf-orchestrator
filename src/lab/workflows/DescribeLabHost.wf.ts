import { Out, RootItem, Workflow } from "vrotsc-annotations";
import { LabNaming } from "../classes/LabNaming";

@Workflow({
    name: "Describe Lab Host",
    path: "Nested VCF Lab/Naming",
    id: "9d05f346-82b0-4e20-a3f6-83cda1ed7405",
    description: "Validate a lab hostname and return its FQDN without changing infrastructure.",
    input: {
        hostname: { type: "string", required: true, title: "Short hostname" },
        domain: { type: "string", required: true, title: "DNS domain" }
    },
    output: {
        fqdn: { type: "string" }
    }
})
export class DescribeLabHost {
    @RootItem({ target: "end" })
    public describe(hostname: string, domain: string, @Out fqdn: string): void {
        fqdn = LabNaming.qualify(hostname, domain);
        System.log("Lab host: " + fqdn);
    }
}
