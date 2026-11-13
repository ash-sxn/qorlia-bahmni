# @bahmni/services

[Project README](../../README.md) · [Architecture](../../docs/architecture.md) · [API integration](../../docs/api-integration-guide.md)

## Responsibility

Clinical API functions, endpoint constants, data types, authentication/privilege helpers, translations and domain utilities shared across modules. This is not the OpenMRS server or database. Billing uses [its own app service](../../apps/home/src/components/Billing/billingService.ts) and separate native ERP adapter.

Start with [exports](src/index.ts), [HTTP client](src/api/client.ts) and the domain folder for your task. The [appointment read exercise](../../docs/first-contribution.md) follows one real consumer. Document services and encounter-session matching have different contracts; do not generalize one endpoint's semantics to another.

## Change and verify

Search all callers, exports and adjacent tests before modifying a shared input/output. TypeScript types do not validate runtime responses. Preserve identities, native `false`/missing relation behaviour, permissions, time zones, quantity units and error/expiry handling. Coordinate encounter-session and sensitive write contracts with their owner.

Use [setup](../../docs/setup-guide.md) and [testing](../../docs/testing-guide.md) with `packages/bahmni-services/jest.config.ts` and `packages/bahmni-services/tsconfig.lib.json`. Also run affected consumer tests. Native/API evidence is separate from mocked tests.

The [distribution Webpack configuration](../../distro/webpack.config.js) owns browser build settings. Do not define the whole `process.env` object, embed secrets or add a second bundler as an onboarding fix. Retain existing package names, exports and source notices.
