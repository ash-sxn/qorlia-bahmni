# Global inventory transfer workspace

[README](../../README.md) · [Billing](README.md) · [Order transfer details](STOCK_TRANSFER_DETAILS.md) · [Cancellation](STOCK_CANCELLATION.md)

## Candidate 68 global confirmation, 19 October 2026

Inventory details now open the existing complete confirmation dialog, with
`order_id: false` for a global transfer. This explicit identity is not zero, an
omitted field or an invented Sales order. The same six
`qorlia_confirmation_paged_*` APIs handle load, ordered effect review, exact
save/status, pinned generated-reference pages and stopping an unsent request.
Positive order identities retain their existing scope and request digests.
Legacy confirmation and other stock workflows still require real orders.

The shared native scope helper opts into the complete Inventory read scope only
for this confirmation path. The read version does not become a write proof:
confirmation still adds the full inventory/configuration/financial stamp,
package graph, rollback-native effect preview, ordered proof, locks, caller
permissions and actual-effect comparison. Confirmation may reserve stock or
create native dependencies; it does not validate physical delivery. No new
confirmation engine, raw action route, schema field, `sudo` or role grant is added.

The client represents orderless identity only in paged confirmation types.
Other workflow checks reject it. Exact global requests use the same schema-8
account/database-bound durable slot; old clients cannot recover this new identity
and must not clear or rewrite it. The Billing recovery banner opens confirmation
directly, never an order page. Its target stays pinned during a cleared-banner
refetch so the dialog can finish its acknowledgement and close normally.
Existing order workspaces can also resume the exact global confirmation.
Finishing refreshes active Inventory lists/details, while modal-state queries
remain invalidated without an automatic stock retry. Closing is not undo.

Source checks pass 1,561 Home cases/102 suites, including global identity
boundaries, all six client calls, exact storage, no-resave recovery, Inventory
entry/reload and recovery target stability. Types, scoped lint and gateway stub
checks are separate from native and real-browser acceptance. The first 81-case
native run had nine fixture errors (Odoo's exception helper and a missing native
procurement-group link), zero assertion failures and all 132 tables preserved;
its independent committed SQL also agrees. It remains a failed run.

The corrected source passes **81 unique native cases, zero failures/errors/skips**:
11 global confirmation cases, all 45 existing confirmation preview cases and
25 global read cases. These include orderless receipts/deliveries/internal
transfers with Stock User but no Sales role, actual reservation/batch references,
exact duplicate-save/status/stop recovery, strict false identity, same-author
order/global proof swaps, stale inventory/configuration, hidden rows/fields,
write denial, foreign companies and different-author receipt rejection. All
106 Python hashes match the immutable package. All 132 guarded tables remain
unchanged with mandatory analytics/SMS enabled; independent post-worker committed
SQL counts/full-row hashes match the baseline.

The matching actual client accepts **276 captured native JSON responses** across
all six confirmation methods, including 96 orderless frames. Replay transport
is mocked, not HTTP/browser proof. Log SHA256:
`aaf221a9b5b9d6496bce4beae304613f77d5636c33d9840bf8f2087e085b14f5`.
Client SHA256:
`6319e4292211f848bc38a86f1a2ee60ff096e80520b8dfeeb998445c1c0ef312`.
Source/test and library types, scoped lint, three gateway stub cases and
42-document/740-link checks pass. The worker is terminal/removed; it used
readonly source, no HTTP/published ports and unchanged installed metadata 49.
Bootstrap warnings remain. This is not clean-install or installed-upgrade proof.

A new **974-case full-addon worker is running** on a separate synthetic copy
using this same immutable candidate-68 source. Its planned unique case count and
no-HTTP/no-published-port configuration are verified, not its final outcome.
The completed 938-case candidate-65 proof is older-source evidence only.

Still required: global reservation/preparation, operation editing, validation,
returns/cancellation and their durable UI/recovery; native create/edit, remaining
fields, chains/packages, overview/type choices, full filters/grouping/views,
bulk/print and the wider role/configuration matrix. Actual HTTP/browser/layout,
IndexedDB/multi-tab/concurrency, scale, current full regression and rollout remain
separate gates. Review stays closed; no build/server, installed upgrade or deployment.

## Candidate 67 global details, 19 October 2026

The signed-in list now opens the selected native transfer directly, without a
sales-order identifier. [InventoryTransferDetails](../../apps/home/src/components/Billing/InventoryTransferDetails.tsx)
loads its header/snapshot before requesting move and operation pages in parallel.
Both must match the header, timezone, version and actual cursor position. A
rejected or mismatched page hides both tables and cached identifiers; reload
starts a fresh scope, not a stock mutation. Native cursors are retained for back
navigation, including gaps in IDs. Keyboard paging restores focus when Next
becomes disabled, and returning to the list restores the transfer opener.

### Two additional fixed read APIs

- `stock.picking.qorlia_inventory_transfer_load(transfer_id)` returns only
  `read_only`, `transfer` (header plus move/operation counts), `version` and
  `timezone`.
- `stock.picking.qorlia_inventory_transfer_detail_page(transfer_id, section,
  after=0, version=False, limit=50)` adds `section`, `after`, `position`,
  `total_count`, `next_after` and `rows`. Sections are `moves` or `operations`,
  limits are 1 to 100, and later cursors require the original version and a real
  row belonging to that transfer section. The UI uses pages of 50.

The [native implementation](qorlia_billing_ui/models/stock_inventory.py) checks
Stock User/Manager, model/field/record rights and the active transfer company.
It checks every linked move, operation and batch in fixed ID batches before
returning a detail page, with no legacy 500-move/2,000-operation truncation.
Hidden linked rows or labels reject the complete detail scope; this is not the
same as record-rule filtering in a global browse list. Cross-transfer operation
links reject rather than being repaired or silently included.

The read version binds selected rows, rendered dependencies/labels, author,
active companies, groups, language/timezone and access configuration. Unrelated
transfer edits do not invalidate it. It is a read snapshot, **not a save/recovery
proof**: downstream chains, full inventory/configuration and actual native write
effects still require their own purpose-bound complete reviews. No fake order,
`sudo`, permission grant, generic query or caller-context bypass is introduced.
Complete scope checks remain linear and retain complete recordsets; bounded
response pages do not prove bounded total ORM cache, CPU or hospital latency.

Global moves omit Sales line data entirely, including when the Stock User lacks
Sales access. Existing order-linked projections retain their default `order_line`
field. [Shared tables](../../apps/home/src/components/Billing/StockTransferTables.tsx)
now render both workspaces with the same design-system/layout/focus conventions.
Only the existing order workspace supplies reviewed action callbacks. Global
details have no edit/save/cancel/validate controls. Quantities retain native
units; recorded done is not proof of physical movement. Header dates use the
labelled account timezone; batch expiry remains explicitly labelled UTC.

### Candidate 67 verification

- Home passes **1,553 cases/102 suites**: 14 new detail-client cases (including
  both sections' invalid-payload contexts), 11 detail-component cases and the
  new list/open/return focus case. Existing order-detail navigation/action tests
  still pass after shared-table extraction. Source/test and library types,
  scoped lint and three gateway stub cases pass. Basic axe/focus checks are DOM
  evidence, not actual browser/layout acceptance.
- **50 unique native cases pass, zero failures/errors/skips**: nine inventory
  browse cases, 16 global-detail cases and 25 existing order-reader cases. They
  include complete 501-move/2,001-operation reads, stock-only access without Sales,
  empty transfers, hidden tail moves/operations/lot/owner/product, field denial,
  cross-transfer links, stale quantities/batch/labels, author/timezone/policy
  binding, active/inactive companies and unchanged unrelated transfer scope.
- All **106 Python hashes** match the immutable package. All **132 guarded
  tables** remain unchanged, with mandatory analytics/SMS enabled. Independent
  post-worker committed SQL counts/full-row hashes match the pre-worker baseline.
- The matching actual client accepts **72 captured native JSON responses across
  all three inventory APIs**, replay transport mocked. Log SHA256:
  `02b97f7aa25b62084f1205086f1afa42e13fcaffa6fc7388b63ef544fe04e486`.
  Client SHA256:
  `95afa8f0c1db1c3c0639c75708ad66281346b9fb616fb8da1aeefea8707669fe`.
- Native workers use readonly source, `--no-http`, no published ports and
  unchanged installed metadata 49. Bootstrap warnings remain recorded; this
  is not a clean install, installed upgrade or HTTP/browser/release acceptance.

Still required: global reviewed confirmation/reservation/operation editing/
validation/return/cancellation and exact durable recovery; native create/edit,
remaining form fields, chains/packages, type choices/overview, full filtering,
grouping, alternate views, bulk/print and the wider permission/configuration
matrix. Source-matched full regression, actual transport/browser/layout,
IndexedDB/multi-tab/concurrency, scale and approved rollout remain separate.
The earlier 928-case source-64 proof and still-running 938-case source-65 worker
do not include this source. Review remains closed; no build/server/deployment.

## Candidate 66 browse checkpoint, 19 October 2026

The signed-in Billing workspace now has an **Inventory transfers** tab in source.
It reads receipts, deliveries and internal transfers without requiring a charge
order, including native empty transfers. This is the first global inventory read
flow, not completion of Inventory or permission to reopen review access. No
frontend build/server, actual HTTP/browser review, installed upgrade, hosted
tester or production deployment is included.

## Native contract and request path

The inspected native `stock.all_picking` menu opens
`stock.action_picking_tree_all` on `stock.picking` without a sales-order domain.
Stock User/Stock Manager can access it. Native search uses transfer name/origin;
Waiting includes both `confirmed` and `waiting`. Native Inventory also has an
operation-type overview, more filters, grouping and other views, not silently
equated to the smaller list now implemented.

1. [BillingPage](../../apps/home/src/components/Billing/BillingPage.tsx) mounts
   [InventoryTransfersPanel](../../apps/home/src/components/Billing/InventoryTransfersPanel.tsx)
   only after Billing sign-in and selection of the fifth Billing tab.
2. [The typed client](../../apps/home/src/components/Billing/billingService.ts)
   calls `getInventoryTransfers(search, operation, state, offset)`.
3. The [protected gateway](../../scripts/review-host/server.cjs) permits only
   `/web/dataset/call_kw/stock.picking/qorlia_inventory_transfers` for this flow.
   Review, clinical/native sessions, exact model/method, empty args and no caller
   context remain required. Raw stock search/write/cancel/validate routes stay
   closed. Gateway tests use temporary stubs, not a reopened review service.
4. [The native reader](qorlia_billing_ui/models/stock_inventory.py) uses ORM
   search, record rules, model/field rights, active companies and native ordering.
   No `sudo`, order link, stock adjustment or caller-supplied domain is used.

The four keyword arguments are `search` (trimmed, at most 160 characters, native
name/origin `ilike`), `operation` (`all`, `incoming`, `outgoing`, `internal`),
`state` (`all`, `draft`, `waiting`, `assigned`, `done`, `cancel`) and `offset`
(nonnegative bounded integer). Pages contain at most 25 rows. Waiting is a native
combined filter, not a new state written to a transfer.

The response contains `read_only`, echoed `filters`, `offset`, `next_offset`,
`total_count`, `timezone` and `rows`. Headers reuse the permission-checked native
reference, actual state, operation type, contact, locations, scheduled/completed
dates, origin, company and backorder projection. Native UTC date values are
formatted in the supplied account/context timezone, which the UI labels.

Global browse follows native record-rule filtering: hidden transfers are absent
from rows and counts. Complete linked-order/effect reviews must instead reject
hidden dependencies rather than silently omit them. Unreadable referenced labels
still reject without disclosing names. Denied/expired refreshes hide stale rows
and offer retry/reconnection, not a successful empty-list message. Account and
filters are in the query key. Paging is current inventory, not a signed write
review or a stable multi-page snapshot.

## Design and verification

The panel reuses existing design-system inputs/buttons, Billing layout tokens,
state labels and focusable horizontally scrollable tables. No dependency/global
style was added. Status filters are labelled form controls, not row actions.
Search, clear, refresh and pagination do not change stock.

- Home passes **1,527 cases/100 suites**, including 14 inventory-client cases,
  six panel cases and two new sign-in/tab cases. Source/test and library types
  and scoped lint pass. Basic axe checks pass; browser layout/keyboard acceptance
  remains separate.
- **Nine unique native cases pass, zero failures/errors/skips**: real menu and
  stock-only access without Sales privileges; three unlinked operation types and
  read-only preservation; 56-row native ordering/paging; reference/origin search;
  actual confirmed/waiting moves; hidden-row counts; nonstock/portal rejection;
  invalid filters; and active-company scope for an actor authorised for both.
- All **106 Python hashes** match the immutable native package. All **132 guarded
  tables** are preserved after rollback, with mandatory analytics/SMS enabled.
  Independent post-worker committed SQL counts/full-row hashes match the
  pre-worker baseline for all 132 tables.
- The matching actual client accepts **15 captured native JSON responses**;
  replay transport is mocked. Log SHA256:
  `1c517940b1e61861cf9f407820b0c6a6b4ff85bc0ea8ae58126a4961de020bd0`.
  Client SHA256:
  `88fd8022f85dc979ac6fcf3aa9cf8b717e7f0ca4abddb064c7bc9099b362b6bf`.
- Native workers use readonly source, `--no-http`, no published ports and
  unchanged installed metadata 49. Recorded pandas-bootstrap/wkhtmltopdf warnings
  remain; this is not a clean-install result.

The [928-case candidate-64 regression](STOCK_CANCELLATION.md#candidate-64-full-regression-completed-19-october-2026)
is separate earlier-source evidence. The candidate-65 938-case full regression
is running on its own immutable package/database copy, without this candidate-66
reader. Do not sum overlapping suites or call either current whole-product or
runtime/browser acceptance.

## Remaining work at candidate 66

- Global transfer detail/move/operation pages and actual operation-type choices.
- Order-independent confirmation, reservation, operation editing, validation,
  returns and cancellation, with exact purpose/company/author/transfer-bound
  review and durable recovery. Existing order-scoped protocols remain unchanged:
  never invent an order ID, attach an unrelated order or use a context bypass.
- Native create/edit/duplicate, receipts/purchases, picking-type overview,
  packages/lots, product/partner/type and personal/date/late/backorder/activity
  filters, grouping, alternate views, printing and bulk actions.
- Matching full regression, broader field/related-record/role/configuration
  matrix, actual transport/browser/IndexedDB/reload/concurrency, representative
  scale, accessibility/layout and approved rollout.

This read increment does not redefine Inventory completion. Billing-first and
whole-system one-to-one parity remain the objective. Review stays closed.
