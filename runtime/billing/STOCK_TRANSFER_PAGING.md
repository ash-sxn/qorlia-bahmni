# Native order transfer paging

## Backend candidate, 16 October 2026

Source candidate `16.0.1.50.0` adds a bounded transfer-summary API and changes
stock actions to load the selected transfer rather than every transfer's detail.
It does not upgrade the hosted tester or reopen the expired local review gate.
The existing React transfer panel still calls the legacy full-list API. Migration
of that panel and browser acceptance remain outstanding.

## Contract

Call `sale.order.qorlia_order_delivery_page` through its named dataset route:

```json
{"model":"sale.order","method":"qorlia_order_delivery_page","args":[],"kwargs":{"order_id":123,"after":0,"version":false,"limit":25}}
```

Use the returned `next_after` and original `version` for each continuation.
`next_after: false` means the end, not an empty detail graph. A stale version
requires restarting from the first page; do not append a new version to old rows.
The limit is an integer from 1 to 100. Cursors must belong to the same order.
Transfers are ordered by native numeric identity, not schedule date or name.

The response contains `order_id`, `order_name`, `order_state`, `read_only`,
`version`, `after`, `position`, `total_count`, `next_after` and `rows`. Rows have
the existing native transfer header plus `move_count` and `operation_count`.
They deliberately omit `moves` and `operations`; missing detail is not an empty
transfer. The TypeScript `getOrderDeliveryPage` boundary checks exact keys, native
relations/states/dates, ordered unique IDs, page length/counts and cursor/version
continuity. Native session and stale-request errors retain existing handling.

Before returning even a count, the backend checks native read ACLs, field rights,
record rules and order company across **all** linked transfers, moves, detailed
operations and lots, including records outside the requested page. It also checks
referenced records. A hidden linked record rejects the request, rather than
presenting a misleading visible subset. Caller context is limited to active
companies, language and time zone. No caller-supplied model, domain or fields are
accepted. The gateway adds only this named route, with existing access gates.

The version binds database, actor, groups, companies, language/time zone, order,
linked stock records, related labels/templates and access/module metadata.
Actual native display labels are included, so inherited warehouse/parent-location
renames also invalidate continuation. Off-page changes invalidate continuation.
Linked identity/permission scans use 200-ID batches;
targeted digests cover the linked/related graph rather than all hospital stock.
This still scans that graph and retains record ID sets, with conservative global
access/module metadata hashing. It is not constant-time or constant-memory and
has no hospital-scale performance acceptance yet.

## Selected-transfer actions

Shared stock loading now checks the same complete permission/version scope, then
projects only the requested linked transfer. Existing signed reviews, locked save
checks, exact request receipts and native actions remain in place. This removes
the legacy order-wide 100-transfer dependency for selected-transfer actions.

The legacy `qorlia_order_deliveries` API deliberately retains its existing 100
transfer, 500 move and 2,000 detailed-operation budgets. Selected detail still
rejects a transfer above 500 moves or 2,000 operations. Summary counts can exceed
these limits without silently truncating, but nested detail paging remains work
to do. The React panel continues to encounter the legacy limits until migrated.

## Verification boundary

The final native run passes **213 cases**, including 16 paging/read cases and
197 reservation, operation, confirmation, validation and return cases, in the
private return database with mandatory analytics. It uses a read-only candidate
source mount and `--no-http`, not a persistent module upgrade. It covers 101
genuinely linked transfers, complete ordered pages, exact end cursor, selected
confirmation/load/save/status/retry beyond the old cap, stale versions (including
inherited display labels), hidden off-page records, large detail counts and
unchanged detail caps. There are zero failures, errors or skips. Existing
synthetic browser/return states and receipts, six stored finance/valuation tables
and quants match their pre-run fingerprints after rollback. This is a selected
shared-stock regression, not the full addon suite.

Fixture construction explicitly asserts the native order link: empty native
pickings lose their procurement link, which caused two failures in the first
focused run. The corrected second candidate passed its 15 focused cases and a
212-case shared-stock regression in the validation database. The final 213-case
candidate adds the inherited-label check; overlapping cases are not counted as
425 independent tests. Existing native metadata warnings and the optional pandas
bootstrap's failed DNS/package lookup remain; no dependency was installed and no
warning-free runtime is claimed.

All 719 Home tests in 75 suites pass, including eight transfer-service tests.
Home library type checking, focused source/test type checking, scoped ESLint and
the three review-host tests pass. These are source/unit/native-shell results,
not native HTTP, protected-gateway or browser acceptance of paging. No new
frontend build, schema installation, public deployment or full-addon acceptance
is implied. The original validation runtime stays 48, hosted tester 43 and the
separate stopped return HTTP runtime 49. The owner-closed gate still returns 410.

Independent read-only SQL after the runs rechecks the hosted tester, validation
fixtures and all four completed return histories. Existing batches, quantities,
valuation/ledger values and protected finance remain intact, with no new payment,
reconciliation or bank line. Mandatory analytics and SMS configuration remain
enabled. Computed invoice totals are not independently recalculated.

Private diagnostic logs are outside the public repository at
`delivery-page-r3-20261016/native-regression.log` (final 213), and
`delivery-page-r2-20261016/native-tests.log` / `native-regression.log` (prior 15/212)
under the staging evidence directory.
Credentials, private receipts and database dumps are not published here.

### Previously accepted requests

The source-50 candidate also recovers 15 stored source-49 request histories in the
private return database: four return creations, four operation edits and seven
validation steps, across outgoing, incoming, chained and automatic valuation cases.
The original actor, request, saved identity and historical state/continuation are
checked through their native status methods, not inferred from unchanged JSON rows.
Eleven exact creation/validation save replays return the same accepted response
inside a PostgreSQL-enforced **read-only** transaction. Operation save is not called
in that check because its existing path locks rows; operation status is checked.
This is native-shell compatibility evidence with installed metadata still 49,
not an installed-50 upgrade, new HTTP session, browser or gateway test.

## Remaining work

1. Complete actual TypeScript/native HTTP paging acceptance in an isolated
   non-public runtime, including old accepted request recovery and operation-save
   replay. Do not infer transport or installed-upgrade acceptance from shell tests.
2. Migrate React summary/detail navigation and stale-page recovery, when UI work
   is in scope. Do not represent old full-list reads as paged reads.
3. Add nested move/operation paging without weakening signed action completeness.
4. Verify broader role/company/configuration and realistic performance boundaries.
5. Obtain a later owner-approved review window before browser testing or release.
