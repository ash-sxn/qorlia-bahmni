# @bahmni/admin

[Project README](../../README.md) · [Setup](../../docs/setup-guide.md) · [API rules](../../docs/api-integration-guide.md)

## Responsibility and entry points

Administration provides its dashboard, CSV import/export, audit log and order-set screens under `/bahmni-v2/admin/`. Start with [routes](src/routes/index.tsx), their [PrivilegeGuard](src/components/PrivilegeGuard/) and [pages](src/pages/). Audit API helpers live in [shared services](../../packages/bahmni-services/src/auditLogService/).

Administration is a workflow area, not permission to bypass native roles. Imports can change many records. Exports/audit responses can expose sensitive information. Use synthetic fixtures and preserve native validation, scope and download format.

## Change and verify

Follow [testing](../../docs/testing-guide.md) with `apps/admin/jest.config.ts` and `apps/admin/tsconfig.lib.json`, from repository root. Read [page tests](src/pages/__tests__/) before changing behaviour. Cover denied access, malformed files/rows, empty results, full export content and native read-back where a write is authorized. Keep logs and public screenshots free of private records. See [parity](../../docs/FEATURE_PARITY.md) for current acceptance.
