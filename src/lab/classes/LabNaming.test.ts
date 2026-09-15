import { LabNaming } from "./LabNaming";

describe("LabNaming", () => {
    it("builds a normalized FQDN", () => {
        expect(LabNaming.qualify(" ESX01 ", " Lab.Example.Test. "))
            .toBe("esx01.lab.example.test");
    });

    it("rejects a FQDN in the short hostname field", () => {
        expect(() => LabNaming.qualify("esx01.example.test", "example.test"))
            .toThrowError(/one DNS label/);
    });

    it("rejects invalid labels and empty values", () => {
        expect(() => LabNaming.qualify("-esx01", "example.test")).toThrow();
        expect(() => LabNaming.qualify("", "example.test")).toThrow();
        expect(() => LabNaming.qualify("esx01", "example..test")).toThrow();
        expect(() => LabNaming.qualify("esx01", "test")).toThrow();
    });

    it("accepts a 63-character hostname and rejects a longer one", () => {
        const label = new Array(64).join("a");
        expect(LabNaming.qualify(label, "example.test")).toBe(label + ".example.test");
        expect(() => LabNaming.qualify(label + "a", "example.test")).toThrow();
    });

    it("rejects an overlong FQDN", () => {
        const label = new Array(64).join("a");
        expect(() => LabNaming.qualify(label, label + "." + label + "." + label))
            .toThrowError(/253/);
    });
});
