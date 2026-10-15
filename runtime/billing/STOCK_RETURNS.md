# Native stock returns

[Billing adapter](README.md) · [Validation](STOCK_VALIDATION.md) · [Architecture](../../docs/architecture.md) · [Parity ledger](../../docs/FEATURE_PARITY.md)

This is an unfinished integration, not a released return control. The objective is the complete native return workflow in Qorlia, followed by its existing stock preparation and validation controls. A read/preview endpoint is not a substitute for return creation, recovery or physical receipt.

## Native workflow and ownership

```text
Completed original transfer
  -> native Reverse Transfer form
  -> original moves, remaining quantities in product base units, return location
  -> create a new linked return transfer, confirm it and attempt reservation
  -> separately review/edit its detailed operations and batches
  -> separately validate the return transfer
  -> native stock, delivered/received quantities and valuation/accounting effects
```

Creating the return is not validating it. It does not by itself receive stock, reduce the original order's delivered quantity, generate a credit note or refund money. The native `to_refund` field means updating delivered/received quantities on the associated SO/PO when the return is completed. It is not a payment instruction.

The installed form exposes original products, editable quantities, product base units for the appropriate role, a chained-operation warning and a role-controlled return location. It does not allow creating arbitrary new product rows. Rows refer to original native moves, not product IDs or UI positions. Native defaults account for already reserved/completed returns and ignore cancelled returns. A partial delivery's uncompleted backorder is not part of its returnable completed move.

Do not invent a cap equal to the default quantity: the installed native engine can create a return with a larger entered quantity. Do not impose a second unit-conversion or valuation formula in the browser. Follow native validation and show its result or rejection.

Native return creation can also unreserve unfinished downstream moves. That is a reviewable business effect even though physical stock has not moved. The chained-operation warning belongs to the form's onchange state; its read-only value need not persist on the saved transient wizard. Reading only that saved transient would lose the warning shown to the native user.

## Inspected installed implementation

The audit uses the existing isolated pinned Bahmni/Odoo image, not an assumed latest upstream implementation:

- `stock/wizard/stock_picking_return.py`: default context, picking onchange, remaining quantity, new-transfer creation, chain unreservation and move links.
- `stock/wizard/stock_picking_return_views.xml`: fields, editable rows, role restrictions and chained-operation warning.
- `stock/views/stock_picking_views.xml`: Return is available on Done transfers for internal users; native model ACLs still govern execution.
- `stock_account/wizard/stock_picking_return.py`: quantity-update default and propagation to generated moves.
- Actual merged return view and field metadata under the isolated tester account: `to_refund` exists and defaults true, but is absent from the visible form. The new interface must not silently add an editable quantity-update flag.

These are the installed override classes found by the audit. Different deployments or later module versions need another view/override audit before claiming one-to-one parity.

## Development read and rollback preview

[Source adapter](qorlia_billing_ui/models/stock_return.py) adds these development methods:

| Method                                                                         | Responsibility                                                                                                                               |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `qorlia_return_load(order_id, transfer_id)`                                    | Verify saved order/transfer and native permissions; reconstruct the native form in memory; return native defaults, graph, reason and version |
| `qorlia_return_locations(order_id, transfer_id, version, query, after, limit)` | Native multi-location role, original-or-return-location company domain, bounded search and cursor paging                                     |
| `qorlia_return_preview(order_id, transfer_id, version, location_id, lines)`    | Verify current form/version and original move identities; execute native creation inside rollback and return its projected effects           |

Each supplied line is exactly `{move_id, quantity}`. Products, units and the hidden quantity-update default come from the original native form. Duplicate/foreign moves, arbitrary extra fields, non-finite/overflowing quantities and out-of-domain locations reject. An account without the native location role cannot override its default location. Versions bind the caller, companies, graph, native configuration and inventory.

Preview uses native `create_returns()`, not a direct copied transfer or status write. It captures business and audit effects using the existing permission-aware projection, including related chain/reservation changes. It rejects unexpected completed/cancelled returns, physical stock movement, financial record changes, changed delivered quantities or unreviewed configuration. The database, transient wizard rows and all four native callback queues must be restored. Deferred work from an earlier action is flushed before taking the baseline; it is not attributed to the return preview.

These methods intentionally report `write_ready=false`. There is no signed save/status receipt contract or return recovery record yet. The [frontend Billing service](../../apps/home/src/components/Billing/billingService.ts) validates the native load, bounded locations and review responses. The [protected gateway](../../scripts/review-host/server.cjs) allowlists only those three named methods, not raw wizard creation, caller contexts or unimplemented save/status. No return modal or button is enabled yet, and this source is not deployed into a running tester. The installed adapter version remains 48 on the isolated validation copy and 43 on the protected hosted tester. This source increment does not require or claim a database migration, new build, runtime upgrade or release.

Frontend load validation ties each form row to an original move and its product in the returned transfer graph. Operation IDs, product IDs and original move IDs are different identities. Review responses must echo the exact requested move quantities and location, preserve the native form metadata, and describe an uncompleted return. The shared effect validator checks native field types, references, assigned metadata and permission-filtered counts. Location pages require bounded, strictly ordered native IDs and a consistent continuation cursor. Unexpected fields, malformed relations and a premature `write_ready=true` reject rather than enabling a save.

Rollback restores transactional business, transient and audit rows, not PostgreSQL sequence allocation. Native preview may consume reference numbers. A later save contract must handle execution-assigned references and dates without concealing actual schedule or quantity changes; do not promise gap-free numbering or reuse a preview's temporary native ID.

## Native and frontend source checkpoint, 15 October 2026

- The final isolated mandatory-analytics run passes 133 fulfillment/return cases with no failures, errors or skips: 108 existing fulfillment cases plus 12 direct return contracts and 13 return adapter checks. Earlier browser fixture states and receipts are preserved after rollback. The tested native return source/test hashes match this worktree.
- The first focused 22 cases passed after fixing the restricted-role fixture. This installation implies multi-location access through Internal User, so the test models single-location configuration using native group changes inside its rolled-back transaction. It retains the stock/sales roles and tests both permitted default-location preview and denied override. It does not change running staff permissions.
- An initial combined discovery check found duplicate selection caused by directly importing another TestCase class. Importing that fixture through its module fixes discovery. The next 133-case run had one test-helper error because native Odoo's `assertRaises` does not accept an exception tuple. Explicit expected exceptions fix it; the final complete rerun is green. Earlier failures are not reported as passing evidence.
- Fourteen new frontend contract cases pass; all Home tests pass, 710 cases across 75 suites. Nine gateway/configuration cases, Home library types, source-based types for the new test and actual imported service, scoped lint/format and diff checks pass. The documentation checker now includes this contract and verifies 28 contributor documents and 503 local links.
- The actual TypeScript client accepts nine captured native load/location/review payloads across outgoing, partial-delivery and incoming fixtures. Each native preview restores its initial form/version and the complete transactional-row fingerprint. This is actual native payload compatibility through the service, not live HTTP or browser acceptance.
- Independent read-only assertions after the native runs/capture preserve the earlier completed full/immediate/partial/receipt fixtures, their receipts, native stock/valuation and protected stored accounting. The hosted adapter-43 tester separately matches its original stock, delivery, accounting and preparation/operation baseline. These SQL checks do not independently recalculate computed invoice totals.
- These are native, source and local gateway-harness checks, not new browser or real gateway-to-native HTTP acceptance. No return editor, create/status recovery or matching protected release exists yet. No new frontend build or full legacy addon run is claimed. Known native startup warnings and the bootstrap's unsuccessful optional pandas installation remain outside these passing workflow assertions.

## Acceptance requirements still to finish

- Complete the independently tested native form/preview contract, including company/role, units, partial/over-return and chained-operation behaviour.
- Bind a signed review to the exact location and original-move quantities. Recheck native state and actual effects on save; label execution-assigned references/dates without hiding real scheduling or amounts.
- Add duplicate-safe creation receipts, status lookup and durable browser recovery. A lost response must recover the same created return rather than create another.
- Extend the existing strict frontend response contracts and named gateway endpoints to the exact signed save/status contract. Never expose arbitrary transient-wizard writes or caller-supplied contexts.
- Implement consistent React return review, location search, keyboard/focus/empty/error states and native effect display in the existing signed-in transfer screen.
- Show and reopen the actual created transfer in its original order, including after reload. Its physical preparation/validation remains a separate action.
- Verify HTTP and browser create/reload/lost-response/permissions paths, incoming/outgoing/chained and valuation configurations, source/runtime consistency and protected publication. External notifications, scale and full Billing remain separate open gates.

## Test sources

- [Direct native contracts](qorlia_billing_ui/tests/test_stock_return_contract.py): native Form defaults, partial/base units, creation versus completion, quantity-update semantics, cancelled/reserved/completed returns, native over-return, automatic valuation and downstream unreservation.
- [Adapter read/preview checks](qorlia_billing_ui/tests/test_stock_return_preview.py): native defaults, rollback, callbacks, stale inventory, bounded location roles/domain, invalid identities/values and hidden dependencies.
- [Frontend return contracts](../../apps/home/src/components/Billing/__tests__/stockReturnService.test.ts): strict native form/move association, unchanged review selection, bounded location pages, malformed payload rejection and native error propagation.
- [Gateway tests](../../scripts/review-host/server.test.cjs): review/clinical gates, isolated ERP cookies, body/method/context restrictions and rejection of raw return-wizard writes and unimplemented return save/status.

Read the newest dated parity/readiness entry for actual test results. A source test's existence does not establish that it passed, and native tests are not browser acceptance. Synthetic test fixtures run transactionally on the isolated copy and must leave earlier browser receipts and protected data intact.
