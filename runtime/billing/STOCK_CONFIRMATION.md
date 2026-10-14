# Native stock confirmation integration

[Billing adapter](README.md) · [Architecture](../../docs/architecture.md) · [Parity ledger](../../docs/FEATURE_PARITY.md)

This is the contract for the next fulfillment workflow, not a released confirmation API. The current protected React build supports preparation and operation editing. It does not yet expose native Mark as Todo, transfer validation or returns.

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

## Required implementation work

1. Trace installation overrides and configuration: reservation mode, units, routes/rules, warehouse, vendor choices/prices, orderpoints, packages and relevant native role/company rules.
2. Review affected moves, operations, reservations, dependency links, new/merged transfers and any new or amended vendor RFQ. Keep the native action, including its audit behaviour.
3. Bind the review to the actor/company, current native configuration and affected records. Lock and recheck the same dependencies before applying. A changed vendor, rule or replenishment requirement needs a new review.
4. Normalize newly created IDs for preview versus save comparison, without discarding document identities or links. Display units, quantities and procurement effects accurately.
5. Roll preview database changes and callback queues back. Do not use a separate committing scheduler cursor for a preview.
6. Extend exact-request receipt/recovery and the existing durable browser slot. An uncertain confirmation must not start a second procurement request.
7. Use house controls and native visibility, with explicit review/save, errors, reconnect, status recovery and authoritative parent reload.
8. Verify actual API and protected browser save/reload, stale rules/vendors/inventory, denied roles/companies, concurrent confirmation and rollback. Native transfer validation, immediate/backorder/Bahmni wizards and returns are subsequent workflows, not substitutes for confirmation.

## Contract tests

[Native confirmation tests](qorlia_billing_ui/tests/test_stock_confirmation_contract.py) exercise the installed engine, including chain creation and preview rollback. They are deliberately separate from reservation and operation API tests. They do not prove that a new confirmation API, concurrency protection, receipt or React control exists.

Run them using the approved isolated native test environment. No production credentials, database dump or private runner belongs in this repository. Test fixtures are `QorliaQA` synthetic records and use reserved `.invalid` email addresses. A passing native contract is the baseline for implementation, not whole-product release approval.

The focused confirmation contracts run with staging analytics mandatory. Older financial regression fixtures assume optional analytic allocation; their combined harness must use a separate database copy, not relax the running tester database. That harness is not proof that every financial fixture works under a mandatory hospital configuration. Keep configuration-specific native acceptance separate.
