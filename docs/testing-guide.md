# Testing and acceptance

[README](../README.md) · [Previous: contributing](../CONTRIBUTING.md) · [Next: team workflow](team-workflow.md)

## Checks prove different things

| Check                     | What it proves                                      | What it does not prove                       |
| ------------------------- | --------------------------------------------------- | -------------------------------------------- |
| TypeScript                | Checked source fits declared types                  | Server payloads or workflow correctness      |
| Lint/format               | Defined source quality rules                        | Clinical or accounting correctness           |
| Unit/component tests      | Tested logic and simulated interactions             | Real backend behaviour                       |
| Native adapter tests      | Covered rules against the native runtime            | Every frontend/browser flow                  |
| Actual API save/read-back | Tested endpoint persists the intended native result | Every UI/layout case                         |
| Browser acceptance        | Observed end-to-end user path                       | All permissions, data sizes or environments  |
| Domain review             | Qualified review of clinical/accounting semantics   | Substitute for implementation/security tests |

Do not report “all APIs connected” from a test count. Keep evidence scoped to the requirement and exact source/environment.

## Focused frontend checks

From repository root, using macOS/Linux or Git Bash/WSL syntax:

```bash
TS_NODE_SKIP_PROJECT=true TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node"}' yarn jest --config apps/appointments/jest.config.ts --runInBand
yarn tsc -p apps/appointments/tsconfig.lib.json --noEmit --emitDeclarationOnly false
yarn eslint apps/appointments/src/pages/appointmentActions.ts
yarn prettier --check apps/appointments/src/pages/appointmentActions.ts
git diff --check
```

Replace Appointments and file paths with your assigned module/files. Direct Jest is a known way around the current Nx dependent-build cycle; it is not a reason to alter unrelated packages.

`tsconfig.lib.json` can exclude tests. Check test-source types using the actual `tsconfig.spec.json` and real imported source too; do not invent mock/shadow declarations to make them pass. Ask the maintainer for the scoped source-based checker if the whole spec configuration has unrelated failures.

For Home/Billing use `apps/home/jest.config.ts` and `apps/home/tsconfig.lib.json`. Gateway/configuration checks:

```bash
node --test scripts/review-host/server.test.cjs distro/webpack.config.test.cjs
node scripts/check-contributor-docs.mjs
```

The [documentation check](../scripts/check-contributor-docs.mjs) validates local links, linked headings, README reachability and the no-em-dash convention for the contributor guides. It does not validate live backend setup or remote URLs. The protected 14 October Billing UI checkpoint has 595 Home tests/69 suites passing; its preceding seven gateway/configuration checks are unchanged. Counts are a dated observation, not a permanent threshold or whole-product completion claim. Check the current [parity ledger](FEATURE_PARITY.md).

## Build check

For the existing development distribution build, from repository root:

```bash
cd distro
NX_TASK_TARGET_PROJECT=@bahmni/distro NX_TASK_TARGET_TARGET=build NX_TASK_TARGET_CONFIGURATION=development ../node_modules/.bin/webpack --mode development --config webpack.config.js
```

This supplies the Nx target context used by its Webpack plugin. The protected 14 October UI build succeeded with hash `01c92a12bdb90486`; do not expect future builds to retain that hash. Generated output is `distro/dist`. This is not a production release command. Run the checks/build again after source changes and record the tested SHA.

## Native runtime testing

The newest [adapter 47 validation checkpoint](../runtime/billing/STOCK_VALIDATION.md#adapter-47-service-and-isolated-http-checkpoint-15-october-2026) adds 16 service-boundary cases, 643 Home tests/72 suites, a final 30-case confirmation/validation run, nine gateway/configuration checks, types/lint/format and a development build. Native source passes 96 mandatory-analytics fulfillment cases and the 674-case legacy-copy harness with analytics restored. Six actual HTTP scenarios and independent receipt/accounting/stock read-back pass with the version distinctions recorded in that contract. This is not validation-wizard UI, browser recovery or hosted publication acceptance. The older counts below remain historical observations.

Python Billing tests are in [the addon tests](../runtime/billing/qorlia_billing_ui/tests/); they run inside a compatible Odoo installation with matching Bahmni modules and synthetic configuration. Running ordinary `pytest` without that runtime does not reproduce those tests.

The isolated adapter 43 checkpoint passed 28 focused operation-form/action checks and 578 full addon tests with no failures/errors/skips. Native mandatory analytical configuration was restored and installed source hashes matched. This does not accept full fulfillment, production deployment or every module. Native environment/test procedures are operator-provided; never copy private database settings into a public script.

The later [confirmation contract](../runtime/billing/STOCK_CONFIRMATION.md) adds 13 focused native cases, passing with mandatory analytics. The combined 591-case regression harness passes on a separate database copy with legacy fixtures' optional analytics, restored afterward. An initial full run under mandatory analytics produced 80 missing-allocation fixture errors. Do not hide that configuration difference or treat the optional-fixture suite as proof of every mandatory-analytics workflow. Never relax the running tester or production database to make a regression harness pass. Configuration-specific acceptance remains separate.

The 15 October adapter 45 source checkpoint supersedes that earlier case count: 29 focused confirmation cases pass with mandatory analytics, and the combined 620-case legacy harness passes on the copy with optional analytics restored afterward. Native caller-attribution, actual-effect rollback and cancelled/deleted-RFQ recovery are covered. TypeScript/gateway source checks are separate from native acceptance; browser controls and actual HTTP/browser confirmation still require integration. Record the tested version rather than treating these historical counts as a permanent threshold.

A later 15 October increment adds confirmation controls, shared recovery and actual isolated HTTP/browser acceptance. The Home suite passes 627 tests/71 suites and eight gateway/configuration checks. The browser exercised synthetic transfer review/save, native generated references, close/reload recovery, exact status/clear and parent refresh. Independent native reads checked receipt uniqueness and protected finance/physical stock. See [the contract's dated checkpoint](../runtime/billing/STOCK_CONFIRMATION.md). These tests did not publish or accept the new source through the protected tester gateway, and do not cover hospital-scale concurrency or every configuration.

The subsequent protected-gateway staging check passes nine gateway/configuration cases and real gateway HTTP/static-browser acceptance on loopback. A temporary transport suppressed accepted responses; an explicit browser 503 left the identical request durable across reload, status recovery and receipt-checked clear. The first disconnect reached accepted UI and was not counted as an unknown state. This verifies the real gateway code with isolated native services, not the public HTTPS/container release. Fault injection and private credentials do not belong in product source. See the newest [confirmation checkpoint](../runtime/billing/STOCK_CONFIRMATION.md).

## Synthetic workflow acceptance

Obtain permission before creating/editing test records. Use clearly labelled records and record their identifiers privately as appropriate. Do not use real patients, financial records or an employee's private credentials.

For a save, record the initial native state, intended change, endpoint/payload keys, response and saved state after reload. Independently verify relevant native records, not just the same frontend representation. Financial/stock changes need unchanged protected-record and accounting/inventory invariants where applicable.

Cover:

- Valid save and native rejection, including stale configuration/data.
- Denied role, hidden record/company and expired session.
- Double click, timeout/lost response and exact recovery where supported.
- Closing the editor, unmount and full reload with a pending request.
- Search/paging, empty results, loading/error states and parent refresh.
- Keyboard navigation, focus restoration and narrow-screen readability.
- Dates/time zones, quantities/units, batch/expiry and currencies as relevant.

Never repeat a write merely because an observation timed out. Check the same process/request or authoritative saved state. A timeout is not a terminal outcome.

## Report format

```text
Task / PR:
Source SHA and backend/configuration version:
Checks run, exact commands and results:
Approved synthetic fixture:
Expected and actual native outcome:
Browser/API/native evidence:
Denied/expiry/recovery cases:
Untested cases and next gate:
Reviewer/tester:
```

If a command fails, include the failure and cause. Do not claim skipped checks ran. Keep evidence free of secrets and identifiable private records.
