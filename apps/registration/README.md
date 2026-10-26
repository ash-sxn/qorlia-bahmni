# @bahmni/registration-app

[Project README](../../README.md) · [Setup](../../docs/setup-guide.md) · [Module map](../../docs/module-guide.md)

## Responsibility and entry points

Patient search, registration and editing use `/bahmni-v2/registration/search`, `/patient/new` and `/patient/:patientUuid` beneath the registration base. Follow [routes](src/routes/index.tsx), [pages](src/pages/) and the [shared patient service](../../packages/bahmni-services/src/patientService/).

Native patient identifiers, required attributes, duplicate checks and visit rules depend on the approved installation. A display identifier is not an OpenMRS UUID. Check configuration and native validation before changing a required field or its allowed format.

## Change and verify

Use [the testing guide](../../docs/testing-guide.md) with `apps/registration/jest.config.ts` and `apps/registration/tsconfig.lib.json`. The current tests use Jest, not the older generated Vitest instruction. Tests are adjacent to source under [src](src/).

Check approved synthetic create/edit and a fresh native read, duplicates, required fields, denied roles, expiry and safe error handling. Do not use real patients or repeatedly submit an uncertain registration. Check [current parity](../../docs/FEATURE_PARITY.md) before claiming acceptance.
