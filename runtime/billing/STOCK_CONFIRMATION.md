# Native stock confirmation integration

[Billing adapter](README.md) · [Architecture](../../docs/architecture.md) · [Parity ledger](../../docs/FEATURE_PARITY.md)

Source adapter 44 adds native confirmation load and rollback-preview methods. It is not a released confirmation workflow: `write_ready=false`, with no save, receipt/status recovery or React control yet. The protected tester still uses adapter 43 and its preparation/operation editor, not this source checkpoint.

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

1. Complete scoped concurrent locking and recheck the same native dependencies before applying. A changed vendor, rule or replenishment requirement needs a new review.
2. Match saved effects against the canonical review while returning real saved identities, references and creation timestamps. Scheduling values must not be discarded.
3. Extend exact-request receipt/recovery and the existing durable browser slot. An uncertain confirmation must not start a second procurement request.
4. Add strict TypeScript response validation and named gateway routes. The source methods are not currently permitted by the protected gateway.
5. Use house controls and native visibility, with explicit review/save, errors, reconnect, status recovery and authoritative parent reload. Render native text safely, not arbitrary audit HTML.
6. Verify actual HTTP and protected browser save/reload, stale rules/vendors/inventory, denied roles/companies, concurrent confirmation and rollback. Native transfer validation, immediate/backorder/Bahmni wizards and returns are subsequent workflows, not substitutes for confirmation.

## Contract tests

[Native confirmation tests](qorlia_billing_ui/tests/test_stock_confirmation_contract.py) exercise the installed engine, including chain creation and preview rollback. They are deliberately separate from reservation and operation API tests. They do not prove that a new confirmation API, concurrency protection, receipt or React control exists.

Run them using the approved isolated native test environment. No production credentials, database dump or private runner belongs in this repository. Test fixtures are `QorliaQA` synthetic records and use reserved `.invalid` email addresses. A passing native contract is the baseline for implementation, not whole-product release approval.

The focused confirmation contracts run with staging analytics mandatory. Older financial regression fixtures assume optional analytic allocation; their combined harness must use a separate database copy, not relax the running tester database. That harness is not proof that every financial fixture works under a mandatory hospital configuration. Keep configuration-specific native acceptance separate.
