# Native stock confirmation integration

[Billing adapter](README.md) · [Architecture](../../docs/architecture.md) · [Parity ledger](../../docs/FEATURE_PARITY.md)

Source adapter 45 adds native confirmation save/status to the adapter 44 load/rollback-preview foundation. It is not a released browser confirmation workflow. The protected tester still uses adapter 43 and its preparation/operation editor, not this source checkpoint.

## 15 October save/status source checkpoint

`qorlia_confirmation_save(payload)` and `qorlia_confirmation_status(payload)` accept exactly `order_id`, `transfer_id`, `version`, `review_version` and a canonical UUID `request_key`. The receipt binds the exact payload, caller and company selection. A confirmed retry returns its receipt and current readable native state without re-running procurement. Receipt fields cannot be forged through create, write, defaults or copy.

Save acquires deterministic native-table locks, repeats the reviewed native preview and compares its HMAC before applying. The actual native effects must also match the signed review inside a savepoint. Failures roll back records/receipts and restore all four callback queues. Created business documents return real permission-checked identities/names; deleted RFQs return unavailable references rather than being recreated. A hidden linked supply document still fails closed under the native order-graph rules.

Native tracking is registered under the caller before sudo-computed state changes. After the action, caller-owned `env.flush_all()` drains pending computations before cursor precommit processing. Odoo's transaction flush otherwise chooses an arbitrary live environment, which caused intermittent administrator attribution in a second audit message. The regression deliberately forces administrator flush while reserving two batches. The fix preserves audit attribution and the signed-effect check; it does not discard author fields from the review.

Twenty-nine focused native cases pass on the separate synthetic copy with mandatory analytics. The combined 620-case suite passes there using the legacy financial fixtures' optional analytics, restored afterward. Earlier failed cancellation-fixture and audit-attribution runs remain in private evidence. These results are native model-method acceptance, not HTTP or browser acceptance.

The [TypeScript service](../../apps/home/src/components/Billing/billingService.ts) validates the four named contracts, identities, native field metadata/values, generated links, private-audit counts and exact receipts. The [service tests](../../apps/home/src/components/Billing/__tests__/stockConfirmationService.test.ts) include native audit pseudo-relations and reject foreign/malformed effects. The [review gateway](../../scripts/review-host/server.cjs) permits only named confirmation methods with its existing gate/session/context restrictions. These are source changes, not a deployment of that gateway or adapter to the tester.

The final mounted/source hashes match. Two simultaneous identical requests on that source return two accepted responses with one receipt and one upstream supply move, using three native RPC attempts after a serialization retry. Four additional synthetic native cases capture sixteen load/preview/save/status responses for manual confirmation, reservation-at-confirmation, make-to-order supply and vendor RFQs. All sixteen pass the actual TypeScript service validator, including native `many2one_reference` audit links. Captured-response checks are not real HTTP or browser acceptance. The independent main-tester snapshot remains unchanged.

`write_ready=true` means the adapter implements the save contract, not that a frontend may skip review or browser recovery. The remaining UI must persist the exact request before HTTP, use the existing per-account stock recovery slot, recover unknown outcomes, safely render native effect text, and reload authoritative state. No confirmation button is released yet.

Known limits: fingerprints/capture scan global native state; save locks are coarse and receipts use per-transfer JSON. The isolated identical-request race exercises Odoo's native RPC retry semantics, not hospital-scale concurrent writers, multi-company throughput or actual HTTP. Refine and measure those limits before a production fulfillment release. Full validation, immediate/backorder/Bahmni wizards, returns, POS and synchronization remain separate work.

## Historical adapter 44 preview checkpoint

The following preview evidence describes the previous read-only source checkpoint. Adapter 45 supersedes its lack of native save/status, not the remaining UI/HTTP/performance gates.

## Implemented review contract

[Source](qorlia_billing_ui/models/stock_confirmation.py) exposes `qorlia_confirmation_load(order_id, transfer_id)` and `qorlia_confirmation_preview(order_id, transfer_id, version)`. The existing saved-order/transfer authorization applies. Client defaults and tracking-control context are removed; only native company selection, language and timezone context are retained.

The version binds the actor, companies, day, transfer graph and SHA-256 fingerprints of native graph, configuration, permission, relation and financial tables. Preview delegates to native `action_confirm()`. Complete graph reads are chunked, not truncated. Changed records retain native readable fields, labels, relation links and typed field metadata. The graph includes stock, stored product `free_qty`, supply orders, audit records and relevant many-to-many links.

New records use symbolic keys so relationships survive rolled-back preview IDs. Native document names, creation/operation timestamps and message identifiers are explicitly marked as assigned on save. Scheduling/deadline dates are preserved. The review includes created, updated and deleted records, including moves merged away by the native engine.

Unreadable business records fail closed. Hidden native audit details are not returned; only change counts are shown. Their canonical effects remain bound to the review through HMAC using the native server signing secret. Portal access tokens and binary content are not displayed. The native signing secret is never returned or committed to source.

Database work rolls back, and pre-commit, post-commit and rollback callback queues are isolated/restored. Existing pending tracking is flushed before the baseline is taken. Native physical stock, financial records and unreviewed configuration are checked, and changed external state rejects the review after rollback.

[Preview tests](qorlia_billing_ui/tests/test_stock_confirmation_preview.py) cover sixteen focused cases on the separate native database copy with mandatory analytics. This is native model-method acceptance, not HTTP/gateway/browser or save acceptance. Global fingerprint/capture cost, full concurrent save locking, complete recovery, additional failure injection and larger multi-company workloads still require work. Do not expose a save button from this contract.

The combined 607-case native suite passes without failures/errors/skips on that separate copy with the legacy financial fixtures' optional analytics, restored afterward. This does not replace configuration-specific financial acceptance. The main tester database's mandatory analytics is not changed for this harness.

## Native action and source

The native stock form calls `stock.picking.action_confirm()` for **Mark as Todo**, with internal-user visibility and `show_mark_as_todo`. An immediate transfer or a non-draft transfer hides this action. Use the native computed rule, not a guessed status predicate.

Reference implementations are [Odoo 16 picking](https://github.com/odoo/odoo/blob/16.0/addons/stock/models/stock_picking.py), [moves](https://github.com/odoo/odoo/blob/16.0/addons/stock/models/stock_move.py), [stock rules](https://github.com/odoo/odoo/blob/16.0/addons/stock/models/stock_rule.py) and [purchase rules](https://github.com/odoo/odoo/blob/16.0/addons/purchase_stock/models/stock_rule.py). The installed Bahmni/Odoo stack is the authority for acceptance, not a moving upstream branch. These effects were exercised on the isolated pinned Odoo 16 image with Qorlia adapter 43.

## Effects the redesigned workflow must preserve

| Native scenario                | Required behaviour                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Manual reservation             | Confirm moves without pretending stock is reserved or delivered.                                                                |
| Reservation at confirmation    | Reserve native stock, batch and units. Recorded done quantity remains separate.                                                 |
| Compatible draft moves         | Native merging can remove a move and change the survivor's demand. Do not assume every original ID survives.                    |
| Preceding move                 | Keep the waiting state and upstream/downstream dependencies.                                                                    |
| Make-to-order with a pull rule | Create the upstream move/transfer and retain links, quantity and locations.                                                     |
| Make-to-order with a buy rule  | Create a vendor RFQ when native routing requires it. This is not invoice posting.                                               |
| Automatic replenishment        | Even make-to-stock confirmation can create supply through an automatic orderpoint.                                              |
| Whole package                  | Native confirmation can generate moves from package contents.                                                                   |
| Push rule                      | Preserve the new downstream transfer and its waiting dependency.                                                                |
| Missing procurement rule       | Display the native failure and roll back partial work.                                                                          |
| Missing sender configuration   | Native move-merge chatter can fail without a sender email. Preserve the error rather than suppressing the native audit message. |

The existing reservation scope and single-transfer graph are not enough to review all these effects. Adding `confirm` to the existing reservation action map without expanding its scope would miss native procurement and chained documents.

## Remaining integration work

1. Refine/measure coarse locking and full-state capture for concurrent hospital-scale and multi-company workloads. A changed vendor, rule or replenishment requirement still needs a new review.
2. Verify the implemented signed effects, native receipts and real saved references through actual HTTP, including creation metadata and scheduling values.
3. Extend the existing durable browser slot for exact confirmation recovery. An uncertain confirmation must not start a second procurement request.
4. Accept the TypeScript/gateway source against actual native HTTP responses and the approved protected runtime. The running tester gateway does not yet permit these new source routes.
5. Use house controls and native visibility, with explicit review/save, errors, reconnect, status recovery and authoritative parent reload. Render native text safely, not arbitrary audit HTML.
6. Verify actual HTTP and protected browser save/reload, stale rules/vendors/inventory, denied roles/companies, concurrent confirmation and rollback. Native transfer validation, immediate/backorder/Bahmni wizards and returns are subsequent workflows, not substitutes for confirmation.

## Contract tests

[Native confirmation tests](qorlia_billing_ui/tests/test_stock_confirmation_contract.py) exercise the installed engine, including chain creation and preview rollback. They are deliberately separate from reservation and operation API tests. They do not prove that a new confirmation API, concurrency protection, receipt or React control exists.

Run them using the approved isolated native test environment. No production credentials, database dump or private runner belongs in this repository. Test fixtures are `QorliaQA` synthetic records and use reserved `.invalid` email addresses. A passing native contract is the baseline for implementation, not whole-product release approval.

The focused confirmation contracts run with staging analytics mandatory. Older financial regression fixtures assume optional analytic allocation; their combined harness must use a separate database copy, not relax the running tester database. That harness is not proof that every financial fixture works under a mandatory hospital configuration. Keep configuration-specific native acceptance separate.
