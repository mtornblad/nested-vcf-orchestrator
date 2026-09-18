# Imported VCF custom-resource workflows

The project includes the contents of the supplied `customresources.package`:
**14 workflows, 10 actions, 14 request forms and one certificate-interaction
form**. The export came from Orchestrator `9.1.0.0400.25532311`.

The editable source is under `native/src/main/resources`. Its workflow XML
contains the original canvas, bindings, presentations and JavaScript tasks;
the action XML contains the scripts and their parameter types. The stable
workflow/action IDs, `Advania` folders and `se.advania.*` action modules are
preserved. This lets the existing Automation custom resources use the same
workflow identities.

The source package fingerprint, element inventory, form paths and migration
changes are recorded in [import-manifest.json](../native/import-manifest.json).
The original server-signed archive, its signing certificate and its exported
test credentials are not part of the Git source.

## Included workflows

| Folder | Workflows |
| --- | --- |
| `Advania/Custom Resources/VCF` | Create VCF; Read VCF; Delete VCF |
| `Advania/Custom Resources/Certificate Trust` | Import vcf installer certificate; Delete vcf installer certificate |
| `Advania/Test` | Install VCF; Connect Depot; Download Bundles For Release; Download Bundle; Get Bundles LIst; Get Bundles Status; Deploy SDDC; Project Test; Test Service |

Names and capitalization, including `Get Bundles LIst` and
`getBundelDownloadStatus`, match the export because other objects may call
them by name. The main integration entry point is **Create VCF**, which calls
**Install VCF**. That workflow checks Installer readiness, connects the depot,
downloads selected bundles and submits the supplied SDDC specification.

| Action module | Actions |
| --- | --- |
| `se.advania.rest` | `createHost` |
| `se.advania.vcf.installer` | `getToken`, `vcfUiReady`, `connectDepot`, `getRelease`, `getBundlesFromRelease`, `downloadBundle`, `getBundelDownloadStatus`, `DeploySDDC` |
| `se.advania.test` | `getCaCertByAlias` |

## Custom-resource bindings

| Resource and operation | Workflow ID |
| --- | --- |
| `Custom.vcf` create | `649c1113-0448-4ca8-bdee-2e9791164e50` |
| `Custom.vcf` read | `a1017dcb-eb20-4a81-b716-95eb8b0af975` |
| `Custom.vcf` delete | `50e6d525-f5c4-41e7-bd1c-aa6f5ea82571` |
| `Custom.VCFInstallerCertificate` create | `f36276fe-ed13-4ea2-8cff-31c58c7460c8` |
| `Custom.VCFInstallerCertificate` delete | `4e1986d7-70cc-4133-bda9-7109e3f83cf3` |

The create action accepts `baseUrl`, `username`, `password`, `version`,
`excludeArray`, `depotUrl`, `includeArray` and **`sddcSpec`**. The last input
was missing from the Automation action descriptor even though it existed in
the workflow and resource schema. The companion automation change adds it
to both Full Stack and modular resource definitions. The workflow's existing
outputs are `vcf` and `sddcInstallStatus`; the custom resource currently maps
`vcf` as its resource identity.

Check the two repositories together before publishing:

```bash
# From components/vro-typescript in the umbrella checkout:
python3 scripts/validate_native.py --automation ../vcf-automation
```

This checks workflow IDs and exact input types, as well as the resource's
mapped outputs. It catches a missing `sddcSpec` mapping before deployment.

## Building and publishing

The Maven `prepare-package` phase copies the native source into the XML tree
that the TypeScript plugin packages. Maven resource filtering is **disabled**
for this copy so JavaScript and vRO expressions remain literal. The final
native `.package` contains both the existing TypeScript workflows/actions and
these imported objects; no separate manual archive import is required.

The package version is **3.0.2-SNAPSHOT**. Build Tools 4.25.0 stamps its package
version onto every packaged element. The imported certificate workflows were
already at `3.0.0`, so continuing with the scaffold's `0.1.0` package would
produce older element versions. Source XML and the inventory still retain
the original element versions for provenance.

From the component directory:

```bash
make validate
make test-native
make package
make push PROFILE=lab
```

`test-native` runs local Python checks and Node-based JavaScript syntax/auth
logging tests without Maven or a server. The existing `make test` also runs
the TypeScript/Jasmine Maven lifecycle. `package` and `push` include the native
tests. Use the existing Java 17, Maven 3.9+, Node 22 and Build Tools 4.25.0 setup.

From the umbrella root, publish vRO first, then the Automation metadata:

```bash
./orchestration/run_vro.py upload
./orchestration/run_automation.py upload
```

Use `--variant full-stack` if publishing that blueprint instead. The existing
private Maven profile and artifact collection apply; the combined package is
copied to `artifacts/vro/builds/` by the umbrella adapter.

## Migration changes

The workflow graphs and action APIs remain as exported, with these targeted
changes before committing source:

- **Get Bundles Status** now requests `baseUrl`, `username` and `password`
  alongside `bundleId`. The exported local URL and password attribute were
  removed. Its form requires the connection inputs.
- **Project Test** now requests `baseUrl`, the CCI project namespace and a
  `SecureString` access token. Its script uses these inputs instead of the
  embedded endpoint/project/token. It logs HTTP status and resource names.
- Raw API response-body logging was removed from the REST actions, including
  token acquisition and readiness checks. Status-code logging and existing
  return values remain.

Existing `SecureString` parameter types are preserved for compatibility with
the custom-resource interfaces. These changes do not alter the plaintext
disposable-lab input model of the modular request form or its generated VCF JSON.

## Runtime dependencies and retained limitations

The target needs the **HTTP-REST** plugin and the **Configurator** certificate
and keystore APIs. The package includes every custom action and workflow
called by these workflows, except this built-in dependency:

`8a70a326-ffd7-4fef-97e0-2002ac49f5bd` — certificate deletion, called by
**Delete vcf installer certificate**.

Confirm this workflow exists in the target Orchestrator library and that its
Configurator plugin supports the exported input types. Its implementation
was not included in the upload and is not recreated here. The native validator
records it explicitly as an external dependency.

This is a source integration of the supplied implementation. Its existing
runtime behavior includes limitations that still need a separate review:

- **Read VCF**, **Delete VCF** and **Test Service** are placeholder canvases.
  Read does not query deployment status; Delete does not tear down a VCF stack.
- Installer readiness and bundle download use the export's existing sleep/
  polling loops. They are separate from the modular catalog workflow's timer
  and stage timeout; stopping the outer wait does not cancel an executing child.
- `connectDepot` and `downloadBundle` retain their unconditional `true` return
  after an HTTP response. Importing the source does not add HTTP success checks.
- Bundle selection retains the first-version/first-bundle behavior in the
  export. `DeploySDDC` submits the specification; it does not poll bring-up to
  completion. `sddcInstallStatus` is the returned response, not proof that VCF
  installation finished.

Keep **Run VCF bring-up** off for the initial modular provisioning test, then
test the imported create path deliberately against the lab Installer. Review
its responses, bundles and VCF validation before treating it as a complete
installation lifecycle.

## Updating the source

Edit the XML/JavaScript and adjacent JSON forms here, preserving IDs and
parameter names used by callers. New TypeScript orchestration stays under
`src/lab`; there is no reverse conversion of workflow JavaScript into
TypeScript. To ingest a newer export, use the Build Tools `vropkg` flat-to-tree
converter in a temporary directory, remove environment credentials, compare
the diff and update the inventory before copying it into `native/`.

Native conversion follows the
[Build Tools XML content model](https://vmware.github.io/build-tools-for-vmware-aria/latest/usage/products/vro/xml/).
The combined staging path follows the
[4.25.0 TypeScript packager](https://github.com/vmware/build-tools-for-vmware-aria/blob/v4.25.0/maven/plugins/typescript/src/main/java/com/vmware/pscoe/maven/plugins/TypescriptPackageMojo.java).

Validation performed for this migration: native dependency/form checks,
cross-repository parameter checks, seven native regression tests, official
4.25.0 TypeScript compilation and a combined package built with official
`vropkg`. The resulting package was inspected for all imported IDs and forms,
script preservation and inclusion of the modular workflows. The local
compiler/packager check used Node 24 and a temporary signing certificate;
the full Maven lifecycle and live server import/execution still need testing
on the configured build host.

[Component README](../README.md) · [Modular deployment](modular-lab.md)
