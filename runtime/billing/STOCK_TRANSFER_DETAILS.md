# Native transfer detail pages

## Candidate 51, 16 October 2026

Candidate source `16.0.1.51.0` adds complete, bounded read traversal of a
transfer's moves and detailed operations. It reuses the existing native header,
move and operation projections, with the same values in the legacy full graph.
It does not remove signed-action limits or migrate the React transfer panel.

## API and client

Use `sale.order.qorlia_order_transfer_detail_page` through its named dataset route:

```json
{"model":"sale.order","method":"qorlia_order_transfer_detail_page","args":[],"kwargs":{"order_id":123,"transfer_id":456,"section":"operations","after":0,"version":false,"limit":50}}
```

`section` is exactly `moves` or `operations`; callers cannot choose a model,
table, domain or fields. `after` is a nonnegative integer, `limit` is 1 through
100 (default 50), and nonzero cursors require the original version. The saved
transfer must be linked to the selected readable order. A cursor must belong to
that transfer's selected section, not another transfer's collection.

The response has exactly these top-level keys:
`order_id`, `order_name`, `order_state`, `read_only`, `transfer`, `section`,
`version`, `after`, `position`, `total_count`, `next_after`, `rows`.

- `transfer` is the native header plus complete `move_count` and `operation_count`,
  without invented `moves: []` or `operations: []` arrays.
- `rows` contains actual move rows or actual detailed-operation rows, in native
  numeric identity order. `position` counts rows through the cursor within that
  section. Counts are not truncated at legacy limits. `next_after: false` means
  the end; an exact final cursor may return an empty final page.
- Move rows preserve native product/unit/order-line relations, state, demand,
  reservation and recorded done quantity. Operation rows preserve their own unit,
  move reference, lot or pending lot name, expiration, locations, packages, owner,
  reservation and recorded done quantity. Do not convert an operation's quantity
  to the product's base unit while keeping the operation's unit label.

`getOrderTransferDetailPage` provides the TypeScript boundary. Its discriminated
response identifies the collection; it checks exact shapes/keys, selected order
and transfer, section, native field types, ordered unique positive IDs, complete
counts, page length and exact continuation/end cursors. Both summary and detail
clients reject impossible positions above the positive-ID cursor. Native session
expiry, stale/business rejection and generic access-error redaction are retained.

## One snapshot across summaries and sections

`version` is the existing **order-wide snapshot**, not a section-specific token.
Pass the summary's version into the first detail page. Continue with that same
version on every page, including the first page of the other section. If opening
details directly, the first page may use `false`; carry its returned version to
the remaining pages and other section. Starting each section with `false` would
start independent snapshots and must not be used to assemble a combined view.

Every request rechecks native read ACLs, field rights, record rules, companies and
references across all linked stock records, including other sections, off-page
rows and other transfers on the order. Hidden records reject before partial
counts. The shared version binds actor, database, active companies, roles,
language/time zone, native display labels and access/module configuration.
Changes in a different section or transfer invalidate the old snapshot. Keep
the existing full linked-scope check; never substitute a visible-row-only domain.

## Reading is not signed-action completeness

The new endpoint is read-only. Old full-list and selected-action graphs retain
their existing 500-move/2,000-operation limits (and the legacy full list's
100-transfer budget). A page cannot stand in for a complete graph when reviewing
reservation, edit, confirmation, validation or return effects. Large-transfer
write/review parity remains unfinished; do not enable it by dropping limits,
inventing empty arrays or signing only the currently visible page. Inventory
scope limits and broader Billing parity are separate remaining work.

The shared scope still scans the linked graph and hashes conservative access
metadata. Response size is bounded, but cost and retained ID sets are not
constant. Representative hospital-scale performance acceptance is still needed.

## Verification boundary

The focused native suite passes **25 order/detail cases**, including complete
501-move and 2,001-operation traversal, matching legacy values, native units and
pending batches, empty operation sections, bounds/foreign cursors, cross-stream
staleness, hidden off-page records, actor/company rules and corrupt cross-transfer
move references. Mandatory analytics and original rows in 18 monitored tables
are preserved after rollback. Source 51 is mounted read-only against the existing
private installed-50 database; this is not a schema/module upgrade.

Fresh Home verification passes **726 tests in 76 suites**, including six new
detail-client cases and nine summary/legacy boundary cases. Focused source/test
and library type checks, scoped ESLint, formatting/diff checks and three
review-host route/gate tests pass. The current-source selected shared-stock
regression passes **222 cases** (25 order/detail plus 197 stock-action cases), with
zero failures, errors or skips, mandatory analytics and original rows in the same
18 monitored tables preserved. This second run uses installed-49 private return
data with a read-only source-51 mount; there is no persistent upgrade. The focused
25 cases overlap this run and are not 247 independent tests. This is not the full
addon suite, installed-51 acceptance or relabelled source-50 evidence.

Actual TypeScript/native HTTP is checked against a separate unprivileged,
read-only/resource-bounded source-51 candidate container, with no published ports,
using the same installed-50 private data and a separate session directory. It
returns every one of 501 moves across seven 73-row pages and 2,001 operations
across 21 97-row pages, matching independent native reads exactly. Empty sections,
complete end cursors, shared summary/section snapshots, foreign/stale rejection,
anonymous/logout handling, old saved-status compatibility and retained large
action rejection pass. Independent SQL fingerprints verify all original rows
across **20** monitored stock/finance/bank tables are unchanged. No business
response is mocked; only URL-prefix/cookie transport uses the diagnostic socket.
The actual service SHA-256 is
`ce7234f88ec856b2d8a1025223160a25141effee1807fda42b0168ca4b936562`.

The first HTTP diagnostic passed its data assertions but exited 1 after trying
logout twice. Its evidence is retained as a failed diagnostic; the corrected
second read-only run exits 0. It is not silently counted as an initial pass.
Existing native/optional-bootstrap warnings and non-fatal Unix-forward warnings
remain. No new dependency or warning-free runtime is claimed.

Browser rendering, actual protected-gateway traffic, installed-51 migration and
wider native HTTP roles/companies/configurations are not accepted by these tests.
The React panel still uses legacy APIs, so no new UI or removal of its limits is
claimed. Review access remains 410; no public/tester deployment or frontend build.
The diagnostic session is logged out, SSH/socket and empty temporary directory
are removed, and the private source-51 container is stopped. Installed metadata
stays 50 and the existing private data/evidence are retained.

Private evidence: `transfer-detail-r1-20261016/native-tests.log`,
`transfer-detail-r1-20261016/native-regression.log` and
`transfer-detail-http51-r2-20261016/` under the staging evidence directory. Native
source, client and test code are public; credentials, exact private histories and
copied records remain outside this repository.

## Next work

Integrate the summary/detail readers in React when UI work is in scope. Implement
complete large-transfer signed review/write support, check the actual protected
gateway, and perform broader role/company/configuration and representative scale
testing.
