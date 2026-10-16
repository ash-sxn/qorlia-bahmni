# Native order transfer paging

Latest source consumer: [React summary/detail integration](STOCK_TRANSFER_DETAILS.md#react-api-consumer-checkpoint-16-october-2026).
The panel now reads pages instead of the legacy graph. This is component-tested
source, not a deployed UI or removal of large signed-action limits. Historical
missing-consumer statements below describe those earlier checkpoints.

## Native HTTP client and copied-upgrade checkpoint (16 October 2026)

A separate non-public synthetic database is cloned from the stopped return-49
copy and installed at adapter **50**, using the pinned image and source from
`64088314`. The copied signing secret/identity is rotated before HTTP starts.
It has a separate data directory, no published ports, unprivileged/read-only
container execution and resource limits. Diagnostic transport uses a private
SSH Unix socket, not a replacement UI review gate.

The actual TypeScript service is loaded from the repository (SHA-256
`f0609c2b0a4cb290d619cc8695413d62463cf0d8f671915eaf2e495a6774b463`).
Its requests go to real native HTTP, with only the existing URL-prefix/cookie
transport adaptation; business responses are not mocked. Direct native reads and
independent SQL provide the comparison data. This does not test browser rendering
or the actual protected gateway.

Verified boundaries:

- All **101** genuinely linked transfers traverse six 17-row pages with exact
  native headers, counts, identity order, cursor positions and a final empty page.
  Unknown cursors reject. The legacy full list still rejects above 100.
- Empty orders return no invented transfer. Summaries accurately report 501 moves
  and 2,001 operations, while selected oversized details still reject. Selected
  small-transfer loading works on the 101-transfer order.
- Anonymous and logged-out requests reject. A second authenticated session and
  re-authentication continue the same unchanged snapshot.
- The off-page final transfer confirms through signed load/preview/save/status.
  Two overlapping identical saves resolve once through native serialization
  handling. Its detailed operation is then prepared through the native edit API.
  Each change rejects an old page version; fresh pages show the actual new state.
- A synthetic parent-location rename rejects the prior version and updates its
  rendered label. A temporary native read rule hiding an off-page operation
  rejects even the first page before returning a partial count. The rule is
  removed and normal reads recover. These private operator fixture controls do
  not add raw write/create/unlink capabilities to the product gateway.
- Native `AccessError` remains a generic redacted permission error. The first
  diagnostic incorrectly expected a business-error class; the corrected second
  run and a new unit regression verify the existing secure behavior. No product
  permission/error policy was relaxed. This describes the client-facing error,
  not scrubbing of native JSON-RPC debug fields on the wire; actual protected
  gateway hardening/acceptance remains a separate boundary.
- **15 copied source-49 request histories** recover through real TypeScript/native
  HTTP at installed 50, and all 15 exact saves replay successfully, including four
  operation saves omitted from the earlier read-only check. Four completed forms
  remain read-only. This is a copied synthetic upgrade case, not acceptance of
  every live migration/configuration or a browser recovery mechanism.

Independent SQL checks the exact author/company/request-bound confirmation and
operation hashes, one receipt of each kind, 100 draft transfers plus one confirmed
transfer, one recorded done unit, zero reserved/delivered units and no new
valuation. Physical stock stays ten units in each stock fixture. All original
rows across 18 monitored tables retain their fingerprints, no financial/valuation
rows are added, and complete bank statements/lines match the original copy.
Mandatory analytics/SMS remain enabled and the temporary access rule is absent.
Computed invoice totals are not independently recalculated.

The setup's first seed launcher failed before database initialization because its
source split marker matched an inner string. It was corrected using an explicit
startup marker and a new log; no uncertain mutation was repeated. Native expected
rejections and the handled concurrent serialization retry remain in server logs.
The optional pandas bootstrap lookup/native metadata warnings remain; no new
dependency was installed. Unix-forward TCP_NODELAY warnings are non-fatal; its
255 exit is the deliberately closed SSH process, not an ignored test failure.

Fresh Home verification passes **720 tests in 75 suites**, including nine
transfer-service tests, focused source/test type checking, scoped ESLint and
format/diff checks. The earlier 213 native and three gateway test results remain
unchanged-source evidence, not freshly rerun installed-50/full-addon results.
No new frontend build, browser or actual protected-gateway acceptance is claimed.

Diagnostic sessions/socket are closed, the temporary directory removed and the
private HTTP-50 container stopped. Synthetic data/evidence remain for later work.
The original tester-43, validation-48 and return-49 data are preserved. Review
access stays **410**. No public/tester deployment or React migration occurred;
the React panel still uses the capped legacy list.

Private evidence directories: `paging-read-http50-20261016`,
`paging-actions-http50-20261016`, `paging-access-http50-r2-20261016`, and
`old-receipts-http50-20261016`. `readback-paging-http50-20261016.cjs` and
`paging-http50-baseline-20261016.cjs` perform the independent SQL checks.
Credentials, exact private requests, copied records and signing identity stay
outside the public repository.

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

1. Extend native HTTP acceptance to broader roles/companies/configurations and
   verify the actual protected gateway in a later appropriate access window.
   The checkpoint above covers one explicitly scoped synthetic copied upgrade.
2. Accept the component-tested React summary/detail navigation and stale-page
   recovery through a later approved gateway/browser review window.
3. [Candidate 51 adds complete move/operation read pages](STOCK_TRANSFER_DETAILS.md).
   Complete large-transfer signed review/write UI and recovery without treating
   partial pages as complete action graphs.
4. Verify broader role/company/configuration and realistic performance boundaries.
5. Obtain a later owner-approved review window before browser testing or release.
