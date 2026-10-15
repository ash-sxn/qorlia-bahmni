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

An earlier uncompleted return can itself be one of those downstream moves. In the inspected engine, creating a second return unreserves the first. Native remaining quantity subtracts currently reserved units for assigned/partly available returns and product quantity for completed returns. It does not simply subtract every requested return quantity. For example, after delivering five, creating a two-unit return and then a three-unit return leaves the first unreserved, the second reserved for three and a native default of two. Preserve these native effects and defaults rather than displaying an independent cumulative return balance.

## Inspected installed implementation

The audit uses the existing isolated pinned Bahmni/Odoo image, not an assumed latest upstream implementation:

- `stock/wizard/stock_picking_return.py`: default context, picking onchange, remaining quantity, new-transfer creation, chain unreservation and move links.
- `stock/wizard/stock_picking_return_views.xml`: fields, editable rows, role restrictions and chained-operation warning.
- `stock/views/stock_picking_views.xml`: Return is available on Done transfers for internal users; native model ACLs still govern execution.
- `stock_account/wizard/stock_picking_return.py`: quantity-update default and propagation to generated moves.
- Actual merged return view and field metadata under the isolated tester account: `to_refund` exists and defaults true, but is absent from the visible form. The new interface must not silently add an editable quantity-update flag.

These are the installed override classes found by the audit. Different deployments or later module versions need another view/override audit before claiming one-to-one parity.

## Development read, review and exact creation

[Source adapter](qorlia_billing_ui/models/stock_return.py) adds these development methods:

| Method                                                                         | Responsibility                                                                                                                               |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `qorlia_return_load(order_id, transfer_id)`                                    | Verify saved order/transfer and native permissions; reconstruct the native form in memory; return native defaults, graph, reason and version |
| `qorlia_return_locations(order_id, transfer_id, version, query, after, limit)` | Native multi-location role, original-or-return-location company domain, bounded search and cursor paging                                     |
| `qorlia_return_preview(order_id, transfer_id, version, location_id, lines)`    | Verify current form/version and original move identities; execute native creation inside rollback and return its projected effects           |
| `qorlia_return_save(payload)`                                                  | Recheck the signed selection and native effects under locks; create once and store an action/author/company-bound receipt                    |
| `qorlia_return_status(payload)`                                                | Look up that exact request without another creation and return the native created-transfer reference when readable                           |

Each supplied line is exactly `{move_id, quantity}`. Products, units and the hidden quantity-update default come from the original native form. Duplicate/foreign moves, arbitrary extra fields, non-finite/overflowing quantities and out-of-domain locations reject. An account without the native location role cannot override its default location. Versions bind the caller, companies, graph, native configuration and inventory.

Preview uses native `create_returns()`, not a direct copied transfer or status write. It captures business and audit effects using the existing permission-aware projection, including related chain/reservation changes. It rejects unexpected completed/cancelled returns, physical stock movement, financial record changes, changed delivered quantities or unreviewed configuration. The database, transient wizard rows and all four native callback queues must be restored. Deferred work from an earlier action is flushed before taking the baseline; it is not attributed to the return preview.

Candidate source 49 adds signed creation and exact status. Load reports readiness only when a native form is available; a successful preview reports `write_ready=true` with a server-signed `review_version`. This is readiness for return creation, not physical completion or a release claim. The [frontend Billing service](../../apps/home/src/components/Billing/billingService.ts) validates all five contracts. The [protected gateway](../../scripts/review-host/server.cjs) allowlists only those named methods, not raw wizard creation or caller contexts. No return modal or button is enabled yet, and this source is not deployed into a running HTTP tester. Installed database metadata and the existing validation HTTP copy remain 48; the protected hosted tester remains 43. The new source uses existing schema, not a new database migration.

Frontend load validation ties each form row to an original move and its product in the returned transfer graph. Operation IDs, product IDs and original move IDs are different identities. Review responses must echo the exact requested move quantities and location, preserve the native form metadata, and describe an uncompleted return. The shared effect validator checks native field types, references, assigned metadata and permission-filtered counts. Location pages require bounded, strictly ordered native IDs and a consistent continuation cursor. Unexpected fields, malformed relations, an unsigned review or readiness inconsistent with the available form reject rather than enabling a save.

Rollback restores transactional business, transient and audit rows, not PostgreSQL sequence allocation. Native preview may consume reference numbers. The save contract handles execution-assigned references and dates without concealing actual quantity or unexpected schedule changes; do not promise gap-free numbering or reuse a preview's temporary native ID.

## Signed creation and recovery boundary

The exact payload is `{order_id, transfer_id, version, location_id, lines, review_version, request_key}`. The canonical UUID key and finite original-move quantities are checked before native creation. The signature binds the action, version, selected location/rows, native form metadata, public effects, private effects and resulting native state. Versions already bind the original order/transfer, caller, company scope, configuration and stock. Selection changes require a new review, not a new interpretation of an old signature.

Save checks the receipt before and after deterministic native table locks, reconstructs and verifies the review, then executes the native action inside a savepoint and verifies its actual effects. A mismatch rolls back the new return and restores all four callback queues. Receipts use the existing protected `qorlia_validation_receipts` JSON field with a distinct `kind=return`, action-domain digest, author, companies, original order and created native transfer ID. Validation/step receipts are preserved; their namespace cannot become a return receipt. The private field remains unavailable to ordinary stock users and cannot be forged with generic writes. This is existing fixed metadata storage, not elevated stock/accounting access. Coarse locks/per-transfer JSON still need scale work.

Exact retries and status return that same accepted creation instead of creating another. `state_after` is the state at creation, not a claim that the return is currently complete. `return_transfer` identifies the actual readable native return, not the original transfer or a preview ID. Unreadable references are redacted; native original-order/transfer scope can still deny the whole lookup. An unavailable or later-deleted return must not be silently recreated from its accepted request.

The native action explicitly assigns return move dates, and recomputes the new picking's schedule from those moves. Only newly created moves linked to the original transfer, with dates inside that execution window, are marked assigned. A new picking's schedule is marked assigned only when it matches the native min/max of those same newly assigned moves. Existing schedules, amounts and out-of-window dates are not normalized away. Return-specific scheduling metadata does not broaden the ordinary validation effect contract.

Native thread mail is queued during the action so force-send does not escape rollback. New outgoing-mail rows reject pending a separately reviewed notification integration; the existing delivery email/SMS validation guard is also propagated. This does not establish acceptance for every external notification addon.

There is still no durable browser return request slot or return editor. The UI must persist the exact request before HTTP, retain it across close/reload/session loss, check the same request on uncertainty, and clear only the exact accepted or definitively rejected request. A native duplicate-safe receipt is necessary but is not browser recovery by itself.

## Initial read/preview source checkpoint, 15 October 2026

- That isolated mandatory-analytics run passes 133 fulfillment/return cases with no failures, errors or skips: 108 existing fulfillment cases plus 12 direct return contracts and 13 return adapter checks. Earlier browser fixture states and receipts are preserved after rollback. Native source/test hashes matched that tested source, before signed creation was added.
- The first focused 22 cases passed after fixing the restricted-role fixture. This installation implies multi-location access through Internal User, so the test models single-location configuration using native group changes inside its rolled-back transaction. It retains the stock/sales roles and tests both permitted default-location preview and denied override. It does not change running staff permissions.
- An initial combined discovery check found duplicate selection caused by directly importing another TestCase class. Importing that fixture through its module fixes discovery. The next 133-case run had one test-helper error because native Odoo's `assertRaises` does not accept an exception tuple. Explicit expected exceptions fix it; the final complete rerun is green. Earlier failures are not reported as passing evidence.
- Fourteen new frontend contract cases pass; all Home tests pass, 710 cases across 75 suites. Nine gateway/configuration cases, Home library types, source-based types for the new test and actual imported service, scoped lint/format and diff checks pass. The documentation checker now includes this contract and verifies 28 contributor documents and 503 local links.
- The actual TypeScript client accepts nine captured native load/location/review payloads across outgoing, partial-delivery and incoming fixtures. Each native preview restores its initial form/version and the complete transactional-row fingerprint. This is actual native payload compatibility through the service, not live HTTP or browser acceptance.
- Independent read-only assertions after the native runs/capture preserve the earlier completed full/immediate/partial/receipt fixtures, their receipts, native stock/valuation and protected stored accounting. The hosted adapter-43 tester separately matches its original stock, delivery, accounting and preparation/operation baseline. These SQL checks do not independently recalculate computed invoice totals.
- These are native, source and local gateway-harness checks, not new browser or real gateway-to-native HTTP acceptance. No return editor, create/status recovery or matching protected release exists yet. No new frontend build or full legacy addon run is claimed. Known native startup warnings and the bootstrap's unsuccessful optional pandas installation remain outside these passing workflow assertions.

## Signed creation source checkpoint, 15 October 2026

- The focused run passes 36 native return cases with mandatory analytics and no failures/errors/skips, preserving earlier browser states/receipts. This adds eleven create/status checks, including stable review across clocks, exact replay, changed/stale/malformed request rejection, author/namespace isolation, private receipt protection, actual-effect/callback rollback, unexpected scheduling, incoming creation and chained downstream unreservation.
- The initial 35-case run had one fixture failure: the stock user could not create the synthetic `mail.mail` used to exercise the guard. Giving that test the existing administrator context proves the mail guard without changing product ACLs. The subsequent 36-case run is green; no earlier failure is counted as a pass.
- The final combined native run passes 144 cases with mandatory analytics and no failures/errors/skips, preserving earlier browser states/receipts. This includes the 36 return cases and 108 prior fulfillment cases. Candidate native source/test hashes match the tested worktree.
- The frontend return suite has nineteen cases; all Home tests pass, 715 cases/75 suites. Scoped actual-source test/library types, lint/format and nine gateway/configuration checks pass. Native source 49 is loaded only in disposable non-HTTP test processes, not installed as a tester release. Captured native save/status payload compatibility is separate from these regression checks.
- Three additional synthetic native save scenarios (outgoing, incoming and chained) pass while capturing real load/review/create/status results. The actual TypeScript client accepts all thirteen captured responses, including an unknown request and accepted transfer references. This is actual native response compatibility, not live HTTP or browser acceptance.
- Independent read-only checks after the runs/capture preserve earlier stock/valuation/receipt fixtures and protected stored accounting. The hosted adapter-43 baseline separately remains unchanged, and the local gate returns 410 without renewal. These SQL checks do not independently recalculate computed invoice totals. The contributor check verifies 28 documents/504 local links. No frontend build or full legacy addon run is claimed for this source increment.

## Return lifecycle regression scope, 15 October 2026

Eight additional source regressions cover native-to-adapter behaviour beyond creation:

- Separate atomic validation of an actual API-created return receives two units, reduces delivered quantity by two and produces one native manual valuation, without a credit note, payment or reconciliation. Exact validation and creation retries retain their original receipts and transfer.
- Standard-cost automatic validation creates one posted balanced native journal with analytic entries under mandatory analytics, not a customer financial refund.
- Per-RPC step validation opens the real receipt prompt, consumes it once, completes the same return and rejects a new nonce against the consumed prompt. Atomic compatibility and current step behaviour are distinct checks.
- A cancelled return remains cancelled when its creation request is replayed. A later-deleted synthetic return is reported unavailable and is not recreated from its accepted receipt.
- Revoking access to the original transfer denies both status and replay without another creation. Receipt ownership does not bypass current native permissions.
- Direct native and adapter cases verify the second-return unreservation/default behaviour described above. Preview must preserve the first reservation until Save; two explicitly reviewed creations remain two native transfers and old replay creates nothing.

These are native transaction tests, not real HTTP calls, browser recovery or publication. The native implementation is unchanged source 49; tests do not upgrade either running HTTP copy. The owner has asked to keep the expired local review gate closed and continue backend work. Existing frontend test/build results above are historical, not rerun evidence for this test-only increment.

The final combined isolated run passes 152 selected native fulfillment/return cases, with mandatory analytics, zero test failures/errors/skips and earlier browser fixture states/receipts preserved. This comprises 108 existing fulfillment cases and 44 return cases. Native source and the changed test hashes match the executed snapshot. The initial 150-case run had one wrong test expectation: zero remaining instead of the native two after the second creation. The installed implementation confirmed prior-return unreservation. Correcting the expectation, adding the direct native case and including per-step completion produced the final green run; the initial failure is not counted as a pass.

Independent read-only checks after the run preserve the completed delivery/backorder/receipt fixtures, original stock, valuation, earlier receipts and protected stored accounting. The hosted adapter-43 baseline separately remains unchanged. These SQL checks do not independently recalculate computed invoice totals. Nine gateway/configuration checks and the 28-guide/505-local-link contributor check pass. The actual expired gate returns 410 without renewal. There is no new Home test run/build, full legacy addon run, live HTTP/browser acceptance, separate-transaction concurrency proof or protected publication. Known bootstrap/native warnings remain outside the selected passing test assertions.

## Acceptance requirements still to finish

- Complete the independently tested native form/preview contract, including company/role, units, partial/over-return and chained-operation behaviour.
- Add durable browser recovery around the existing duplicate-safe creation/status contract. A lost response must recover the same created return rather than create another.
- Verify the strict save/status client against actual native HTTP and protected gateway behavior, not only model responses and simulated endpoints. Never expose arbitrary transient-wizard writes or caller-supplied contexts.
- Implement consistent React return review, location search, keyboard/focus/empty/error states and native effect display in the existing signed-in transfer screen.
- Show and reopen the actual created transfer in its original order, including after reload. Its physical preparation/validation remains a separate action.
- Verify HTTP and browser create/reload/lost-response/permissions paths, incoming/outgoing/chained and valuation configurations, source/runtime consistency and protected publication. External notifications, scale and full Billing remain separate open gates.

## Test sources

- [Direct native contracts](qorlia_billing_ui/tests/test_stock_return_contract.py): native Form defaults, partial/base units, creation versus completion, quantity-update semantics, cancelled/reserved/completed returns, native over-return, automatic valuation and downstream unreservation.
- [Adapter read/preview checks](qorlia_billing_ui/tests/test_stock_return_preview.py): native defaults, rollback, callbacks, stale inventory, bounded location roles/domain, invalid identities/values and hidden dependencies.
- [Native create/status checks](qorlia_billing_ui/tests/test_stock_return_save.py): exact-once linked creation, state/reference recovery, stable dates, namespaces/permissions, changed effects, notification rejection, chained unreservation and integration with atomic/per-step completion, valuation and later cancellation/deletion/access changes.
- [Frontend return contracts](../../apps/home/src/components/Billing/__tests__/stockReturnService.test.ts): strict native form/move association, unchanged review selection, bounded location pages, malformed payload rejection and native error propagation.
- [Gateway tests](../../scripts/review-host/server.test.cjs): five named return APIs behind review/clinical gates, isolated ERP cookies, body/method/context restrictions and rejection of raw return-wizard writes.

Read the newest dated parity/readiness entry for actual test results. A source test's existence does not establish that it passed, and native tests are not browser acceptance. Synthetic test fixtures run transactionally on the isolated copy and must leave earlier browser receipts and protected data intact.
