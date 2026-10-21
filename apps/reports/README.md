# @bahmni/reports

[Project README](../../README.md) · [Setup](../../docs/setup-guide.md) · [Native Reports adapter](../../runtime/reports/README.md)

## Responsibility and entry points

- [Routes](src/routes/index.tsx): `/bahmni-v2/reports/` and `/bahmni-v2/reports/my-reports`.
- [ReportsPage](src/pages/ReportsPage.tsx), [report service](src/pages/reportService.ts) and [tests](src/pages/__tests__/).
- [PrivilegeGuard](src/components/PrivilegeGuard/) and the separately configured native report runtime.

Reports involve jobs, scheduling, status, cancellation/deletion and file downloads where the installation supports them. A generated link or HTTP 200 is not proof of a correct report. Preserve native templates, parameters, MIME type, filename, full rows and access rules. Template branding is not an arbitrary HTML replacement.

## Change and verify

Use [testing](../../docs/testing-guide.md) with `apps/reports/jest.config.ts` and `apps/reports/tsconfig.lib.json`, from repository root. Replay approved synthetic jobs/downloads against a compatible report adapter, not just mocked JSON. Document queued/failed/expired/denied cases and inspect the downloaded output. Current runtime limits and acceptance are in [the adapter guide](../../runtime/reports/README.md) and [parity ledger](../../docs/FEATURE_PARITY.md).
