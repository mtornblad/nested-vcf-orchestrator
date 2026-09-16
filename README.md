# Nested VCF Orchestrator

A standalone TypeScript project for VCF Operations Orchestrator/vRO actions and
workflows used by Nested VCF Lab. Its intended umbrella location is
`components/vro-typescript`, with its own repository and independent releases.
The CCI blueprint remains in `nested-vcf-automation`.

The [modular deployment guide](docs/modular-lab.md) describes **Deploy Modular
VCF Lab**, its seven-page request form, catalog configuration, and resume flow.
The original naming example remains under `src/lab`; the deployment implementation
is isolated under `src/modular`.

The [imported VCF custom-resource workflows](docs/custom-resources.md) are
included as editable native XML/JavaScript under `native/`. They are packaged
together with TypeScript, preserving the workflow IDs used by Automation.

## Toolchain and output

The Maven parent is `com.vmware.pscoe.o11n:typescript-project-all:4.25.0`, matching
the Build Tools version used by the blueprint component. Packaging is `package`.
The build produces a native Orchestrator `.package` under `target/`.

Use Java 17, Maven 3.9+, Python 3.11+, Make, **Node.js 22.13+ within major 22**,
and npm 10.9.2+. With nvm already installed, run `nvm install` and `nvm use` in
this directory. The `.nvmrc` selects Node 22. The Build Tools Maven plugin installs
its Node dependencies; do not replace them with a separately selected TypeScript
toolchain. Its generated `package.json`, lockfile, `node_modules/`, and build
outputs are ignored by Git.

The generic documentation page and the tagged source do not show the same
TypeScript version. This project follows the **4.25.0 tagged parent/toolchain**;
its `vrotsc` source declares TypeScript 5.7.2 and the Node/npm requirements above:
[pinned toolchain source](https://github.com/vmware/build-tools-for-vmware-aria/blob/v4.25.0/typescript/vrotsc/package.json).

## Commands

```bash
make validate            # Offline metadata check; no Maven downloads
make test                # Compile and run the TypeScript/Jasmine test lifecycle
make test-native         # Check the imported workflows/actions without Maven
make package             # Build the native .package, including tests
make push PROFILE=lab    # Build and upload to the target Orchestrator
make clean               # Remove local Maven build output
```

`pull` and `download` intentionally report an error. TypeScript is transpiled
to Orchestrator JavaScript; server content cannot be pulled back into equivalent
TypeScript. Use Git for source retrieval and edit TypeScript here. See the
[upstream TypeScript workflow](https://vmware.github.io/build-tools-for-vmware-aria/latest/usage/products/vro/typescript/).

Maven repositories and any repository credentials should use the same private
Maven setup already used to build `nested-vcf-automation`.

## Content

| Path | Responsibility |
| --- | --- |
| `src/lab/classes/LabNaming.ts` | Pure hostname/domain validation and FQDN generation |
| `src/lab/classes/LabNaming.test.ts` | Jasmine tests for the naming contract |
| `src/lab/actions/getLabFqdn.ts` | Action entry point accepting a short hostname and domain |
| `src/lab/workflows/DescribeLabHost.wf.ts` | Example workflow returning the FQDN without changing infrastructure |
| `configuration/settings.example.xml` | Non-secret target-profile example |
| `src/modular/` | Four-stage catalog deployment workflow, request form and typed lab/VCF plan |
| `configuration/modular-request-fields.json` | Modular form layout, field defaults and descriptions |
| `native/src/main/resources` | Imported workflows, actions and forms with their existing IDs |
| `native/import-manifest.json` | Source inventory, original archive fingerprint and explicit external dependencies |

The workflow has a stable UUID so that a new package updates the same workflow.
Give every new workflow its own stable UUID. Keep VM lifecycle calls, REST
integrations, and workflows in this component; keep CCI resources and custom
resource declarations in the blueprint component.

`tsconfig.json` assists the editor. The vRO transpiler supplies its own compiler
configuration during Maven builds. Node APIs such as `fs` and `process` are not
available in the Orchestrator JavaScript runtime.

## Target configuration

Merge the properties from `configuration/settings.example.xml` into the `lab`
profile in your existing `~/.m2/settings.xml`. Preserve your existing Maven
repositories and VCFA profile properties; do not overwrite the entire file.

The example reads environment variables:

```bash
export VRO_HOST=orchestrator.example.invalid
export VCFA_HOST=automation.example.invalid
export VRO_USERNAME=configurationadmin@Classic
read -rsp 'Orchestrator password: ' VRO_PASSWORD
printf '\n'
export VRO_PASSWORD
make push PROFILE=lab
```

`vro.auth=vra` uses the VCFA authentication endpoint specified by `vro.authHost`
and `vro.authPort`. Select the username/organization accepted by your deployment.
Only use `basic` when the target supports and enables it.

For a lab with untrusted certificates, set both
`vrealize.ssl.ignore.certificate` and `vrealize.ssl.ignore.hostname` to `true`
in that private profile. This is independent of vCenter's `GOVC_INSECURE` value.
Upload imports the required Build Tools runtime packages as well as this package.

## Umbrella integration

The umbrella adapter reads the following optional section from
`configuration/lab.local.json`:

```json
{
  "orchestrator": {
    "builder_directory": "components/vro-typescript",
    "artifact_subdirectory": "vro",
    "maven_profile": "lab"
  }
}
```

Profile precedence is `--profile`, `VRO_PROFILE`,
`orchestrator.maven_profile`, then `automation.maven_profile`.
Local validation/build/test operations do not require a target profile.

```bash
./orchestration/check-build-host.sh vro
./orchestration/run_vro.py show
./orchestration/run_vro.py validate
./orchestration/run_vro.py test
./orchestration/run_vro.py build
./orchestration/run_vro.py upload --profile lab
```

Successful umbrella builds/uploads copy `.package` files to
`artifacts/vro/builds/`. Neither build artifacts nor private settings belong in Git.

## Provenance and initial validation

Project structure was checked against the upstream TypeScript archetype at
tag `v4.25.0`, commit `2ead8f52c9ed351205c6054b770d3a385d403314`:
[archetype POM](https://github.com/vmware/build-tools-for-vmware-aria/blob/v4.25.0/maven/archetypes/ts/src/main/resources/archetype-resources/pom.xml).
Build Tools is maintained by VMware/Broadcom and its contributors.

The modular implementation has been checked with the official 4.25.0 vRO
transpiler and standalone TypeScript/Jasmine tests. Full Maven package assembly
and import/execution still need verification on the configured Ubuntu build
host and Orchestrator. See the [first integration test](docs/modular-lab.md#first-integration-test).

The native integration additionally has seven regression tests and a combined
package verified with the official 4.25.0 packager. See the
[migration validation and versioning notes](docs/custom-resources.md).
