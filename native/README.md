# Native vRO source

This directory holds the editable XML, embedded JavaScript and forms imported
from `customresources.package`. It is staged into the same final package as
the TypeScript code during Maven `prepare-package`.

- [Inventory and original package fingerprint](import-manifest.json)
- [Workflows, build integration, migration changes and runtime requirements](../docs/custom-resources.md)

Preserve element IDs and action module names. Keep API tokens, passwords,
exported package signatures and private signing keys outside Git. Run
`make validate test-native` from the component root after changes.
