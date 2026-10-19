# Native stock returns

New [native lifecycle coverage](RETURN_PAGED_WRITE.md#native-return-to-receipt-lifecycle-coverage-19-october-2026)
joins complete creation, operation/preparation and separate physical receipt,
including partial/backorder, valuation and 501-move cases. Its initial five-case
snapshot passed; the current 898-case native regression remains in progress.
Keep the tested source/configuration and remaining HTTP/browser gates separate.

Current [complete native creation/recovery source](RETURN_PAGED_WRITE.md)
connects the matching full-review writer and compact recovery/stop/reference
protocol without the older graph/selection caps. The matching
[React consumer](RETURN_PAGED_WRITE.md#react-complete-return-consumer-source-19-october-2026)
now connects form/review, durable exact recovery, all references and separate
physical-validation handoff. This is not a runtime upgrade or complete Billing acceptance.

Later [complete form/review source](RETURN_PAGED.md) adds compact native load,
all original form-line pages, pinned location search and sequential rollback
review beyond the old graph cap. It deliberately has no new writer/UI yet and
does not change the earlier protocols described below.

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

Candidate source 49 adds signed creation and exact status. Load reports readiness only when a native form is available; a successful preview reports `write_ready=true` with a server-signed `review_version`. This is readiness for return creation, not physical completion or a release claim. The [frontend Billing service](../../apps/home/src/components/Billing/billingService.ts) validates all five contracts. The [protected gateway](../../scripts/review-host/server.cjs) allowlists only those named methods, not raw wizard creation or caller contexts. No return modal or button is enabled yet. A separate non-public source-49 database/runtime has now passed the native HTTP checkpoint below and was stopped afterward. The existing validation HTTP copy remains 48 and the protected hosted tester remains 43. The new source uses existing schema, not a new database migration.

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

## Native HTTP client and concurrent return checkpoint, 15 October 2026

A separate private database copy is upgraded to installed adapter 49 with matching source in the same pinned Bahmni/Odoo image. Its copied signing secret and database identity are rotated before use. The HTTP container uses no published ports, read-only root/addons, an unprivileged user and bounded CPU/memory. Operator access uses an SSH Unix-domain diagnostic socket, not a browser-accessible TCP listener or another review gate. The owner-requested closed UI gate is not renewed.

The actual TypeScript Billing service passes native HTTP load, location search, rollback review, create and exact status for three clearly labelled synthetic outgoing, incoming and chained transfers. The service source hash is `603a97c7a447156bca8c8543ca83d2246d31be470f538b8f68c21302e7519253`; the executed return model hash remains `24146e0dc61560ff497c20eb486225c600c093c1b7768fd5bb7be98a69255592`. The diagnostic transport forwards real HTTP responses and cookies through the socket; it does not substitute recorded model results. The trace contains 118 requests, which is a request count, not 118 test cases or browser acceptance.

- Preview leaves the original form/version, physical stock and protected accounting unchanged. Each accepted action creates one linked two-unit return, with no recorded completion, changed delivered quantity or new return valuation. Chained creation performs the reviewed downstream unreservation.
- Two independently authenticated sessions for the same author issue overlapping identical saves, with about 3.4 seconds of overlap. Both recover the same native transfer; independent storage contains one receipt and one linked return. The native server logs a serialization retry condition and both requests resolve through the native RPC handling.
- One real accepted response is deliberately withheld at the diagnostic client-transport boundary before the service caller receives it. The resulting uncertainty is resolved with the identical request's status, then an identical retry, not another nonce. This is controlled transport-boundary recovery, not a browser network-abort test or durable browser storage proof.
- An altered quantity using the accepted nonce is rejected through the service's native action-rejection mapping. Anonymous access and native logout produce session-expired handling. Re-authentication recovers the same accepted transfer. This does not establish every expired-session/permission path.
- Independent read-only SQL verifies each receipt's exact hash, author, companies, order and actual returned ID. It finds exactly one linked return per original, zero completed return units, no return valuation, unchanged original delivered quantities and the expected chained unreservation. All unrelated quant rows and all nonzero physical stock match their baselines. All stored rows in six financial tables match the original copy: moves, move lines, payments, partial reconciliations, analytic lines and bank-statement lines. Computed invoice totals are not independently recalculated by this SQL check.

The native SMS setting stays enabled. Synthetic partners have no phone/mobile/email destination; installed native notification conditions are inspected, not bypassed with `skip_sms` or relaxed on the running tester. This does not accept real external notification delivery. Preparation first stopped on a helper parsing error and an overly strict no-SMS precondition, before any fixture was committed. The corrected preparation preserves the setting and uses contacts without delivery channels. Those preparation attempts are not reported as passed HTTP tests.

The diagnostic sessions are logged out, the SSH socket is closed/removed and the temporary HTTP container is stopped. Its private database and evidence remain for follow-up. The actual UI gate returns 410, original validation-48 and hosted-tester-43 baselines remain unchanged, and no public demo/production deployment occurs. Native startup/optional-package warnings and SSH Unix-socket TCP-option warnings remain distinct from the passing HTTP assertions. No new Home suite/build or full addon run is claimed; the previous 152-case native result is unchanged, not rerun for this evidence-only increment.

Nine source gateway/configuration cases and the 28-guide/505-local-link documentation check pass for this checkpoint. Those gateway harness cases are not actual protected-gateway return writes.

This is actual service-to-native HTTP acceptance through an operator transport, not the protected gateway, React return editor, browser storage/keyboard/layout or a published tester. These remaining boundaries must be verified separately.

## Native HTTP return completion and valuation checkpoint, 15 October 2026

The same private installed-49 copy now verifies the next boundary: API-created returns are prepared through the existing native operation load/onchange/review/save/status methods, then completed through individually reviewed native validation steps. The actual TypeScript service consumes real HTTP responses over the operator-only SSH socket. This is not a React return editor or protected-gateway test.

All four clearly labelled two-unit cases complete with their original batch, zero remaining reservation and one linked return per original:

| Fixture | Warehouse stock | Customer delivered quantity | Return valuation | New return journal | Accepted validation steps |
| --- | --- | --- | --- | --- | --- |
| Customer return, manual valuation | 5 to 7 | 5 to 3 | quantity +2, value +8 | None | 2 |
| Supplier return, manual valuation | 15 to 13 | Remains 0 | quantity -2, value -8 | None | 1 |
| Same-company internal chained return | 5 to 7; output location 5 to 3 | Remains 0 | None in this fixture | None | 2 |
| Customer return, automatic standard-cost valuation | 5 to 7 | 5 to 3 | quantity +2, value +8 | One posted balanced entry with analytics | 2 |

Values are synthetic native company-currency amounts, not prices or an Indian accounting configuration. Native receipt prompts are separate accepted actions; the supplier-return fixture completes in its opening action without inventing a receipt prompt. Operation/onchange and validation previews leave their current physical/financial baselines unchanged. Recorded done quantities are preparation until the final native validation commits.

The automatic fixture uses native inventory adjustment for its ten-unit opening quantity, with a posted opening value of 40 and analytic allocations. Native original delivery then posts -20, and the completed return posts +8. Independent SQL verifies three distinct balanced posted journals, full native analytic distributions under mandatory plan configuration, stock valuation quantity seven/value 28 and a valuation-ledger balance of 28. This checks opening stock as well as the return, rather than beginning with an unvalued direct quantity write. It is a synthetic standard-cost chart, not a production chart/tax migration.

Two authenticated sessions issue overlapping identical terminal saves for the manual customer return and automatic case. They recover the same receipt/references; no duplicate valuation, journal or analytic entries are created. Exact operation/step/create retries remain recoverable after completion. Native creation's `state_after` remains its historical uncompleted state; the actual returned transfer now reads Done through the transfer API. Completed operation forms return read-only rules, fresh-nonce completion attempts reject and the original terminal request remains recoverable for all four cases.

Independent read-only SQL verifies exact operation, creation and per-step hashes, author/company/order binding, one-time continuation consumption and one terminal receipt per return. It verifies quantity, batch, reservation, delivered progress and valuation/journal links rather than trusting the client result. Manual cases leave all six stored financial-table baselines unchanged. The automatic fixture adds only its opening/delivery/return entries and their lines/analytics; every earlier stored financial/quant row is preserved. No payment, reconciliation or bank line is created. Unrelated original-copy valuation/quant rows also match. Computed invoice totals are not independently recalculated by these SQL checks.

Mandatory analytics and the enabled native SMS setting remain unchanged. Synthetic contacts still have no external delivery destination, and no skip-SMS/native validation bypass is used. Sessions and the diagnostic socket are closed and the temporary HTTP container stopped afterward. Original validation-48 and hosted-tester-43 baselines remain unchanged, and the UI gate stays 410. Known native/SSH warnings remain distinct from the passing assertions. No product code, runtime version, frontend build, Home suite or full-addon regression change/run is claimed; the earlier source-49 unit results retain their dated scope.

Nine source gateway/configuration cases and the 28-guide/505-local-link documentation check pass. They are not actual protected-gateway return writes. These core HTTP cases do not establish broader valuation/currency/package/role/expiry/notification configurations, browser storage/focus/layout, actual protected-gateway return acceptance or publication. Order-transfer paging also remains unfinished: the current order-deliveries endpoint rejects more than 100 transfers. Full Billing and whole-product parity remain open.

## Acceptance requirements still to finish

- Complete the independently tested native form/preview contract, including company/role, units, partial/over-return and chained-operation behaviour.
- Add durable browser recovery around the existing duplicate-safe creation/status contract. A lost response must recover the same created return rather than create another.
- Finish the wider native HTTP error/configuration matrix and actual protected-gateway return acceptance. The initial service/native HTTP scenarios above do not accept the gateway boundary. Never expose arbitrary transient-wizard writes or caller-supplied contexts.
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
