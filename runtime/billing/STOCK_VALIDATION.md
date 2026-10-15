# Native delivery validation and wizard contract

[Billing adapter](README.md) · [Stock confirmation](STOCK_CONFIRMATION.md) · [Architecture](../../docs/architecture.md) · [Parity ledger](../../docs/FEATURE_PARITY.md)

This is a development integration contract, not a released delivery-validation control. The [native contract tests](qorlia_billing_ui/tests/test_stock_validation_contract.py) exercise installed Bahmni/Odoo behaviour directly. The [adapter source](qorlia_billing_ui/models/stock_validation.py) implements load, rollback preview, reviewed save and exact status recovery. Confirmation, reservations, recorded done quantity and completed movement remain different operations. Read the dated checkpoints separately from the API specification.

## Installed implementation

The audit used the isolated pinned `bahmni/odoo-16` image with digest `sha256:b3afea0fd5c6b8a6e3f7e70d01306d456c2c9cd1bcf03c17fda9cb52f47e2de8`. Read the installed methods and inherited views, not just a moving upstream branch:

- Odoo `stock/models/stock_picking.py`: `button_validate`, `_sanity_check`, `_pre_action_done_hook`, `_check_immediate`, `_check_backorder`, `_action_done`.
- Odoo `stock/wizard/stock_immediate_transfer.py` and `stock_backorder_confirmation.py`: selected transfers, remainder choices and native context propagation.
- Bahmni `bahmni_stock/models/stock_picking.py`: internal batch-quantity check, receipt/internal validation screen and receipt batch-price updates.
- Bahmni `bahmni_stock/wizard/stock_picking_validate_wizard.py` and its XML view: native positive-done rows, quantities, batch, expiry, cost, sale price, MRP, locations and warnings.
- Bahmni `bahmni_sale/models/stock_move_line.py`: tracked-product and rounding checks followed by native quant movement.
- Odoo `product_expiry/models/stock_picking.py` and `wizard/confirm_expiry.py`: explicit expired-batch decisions, including declining selected transfers.
- Odoo `stock_sms/models/stock_picking.py` and `wizard/confirm_stock_sms.py`: conditional company-wide notification choices and external sending. These need separate treatment below.

The native view offers Validate to the Stock User group using `show_validate`; separate highlighted/ordinary buttons cover different states. Do not infer eligibility from a guessed list of status strings. Native ACLs, field/record/company rules and installed hooks still govern the action.

## The action is a sequence, not a single state write

```text
Validate a saved transfer
  -> native Bahmni receipt/internal review, when applicable
  -> native immediate-transfer selection, when applicable
  -> native backorder choice, when policy asks
  -> native expired-batch decision, when applicable
  -> conditional notification setup/decision
  -> native movement, valuation, accounting and linked outcomes
  -> possible native post-validation report/action
```

This shows the responsibilities to preserve, not a client-side fixed ordering. The installed native return action determines the next step. A returned wizard is not proof of completed delivery. Each wizard can return another action instead of `True`. Selecting no transfer or declining an expired batch can leave a transfer uncompleted, even though the wizard method returns `True`.

For example, native immediate processing sets done quantities only for operation rows compatible with the configured lot-creation/selection mode. A creation-only receipt with an existing `lot_id` but no `lot_name` can proceed to a backorder prompt without recording done quantity. Follow native onchanges and row metadata rather than forcing quantities in React.

## Behaviours pinned by the current tests

| Scenario                                                | Native outcome to preserve                                                                                 |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Neither reserved nor done                               | Native error, no physical movement or delivered quantity                                                   |
| Full prepared outgoing transfer                         | Native movement and delivered quantity, plus valuation layer                                               |
| Zero done with reservation                              | Immediate-transfer selection before completion                                                             |
| Immediate transfer deselected                           | No delivery of that transfer                                                                               |
| Partial delivery, ask policy                            | Explicit create-backorder or cancel-remainder choice                                                       |
| Always/never backorder policy                           | Native policy, without inventing an extra choice                                                           |
| Missing batch, negative quantity, invalid unit rounding | Native error at the stage where the engine checks it, including after a wizard                             |
| Receipt with new batch                                  | Bahmni review before creating the batch and updating cost/sale/MRP/expiry                                  |
| Receipt with zero done                                  | Bahmni review can lead to an immediate-transfer wizard                                                     |
| Creation-only receipt without a batch name              | Immediate processing can lead to a backorder wizard; do not claim delivery                                 |
| Expired batch                                           | Explicit native proceed/decline decision                                                                   |
| Immediate/backorder followed by expiry                  | Earlier choices do not bypass the expiry decision                                                          |
| Manual valuation                                        | Valuation layer, without an automatic accounting journal                                                   |
| Automatic valuation                                     | Balanced native posted stock journal and configured analytics                                              |
| Rolled-back validation                                  | Stock, delivered quantities, valuation, accounting, analytics, wizard records and callback queues restored |

The standard-cost fixture delivers five units at cost four, producing a native valuation of minus twenty. The automatic fixture provides native account/journal configuration and product-scoped analytic defaults. It does not relax mandatory analytic plans or claim that every hospital's accounting setup is valid.

## Preview and save implications

Bahmni can update batch price/expiry when a parent method returns another wizard, before final stock movement. An immediate step can also set recorded done quantity before the expiry decision. Therefore the entire native wizard replay must remain inside rollback preview, including transient records, audit, configuration, stock valuation, accounting and all four callback queues. Merely rolling back the final `button_validate` call is insufficient.

The later reviewed save must replay the same native choices under current permissions and compare the actual effects, then record an exact author/company-bound receipt. Reuse the existing durable stock recovery design without overwriting an uncertain reservation, operation or confirmation request. An accepted result must report the actual final state and generated references, not always say “delivered”. Preserve a native terminal report/action rather than silently dropping it.

Do not expose arbitrary wizard models, methods, record IDs or client context. Server-owned native action context supplies the next wizard. In particular, do not accept client `validation_confirmed`, `skip_immediate`, `skip_backorder`, `skip_expired` or `skip_sanity_check` flags to bypass required decisions.

Confirmation's unchanged-finance/physical-stock invariant cannot simply be reused for validation: validation deliberately changes those records. Its effect capture and permission handling must include stock valuation, sale delivery progress, native journal lines, analytics, batches, packages, downstream transfers and audit, with protected details handled under native visibility.

## External side effects and remaining scope

The installed SMS hook can return a setup wizard and can send outside the database transaction. Its “do not send” choice changes company-wide notification settings, not just one transfer. A rollback cannot unsend an SMS or email. Tests run in Odoo's test mode, which suppresses native SMS dispatch, and these fixtures do not represent verified external sending.

Do not silently turn notifications off, simulate a successful send, bypass the native prompt or incur charges. Notification intent, company-level scope, permissions, transactional handoff and recovery need implementation and explicit operational acceptance. Actual sending and notification-related spending are not approved by these tests.

Other remaining gates include broader multi-company/limited-role access, native post-validation reports, multiple products/units/packages, serials, expiry configurations, chained/purchase flows, concurrency, broader signed effect coverage, real RPC/HTTP receipt recovery, React wizard controls and actual gateway/browser saves. Returns and POS are separate workflows. The existing protected tester remains on adapter 43; these tests change neither that environment nor production/public-demo behaviour.

## Development load and ordered wizard review

`stock.picking.qorlia_validation_load(order_id, transfer_id)` checks the saved order/transfer link and native read scope. It returns the graph, opaque current-state version, native eligibility reason and adapter save capability. The preview-only source reported `write_ready=false`; adapter 46 reports its implemented save capability separately from eligibility. Native Stock User and record write access are checked before preview; `show_validate` determines availability. Existing pending native audit work is flushed before the version baseline, not confused with preview mutations.

`qorlia_validation_preview(order_id, transfer_id, version, decisions)` replays `button_validate` and the ordered decisions inside a rollback scope. No wizard ID, arbitrary model/method or client bypass context is accepted. The request starts with an empty decision list. The native action determines the next step. Submit the complete prior decision sequence plus the new choice on the next preview:

```json
[
  { "kind": "immediate", "selected": true },
  { "kind": "expiry", "proceed": false }
]
```

The supported decision shapes are exactly `{kind: "receipt", confirm: true}`, `{kind: "immediate", selected: boolean}`, `{kind: "backorder", selected: boolean}` and `{kind: "expiry", proceed: boolean}`. These select native wizard methods, not direct stock-state writes. A false immediate selection or declined expiry can finish the decision sequence without completing movement. `terminal` means no next wizard, not “delivered”; inspect `state_after`.

Receipt/internal review retains native product/unit, done quantity, balance, batch/name, expiry, cost/sale/MRP, source/destination and native expiring-soon warning text. Immediate/backorder descriptors retain native default selection. Transient IDs are not exposed for replay. Multi-transfer actions and unknown/report actions currently reject with an integration-required error rather than silently dropping required behaviour.

Preview captures physical/preparation/supply effects and financial records including valuation, posted journal lines, reconciliation, sale delivery progress and analytics. It reuses the confirmation graph projection with an explicit expanded model set. Records hidden by native financial permissions produce `private_effect_counts`, not leaked accounting rows or widened roles. Other unreadable business changes and unreviewed configuration changes reject. Internal private effects must be bound into the future signed save contract; counts alone are not sufficient authorization to save.

The complete replay restores the database and all four native callback queues. Unexpected post-preview table differences fail the rollback check and log table names, not row values, for operator diagnosis. The SMS setup prompt is represented as a blocked next step. The preview-only notification guard rejects force-send email and immediate SMS before native dispatch. It does not change notification settings or claim that sending succeeded. New notification integration still requires explicit operational acceptance.

The earlier preview-only checkpoint was not wired to the gateway allowlist or React and supplied no save/status contract. The adapter 46 development source below adds native save/status, but gateway/service contracts, house-style wizard controls and synthetic HTTP/browser acceptance still remain. Do not use a source method alone as evidence of a delivery release.

## Adapter 46 terminal review and exact save source

Only a terminal review returns a signed `review_version` and `write_ready=true`. A next wizard has no terminal signature and remains unwritable. `qorlia_validation_load` reports the adapter's save capability independently of its native eligibility `reason`.

`qorlia_validation_save(payload)` and `qorlia_validation_status(payload)` require exactly six keys:

```text
order_id: positive native integer
transfer_id: positive native integer
version: current load's 64-character digest
decisions: the complete ordered native decision list
review_version: terminal review's 64-character server signature
request_key: canonical UUID, retained for this exact request
```

The signature binds action kind, ordered choices, visible effects, private effects, native outcome and author. Save repeats rollback review under deterministic native locks, checks that signature, then compares the actual native replay again inside its own savepoint. A changed private valuation, unexpected configuration effect or extra wizard rejects and rolls back. The exact successful request records one protected receipt in that same transaction. An identical retry uses the receipt instead of validating stock again. A changed request or author cannot reuse its key. `accepted=true` means the reviewed action was accepted, not necessarily that stock moved; a declined expiry step can retain preparation with the transfer still assigned.

The new receipt field is restricted to the native system group, omitted from copies, and rejected by generic create/write calls even for an administrator. Its private helper reads the fixed column only after native order/transfer access. A private in-process capability permits the fixed receipt-only SQL update after actual effects match. This does not elevate native stock/accounting writes or expose arbitrary SQL/model access. Status returns real generated references only when the current account can read them. Hidden accounting records retain no public IDs or names. Private accounting amounts/content are not stored in the receipt.

Native completion times and generated journal references differ between preview and save. The projector marks only known execution-assigned fields, including native completed movement dates and linked sale effective dates. Timestamp values must lie within that native execution window; derived quant dates must not be existing FIFO timestamps. Scheduling dates, batch expiry, quantities, prices, values and journal balances are not broadly discarded. Updated and created effect rows explicitly list `assigned_on_save`; business identifiers generated by the native engine use canonical review references, then status supplies permitted real references. An unexpected timestamp outside that window remains a signed effect, not an ignored difference.

This source still blocks external notifications rather than pretending to send or silently changing company settings. Concurrency through real RPC, gateway/TypeScript/browser recovery, broader role/company/configuration cases and scalable locking/capture require separate acceptance. The running protected tester remains adapter 43.

## Frontend and gateway integration contract

The [Billing service](../../apps/home/src/components/Billing/billingService.ts) exposes four named methods. Each uses `stock.picking` with empty positional arguments; the gateway does not expose raw wizard or stock write methods.

| Frontend method | Native method | Keyword arguments |
| --- | --- | --- |
| `getStockValidation` | `qorlia_validation_load` | `order_id`, `transfer_id` |
| `previewStockValidation` | `qorlia_validation_preview` | `order_id`, `transfer_id`, `version`, `decisions` |
| `saveStockValidation` | `qorlia_validation_save` | `payload`: the exact six-key reviewed request |
| `getStockValidationStatus` | `qorlia_validation_status` | `payload`: that identical request, including its original nonce |

The runtime parser checks the native graph, matching order/transfer/version/decision sequence, terminal signature, next-step shape, actual state and effect schema. It preserves receipt product/unit/batch/quantity/expiry/prices/balance and native warnings. A blocked SMS step cannot be converted into an approved decision. Terminal states include `assigned`, not just `done`. A save without an accepted receipt rejects; an unaccepted status remains a valid unknown/not-yet-accepted result, not proof that the original request stopped.

Updated and created effect rows can explicitly identify known fields assigned during save. Validation's expanded effect models and private financial counts are enabled only for this parser. Ordinary confirmation keeps its narrower model/count rules and rejects updated-row assignment metadata. Hidden generated references retain neither IDs nor names. These differences have [service regressions](../../apps/home/src/components/Billing/__tests__/stockValidationService.test.ts) and [confirmation-boundary regressions](../../apps/home/src/components/Billing/__tests__/stockConfirmationService.test.ts).

The [gateway](../../scripts/review-host/server.cjs) allows only these four validation paths behind review access and a verified clinical session, with a separate native ERP session. Existing model/method/argument/context restrictions, cookie isolation and request bounds remain. Source allowlisting is not publication or browser acceptance.

Adapter 47 corrects native relation-label projection for translated names stored as JSON. A snapshot relation must be permission-checked and resolved to a text label in the current language, with native translation fallbacks, not sent as a translation object to the text-label UI contract. This matters when backorder effects include a product-template dependency. The raw business field values remain unchanged. The [native backorder preview regression](qorlia_billing_ui/tests/test_stock_validation_preview.py) checks that labels are strings and retain the expected product name.

The React validation wizard and shared pending-stock recovery integration still need implementation and browser acceptance. Do not wire a direct Validate button around this review sequence, discard an uncertain request, overwrite another pending stock action or claim that every accepted decision delivered stock.

### Adapter 47 service and isolated HTTP checkpoint, 15 October 2026

The actual TypeScript parser and native HTTP APIs now cover these synthetic scenarios on the separate database copy:

| Scenario | Actual native outcome |
| --- | --- |
| Full prepared delivery | Five delivered; source stock falls from ten to five |
| Immediate selection | Native quantity preparation followed by five delivered |
| Partial delivery and backorder | Two delivered; exactly one three-unit remainder, including concurrent identical saves |
| Receipt review | Five received; saved batch cost/sale/MRP 2.5/5/7 and the reviewed expiry |
| Immediate then declined expiry | Five prepared, transfer still assigned, source stock ten and zero delivered |
| Automatic valuation | Five delivered; one posted balanced stock journal with minus twenty/plus twenty lines and native analytics |

The first full/immediate saves used adapter 46. The immediate test suppressed its accepted HTTP response, then recovered status and retried the identical request. Final adapter 47 rechecks those exact requests through the actual loopback review gateway. Backorder, receipt, expiry-decline and automatic valuation are fresh adapter 47 gateway saves. Two concurrent identical backorder calls both acknowledge one native result, not two remainders. Independent native reads find exactly one receipt for each transfer, matching its original request digest and author. No fresh request replaces an uncertain one.

The gateway uses real separate clinical and ERP sessions. All four validation routes deny unauthenticated access; model/method/positional-argument/context substitutions and cross-origin requests are rejected. The local harness initially intercepted the gateway's own session check and produced a 503 before Billing authentication. Correcting that test interception, without changing the application gate, allowed the real flow to run. The earlier invalid backorder wire response is retained as diagnostic evidence for the native translated-label fix.

All six preview snapshots roll back. Native/API reads verify receipt prices/expiry, original and remainder quantities, delivered progress, valuation, posted journal balances and analytics. Other stock, protected accounting records and payment/reconciliation counts remain unchanged. A separate final read of the protected tester exactly matches its earlier accounting/bank/stock/delivery/receipt snapshot; it remains adapter 43. Source and mounted hashes match for the native validation, shared projector and backorder regression.

The final source passes 96 native fulfillment cases with mandatory analytics and the complete 674-case legacy addon harness using optional analytics only on the copy, restored to mandatory afterward, with no failures/errors/skips. Home passes 643 tests/72 suites, with a final focused 30-case confirmation/validation rerun after additional boundary assertions. Nine gateway/configuration checks, library and touched-test-source types, lint/format and development build `91a7cfd56c8d1402` pass. The local build retains the nine existing clinical working-tree changes; it is not a published source-only release artifact.

This supersedes the pending native HTTP/service and loopback gateway gates below, not React wizard/shared browser recovery, browser acceptance, public HTTPS/container publication, wider roles/configurations, notifications, native post-actions, scalable capture/locking or full fulfillment. No redesigned validation control is released to the hosted tester or production/public demo.

### Native save checkpoint, 15 October 2026

The seventeen focused [save/status cases](qorlia_billing_ui/tests/test_stock_validation_save.py) and the combined 96-case native fulfillment suite pass with mandatory analytics unchanged, with zero failures/errors/skips. This includes the preceding native/preview contracts and the new actual model save, status, identical retry, private valuation rollback, author/request mismatch, receipt-field protection, native batch data and automatic valuation under Stock User without financial read access. Delayed saves, generated journal references, preserved backorder scheduling and rejection of an unexpected completion timestamp are covered.

The complete 674-case addon regression separately passes on the copy using legacy optional-analytics fixtures, restored to mandatory afterward. Source/mounted hashes match. Nine unchanged gateway/configuration regressions pass without adding validation routes. Independent main-tester read-back exactly matches the prior protected accounting/bank/stock/delivery/receipt snapshot. The copy was backed up before its adapter 46 upgrade; the hosted adapter/build/gates and production/public demo are unchanged.

Earlier save runs rejected varying native completion dates and journal references. They also exposed the synthetic fixture setting a transfer's related procurement group without setting its moves' group. Native ownership derives from those moves. The fixture was corrected rather than loosening order matching, and execution-assigned values were explicitly labelled rather than removing date/money comparisons. Failed runs remain diagnostic evidence. These are native model checks, not real RPC concurrency, HTTP/gateway/browser or whole-product acceptance. Older receipt fields' generic read/export policy is not covered by the new field's privacy acceptance.

## 15 October 2026 native checkpoint

Twenty-two direct native contract cases pass with zero failures/errors/skips on the separate database copy with mandatory analytics unchanged. Earlier failing fixture/expectation runs remain diagnostic evidence, not accepted source. They exposed the native unit-rounding check occurring after a backorder decision, a duplicate reference-unit fixture problem, and the creation-only receipt's lot-name requirement.

Those direct cases also pass in the combined 64-case native fulfillment suite with confirmation contracts and confirmation previews, with zero failures/errors/skips and mandatory analytics unchanged. Adapter-preview acceptance is recorded separately after its own tests; this direct contract count does not prove the new adapter path.

The later adapter increment passes all 15 preview cases and the combined 79-case fulfillment suite, with mandatory analytics unchanged and zero failures/errors/skips. It includes full/manual and automatic valuation effect capture, native wizard decisions, financial privacy, transient/callback rollback, context/role/order/stale rejection, unknown actions, external-send blocking and unreviewed configuration rejection. The SMS setup case forces the native warning hook to exercise its descriptor without sending; it is not external notification acceptance.

The complete 657-case addon regression also passes with zero failures/errors/skips on the copy using legacy optional-analytics fixtures, restored to mandatory afterward. Keep that separate from the mandatory-analytics fulfillment run. Tested/mounted source hashes match. Nine gateway/configuration checks pass without exposing validation routes. The independent main-tester protected snapshot exactly matches its earlier state, including eight accounting records, financial/valuation counts, bank state, stock, delivery and preparation receipts. No adapter/build, gate, expiry, destination or production setting was changed.

Earlier adapter runs exposed a missing sales-order link in synthetic fixtures, a duplicated imported test class, stock-user valuation/audit metadata visibility, and pending audit work flushed after the baseline. Those issues were corrected without weakening order ownership, financial roles or rollback assertions. Failed logs are diagnostic only.

This is native contract evidence. It is not acceptance of a Qorlia validation endpoint, UI, external notifications, public deployment or complete fulfillment. Keep the broader parity goal and the remaining gates above visible.
