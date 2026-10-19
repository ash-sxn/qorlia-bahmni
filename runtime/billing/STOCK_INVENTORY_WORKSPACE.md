# Global inventory transfer workspace

[README](../../README.md) · [Billing](README.md) · [Order transfer details](STOCK_TRANSFER_DETAILS.md) · [Cancellation](STOCK_CANCELLATION.md)

## Candidate 66, 19 October 2026

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

## Remaining work, not replaced by this list

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
