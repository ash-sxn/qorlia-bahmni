# Native delivery validation and wizard contract

[Billing adapter](README.md) · [Stock confirmation](STOCK_CONFIRMATION.md) · [Architecture](../../docs/architecture.md) · [Parity ledger](../../docs/FEATURE_PARITY.md)

This is a development integration contract, not a released delivery-validation control. The [native contract tests](qorlia_billing_ui/tests/test_stock_validation_contract.py) exercise installed Bahmni/Odoo behaviour directly. The [adapter source](qorlia_billing_ui/models/stock_validation.py) implements load, rollback preview, reviewed save and exact status recovery. Confirmation, reservations, recorded done quantity and completed movement remain different operations. Read the dated checkpoints separately from the API specification.

## Browser completed receipt and native automatic-valuation regression, 15 October 2026

The existing isolated adapter-48 React/gateway build now completes a full incoming receipt. Opening Validate is saved once and returns the actual native receipt review. Its table displays five units, the new batch name, expiry and cost/sale/MRP 2.5/5/7. Confirming that review previews the next single native action; saving it completes the transfer and returns the created batch, inventory quantities and valuation references. Finish checks the exact accepted request, clears its recovery entry and reloads a Done transfer with five recorded units and zero reservation. Editing completed operations is disabled. No extra backorder or full-page reload is needed.

Independent read-only assertions verify one new batch for the correct product/company, the reviewed prices and expiry, five units in that batch, original-batch metadata unchanged, warehouse quantity ten to fifteen and exactly one valuation layer of five units/value twenty. The valuation follows native standard cost four; batch purchase/sale/MRP fields are not an alternative valuation formula. This manual-valuation configuration creates no accounting journal. The incoming transfer has no sales delivery line, so customer delivered quantity correctly remains zero.

The two exact author/company/order-bound action receipts form one consumed continuation and one terminal result. Checks also preserve all unrelated pre-existing stock, earlier browser receipts and eight protected accounting records' stored fields. Financial/payment/reconciliation/analytic counts remain unchanged; the valuation count increases only for the four completed browser fixtures. These assertions do not independently recalculate computed invoice totals.

Added native step regressions cover full new-batch receipt and automatic valuation, including rolled-back preview and accepted-request replay/status without duplicate stock, batches, valuation or journals. Automatic valuation is exercised through the per-step adapter, not only the direct native method: one posted journal balances valuation minus twenty against stock output plus twenty, retains analytic allocations and is not posted again on identical retry. The focused native step suite passes twelve cases with mandatory analytics, no failures/errors/skips and prior browser receipts preserved. The receipt UI regression now also checks the separate continuation save, native batch reference, status-before-clear and exact recovery clearing; all twenty-four validation-modal cases pass. Scoped lint/format and twelve actual test-source roots pass.

The combined native fulfillment run also passes 108 cases with mandatory analytics, no failures/errors/skips and the prior browser receipts preserved. The complete Home suite passes 696 cases in 74 suites. Home library types and the contributor-document check pass (27 guides, 478 local links). Final independent read-back verifies all four completed browser fixtures and their stock/valuation invariants after the native suite. A separate read-only check still finds the protected adapter-43 tester's stored accounting, stock, delivered quantity and operation/preparation counts unchanged. No full-addon regression rerun is claimed for these test-only changes.

This checkpoint adds actual browser receipt-completion evidence, not automatic-valuation browser acceptance. Application runtime source and build are unchanged from `7cc4dd5ec31fb26f`; only tests/documentation change. The temporary loopback gate expired afterward and correctly returns HTTP 410; it has not been renewed or bypassed. Automatic journal browser acceptance, session expiry, wider roles/configurations, reports/multi-transfer, notifications, scale and matching-source protected publication remain open. The hosted tester stays adapter 43 and production/public demo are unchanged. Full Billing and whole-product parity remain incomplete.

## Browser completed-delivery and order-refresh checkpoint, 15 October 2026

Three additional synthetic fixtures now have actual React browser save/read-back evidence through the real loopback gateway and separate clinical/ERP sessions on isolated adapter 48. These are stock-validation tests on deliberately linked synthetic transfers, not end-to-end order confirmation or clinical-to-ERP synchronization.

| Scenario                        | Observed browser and native result                                                                                                                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fully prepared delivery         | One reviewed native action completes five units, changes source stock from ten to five and creates one valuation layer of minus five units/minus twenty value. No backorder.                                                                                                   |
| Immediate delivery              | Opening Validate saves the actual immediate prompt. Its separately reviewed selected decision completes five units with the same stock/valuation result. Exactly two accepted receipts and no backorder.                                                                       |
| Partial delivery with backorder | Opening Validate and its separately reviewed backorder decision deliver two units, leave source stock at eight and create exactly one three-unit remainder linked to the original sales line. The remainder is confirmed/waiting for availability, not delivered or cancelled. |

Each terminal receipt identifies the native result. Finish checks that receipt, clears only its exact recovery record and reloads transfers. Independent read-only assertions verify the native transfer/move/operation, delivered sales-line quantity, physical stock, exactly one valuation layer per completed transfer, receipt counts and author/company/order binding. Existing stock outside these fixtures, eight protected accounting records' stored fields, prior browser receipts and accounting/payment/reconciliation/analytic counts remain unchanged. Manual valuation creates no stock journal in these three configurations. Computed invoice totals are not independently recalculated by this SQL check.

The partial-delivery check exposed a real UI defect: returning to order details retained cached zero-delivered data even though native read-back showed two. The shared transfer-modal close handler now invalidates the signed-in account's charge-line queries as well as transfer/recovery queries. This also applies when closing a saved intermediate prompt. An integration-style component regression uses the actual parent/transfer panels and QueryClient: it fails before the change and passes afterward. Actual full and immediate browser flows on the rebuilt bundle then show five delivered on return, without refreshing the page or order list.

Home passes 696 tests in 74 suites, including 50 focused order/transfer/validation cases. Scoped lint, Home library types and twelve selected actual test-source roots pass. Development build `7cc4dd5ec31fb26f` includes the nine preserved unrelated clinical working files and is not a clean source-only release artifact. No native adapter code changes or native-suite rerun are claimed for this UI cache correction.

This adds scoped completed full/immediate/backorder browser acceptance to the earlier preparation/recovery evidence. Receipt completion, automatic valuation/journal browser acceptance, session expiry, wider roles/configurations, reports/multi-transfer, notifications, scale and matching-source protected publication remain open. The protected tester stays on adapter 43; production/public demo and access gates are unchanged. Full Billing and whole-product parity remain incomplete.

## Browser expiry-decline and lost-response checkpoint, 15 October 2026

The same isolated adapter-48 build now has actual browser evidence for immediate preparation followed by declined expiry. Opening Validate saves one native receipt. Processing the immediate prompt saves a second, records five prepared units and returns the actual expired-batch warning. Reviewing and saving “Do not process expired batches” saves a third terminal receipt while the transfer remains assigned. Finish checks the receipt, clears only its pending request, reloads the transfer quantities and restores fallback focus. The refreshed screen shows five prepared units, not completed delivery.

Independent read-only assertions verify the two one-time continuation links, three author/company/order-bound receipts, five prepared units, zero delivered and no stock movement or valuation. Original stock rows, both browser fixtures' stock/reservations, eight protected accounting records' stored fields and accounting/payment/reconciliation/valuation counts retain their baselines. The earlier receipt fixture still has exactly two receipts and its saved batch prices. The checker does not independently recalculate computed invoice totals.

A subsequent intentional Validate on the already prepared expiry fixture tests a lost response, not another delivery. The browser debugger pauses only this save's Fetch response after the real gateway returns HTTP 200 with `accepted=true`. The response body identifies the original request and an expiry prompt. Aborting that response makes the UI show an unknown outcome with its exact durable request and no automatic retry. The interception is then cleared. Full page reload, reopening the original order and Resume validation recover that same request. Explicit Check validation request restores the accepted native expiry prompt without another save. Independent read-back finds exactly one additional receipt with the digest of the captured original seven-key request, author and companies. No preparation, physical stock, delivery, valuation or protected financial effect repeats.

The recovered prompt also has a scoped 390 by 844 browser check: document and dialog width stay within the viewport, the quantity table keeps its horizontal scroll, and Tab reaches the expiry choices, status, close and back controls. Carbon's trailing focus sentinel cycles back into the dialog. Keyboard activation of Close saved prompt checks the receipt, clears recovery and returns focus to Back to order details. The temporary viewport override and response interception are removed afterward. This is one prompt's keyboard/narrow acceptance, not every modal, device or screen-reader combination.

No application source changed for this acceptance increment. Build `518385df713b69b1` and the preceding 695 Home checks remain the source checkpoint, not newly rerun checks. Full delivery/backorder/receipt completion and valuation browser paths, session-expiry recovery, wider roles/configurations, reports/multi-transfer, notifications, scalable capture/locking and matching-source protected publication remain open. The protected tester remains adapter 43. Public demo and production are not switched.

## React per-step migration and receipt browser checkpoint, 15 October 2026

Fresh React validations now use adapter 48's individually reviewed native RPC steps. Opening Validate previews and saves only that action. The actual accepted receipt supplies the next prompt; a choice receives its own signed review and save. Previously committed decisions are never replayed as a fresh decision history. Existing six-key atomic pending requests still use their original save/status APIs and are not converted into steps.

The existing IndexedDB stock slot now supports an explicit schema 4 `validation_step` envelope with the fixed build's Billing database and exact seven-key request. Moving from an accepted prompt to its reviewed continuation replaces the preceding request in one strict read/write transaction. Changed, foreign, malformed or missing preceding records block the write. Storage commits before HTTP; unmount, expiry and uncertain responses preserve the exact request. Exact clearing must not delete another pending action. Schemas 1, 2 and 3 retain their original recovery contracts.

The modal distinguishes an accepted native action from completed delivery, allows checking or retrying only an identical uncertain request, and allows closing an accepted nonterminal prompt without undoing earlier preparation. It reuses the existing modal, decision controls and physical/financial effect viewer. Account/order/transfer changes isolate late results. Existing transfer recovery can resume a validation even if its original transfer row is no longer listed.

Checks on this source pass: 695 Home tests in 74 suites, including 24 validation-modal cases and 19 recovery-storage cases. The focused modal/storage/transfer-panel run has 57 cases. The 19 storage cases also pass with a non-default Billing database. Scoped lint, Home library types, eleven selected actual test-source roots and nine gateway/configuration cases pass separately. Development build `518385df713b69b1` targets the isolated adapter-48 copy; it includes nine preserved unrelated clinical working files, so it is not a clean source-only release artifact.

Actual browser saves through the real protected loopback gateway and separate clinical/ERP sessions verify receipt preparation on a new synthetic fixture. Opening Validate creates one receipt. Confirming its receipt review creates a second receipt, persists batch cost/sale/MRP 2.5/5/7 and stops at the native backorder prompt. Closing while preserving recovery, full reload, closing/reopening the tab, and explicit status checking recover the identical second request and actual backorder prompt without replaying the first action. Closing the saved prompt clears its recovery banner, reloads transfers and returns focus to the transfer-screen fallback.

Independent read-only database assertions find exactly two author/company/order-bound step receipts, the first consumed once by the second and the second unconsumed. Prepared prices remain saved, recorded quantity is two, delivered quantity is zero and transfer state remains assigned. All earlier stock rows match the prior baseline; both new fixture stock quantities/reservations remain unchanged. Protected accounting write dates, states and residuals, accounting/payment/reconciliation/valuation counts and both delivered quantities match their baselines. No new valuation is present. An initial read-back query incorrectly treated the native computed `invoice_total` as a stored SQL column; the corrected checker explicitly compares stored fields and does not claim to independently recalculate that computed amount.

This accepts the stated receipt save/reopen/close path, not every wizard or browser failure mode. Actual browser immediate/expiry/terminal backorder/valuation paths, transport-loss recovery, broader roles/configurations, complete keyboard/narrow-layout acceptance and matching-source protected publication remain open. Notifications, native reports/multi-transfer and scalable locking/capture remain unfinished. The protected tester remains adapter 43; no public-demo or production redesign is deployed. Older checkpoints below remain historical evidence, not the current React implementation instructions.

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

| Frontend method            | Native method               | Keyword arguments                                               |
| -------------------------- | --------------------------- | --------------------------------------------------------------- |
| `getStockValidation`       | `qorlia_validation_load`    | `order_id`, `transfer_id`                                       |
| `previewStockValidation`   | `qorlia_validation_preview` | `order_id`, `transfer_id`, `version`, `decisions`               |
| `saveStockValidation`      | `qorlia_validation_save`    | `payload`: the exact six-key reviewed request                   |
| `getStockValidationStatus` | `qorlia_validation_status`  | `payload`: that identical request, including its original nonce |

The runtime parser checks the native graph, matching order/transfer/version/decision sequence, terminal signature, next-step shape, actual state and effect schema. It preserves receipt product/unit/batch/quantity/expiry/prices/balance and native warnings. A blocked SMS step cannot be converted into an approved decision. Terminal states include `assigned`, not just `done`. A save without an accepted receipt rejects; an unaccepted status remains a valid unknown/not-yet-accepted result, not proof that the original request stopped.

Updated and created effect rows can explicitly identify known fields assigned during save. Validation's expanded effect models and private financial counts are enabled only for this parser. Ordinary confirmation keeps its narrower model/count rules and rejects updated-row assignment metadata. Hidden generated references retain neither IDs nor names. These differences have [service regressions](../../apps/home/src/components/Billing/__tests__/stockValidationService.test.ts) and [confirmation-boundary regressions](../../apps/home/src/components/Billing/__tests__/stockConfirmationService.test.ts).

The [gateway](../../scripts/review-host/server.cjs) allows only these four validation paths behind review access and a verified clinical session, with a separate native ERP session. Existing model/method/argument/context restrictions, cookie isolation and request bounds remain. Source allowlisting is not publication or browser acceptance.

Adapter 47 corrects native relation-label projection for translated names stored as JSON. A snapshot relation must be permission-checked and resolved to a text label in the current language, with native translation fallbacks, not sent as a translation object to the text-label UI contract. This matters when backorder effects include a product-template dependency. The raw business field values remain unchanged. The [native backorder preview regression](qorlia_billing_ui/tests/test_stock_validation_preview.py) checks that labels are strings and retain the expected product name.

The React validation wizard and shared pending-stock recovery integration have component-tested source, recorded below. Actual browser save/reload and publication remain pending. Do not wire a direct Validate button around this review sequence, discard an uncertain request, overwrite another pending stock action or claim that every accepted decision delivered stock.

### React wizard and recovery source checkpoint, 15 October 2026

[Validation review](../../apps/home/src/components/Billing/StockValidationModal.tsx) and [native choices](../../apps/home/src/components/Billing/StockValidationStep.tsx) now open from order transfers. They use existing house controls and the actual service contracts, not raw wizard writes. Receipt rows/locations remain read-only, matching the installed model metadata and view. Native units, batch/name, expiry, cost/sale/MRP, balance and warnings are shown. Changing saved operations requires returning to their existing editor and reviewing again.

Immediate/backorder checkboxes start from native defaults. Expiry proceed and decline are explicit. Each choice replays the complete earlier sequence in a new rollback preview; a previous choice can be revisited. Only a signed terminal review offers save. An assigned/non-delivered result is never labelled completed delivery. Blocked SMS setup has no invented approve/save action. The shared effect viewer preserves financial model labels, updated assigned-on-save fields, private counts and available unchanged unit/currency/company context. Audit/warning markup is rendered as text.

The existing IndexedDB slot gains schema 3 with `kind=validation`, account UID, fixed configured Billing database and the exact six-key request. A different database, malformed envelope or another pending stock kind blocks new work. Legacy schemas 1 and 2 remain readable under their existing contract; this does not establish missing historical database provenance. No pending record is silently migrated, discarded or overwritten. A save waits for durable commit. Unknown outcomes retain the request for explicit status/identical retry, including remount. Definitive native rejection clears only that exact request; expiry/reconnect and failed receipt/clear keep recovery. Finish checks a fresh receipt before exact clear and parent refresh.

Preview/result/error focus and opener focus return are covered. Open-dialog automated accessibility tests exposed a shared Modal wrapper issue around Carbon's focus sentinels. The wrapper now has a named region only when open, while retaining native dialog naming, transitions and close controls. Its closed CSS and real browser focus behavior still require browser checks; the unit test does not assume Carbon unmounts its closed DOM.

Home passes 663 tests/73 suites, including 15 validation UI cases, three new cross-kind storage cases and two transfer-entry cases. The design system passes 445 tests/40 suites and 14 snapshots, including two shared-modal regressions. Nine gateway/configuration checks, library and ten selected actual test-source roots, scoped lint/format and development build `909dd84767977248` pass. Existing unrelated design-system table nesting/list-key warnings remain. The build targets the isolated copy and retains nine existing clinical working-tree changes, not part of this source increment. Backend adapter 47 is unchanged; native/HTTP acceptance below was not rerun or relabelled as browser UI acceptance.

Next gates are actual browser native save/read-back, persistent recovery across full reload, loss/expiry testing, keyboard/focus and narrow visual review, then an approved matching-source protected release. Verify legacy intermediate-wizard persistence and cancellation separately: this UI previews choices until terminal save, so it does not establish parity with separate native RPC steps that may persist preparation before another prompt. Do not equate final-outcome tests with acceptance of every cancel/close boundary. Broader native configurations, notifications, reports/multi-transfer, scale, full Billing and whole-product parity remain open. The hosted tester and production/public demo are unchanged.

## Native intermediate persistence audit and adapter 48 step contract

Separate native HTTP requests confirmed the missing close/cancel boundary on 15 October 2026:

- Incoming receipt confirmation writes existing batch cost/sale/MRP before returning the backorder prompt. Closing that next prompt leaves those prices saved while the transfer remains assigned and physical/delivered quantities remain unchanged.
- Immediate transfer processing sets prepared `qty_done` before returning the expired-batch prompt. Closing that prompt leaves preparation saved without delivery, valuation or accounting movement.

These are observed native commits, not assumptions from a single-transaction test. The initial audit incorrectly expected a fixture's proposed expiry date to override its existing lot-derived date. Captured native state corrected that assertion; the already processed receipt was recovered and read back, not processed again. Price and quantity persistence were verified through fresh requests.

The terminal-only React wizard does not reproduce these boundaries. Adapter 48 adds three native APIs and TypeScript/gateway contracts for a per-RPC replacement. Old six-key atomic APIs remain for their existing requests. They are not evidence of intermediate-step UI parity.

### Step selection and exact request

`qorlia_validation_step_preview` accepts the five-key selection below. Initially use `continuation_key: false` and `decisions: []` to preview native Validate once. Thereafter use the preceding accepted request's key and exactly one decision for its prompt. The client never supplies an action, transient ID, model, method, context or skip flag.

```text
order_id: saved positive order ID
transfer_id: saved positive transfer ID
version: current load's 64-character fingerprint
continuation_key: false, or previous accepted step's canonical UUID
decisions: [] initially, otherwise one existing native decision shape
```

Every writable review, including a nonterminal one, returns a signed `review_version`, native effects, actual `state_after`, `terminal` and `next_step`. Preview rolls business/transient changes and callbacks back. Notification setup/send remains blocked. Receipt rows, prices, units, locations, batch warnings and private financial visibility use the existing projector.

`qorlia_validation_step_save` and `qorlia_validation_step_status` accept `{payload: request}`. The exact request adds only `review_version` and a new `request_key` to that selection. Opening Validate is one reviewed native RPC; confirming/declining its next prompt is another. Do not replay decisions after they have committed.

### Saved continuation and recovery

The protected per-transfer receipt stores the next native action and actual transient privately, bound to author, companies and original order. Native context stays server-owned and does not appear in the response. Existing receipt-field create/write/read restrictions remain.

Save takes native table locks, repeats rollback review, compares actual effects and commits the action/receipt together. A successful continuation marks the preceding prompt consumed by this request. Another nonce cannot process it again; an identical retry returns its receipt instead of rerunning the native method.

Status retains accepted/request/reference/current-state fields and adds:

```text
next_step: permitted native prompt descriptor, or false
continuation_key: this accepted request's key when that prompt is available, otherwise false
continuation_reason: false, or why the accepted prompt cannot continue
terminal: whether this accepted action returned no next prompt
```

An unaccepted status has false state/prompt/continuation/reason/terminal and no references. An accepted but consumed, expired/deleted or newly denied prompt keeps its receipt and a reason. It must not recreate a transient, expose a private action or claim terminal delivery. Current native state may differ from the historical receipt.

### Acceptance boundaries

Ten focused step cases and the 106-case combined fulfillment suite pass with mandatory analytics on another isolated copy. Coverage includes intermediate persistence, terminal outcomes, author/continuation scope, one-time consumption, missing transient recovery, stale/tampered review, actual-effect rollback and notification guards. The TypeScript contracts add 17 cases; Home passes 680 cases/74 suites. Nine gateway/configuration checks and eleven selected actual test-source roots pass separately.

The full 684-case legacy-addon harness also passes on that copy using its existing optional-analytics fixtures, with mandatory analytics restored afterward. It does not replace the 106-case mandatory-analytics acceptance. Earlier harness import/assertion/fixture-cleanup failures are retained privately as diagnostics, not accepted runs. Installed Python source/test hashes match the reviewed source.

Actual loopback HTTP through the real protected gateway, separate clinical/ERP sessions and the current TypeScript service accepts two synthetic workflows: receipt confirmation stops at backorder with saved batch prices; immediate processing stops at expiry with saved quantity. Four journalled requests produce four author-bound receipts. Concurrent identical processing creates one receipt, and status/identical retry recover the accepted requests without repeating the native method. Discarding an accepted return value and re-reading status is API receipt evidence, not a transport-loss or browser-reload test. Follow-up terminal previews roll back without movement.

Independent native read-back verifies request digests/authors, actual transient ownership, exactly two receipts per fixture, one-time consumption and saved preparation. All physical stock, protected finance/financial counts and delivered quantities remain unchanged, with no new valuation. Three named APIs reject absent gates and malformed model/method/args/context/cross-origin requests. Raw native wizard methods remain unavailable. The independent main adapter-43 snapshot exactly matches its prior finance/bank/stock/receipt baseline.

Home/library and selected actual test-source types, scoped lint/format/diff checks, documentation links and development build `2acf15ee3936b933` pass. The build uses the isolated copy's database setting and includes the nine preserved unrelated clinical working files, so it is not a clean source-only release artifact. No validation-step UI was accepted by building it.

React and durable storage still need migration to per-step execution while preserving pending atomic requests. Actual UI save/close/reload, loss/expiry, keyboard/focus/narrow checks and matching-source protected publication remain open. There is no public HTTPS release or production switch here. Notifications, reports/multi-transfer, wider configurations/roles, coarse-lock/global-snapshot scaling and full Billing/product parity remain open.

### Adapter 47 service and isolated HTTP checkpoint, 15 October 2026

The actual TypeScript parser and native HTTP APIs now cover these synthetic scenarios on the separate database copy:

| Scenario                       | Actual native outcome                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Full prepared delivery         | Five delivered; source stock falls from ten to five                                                        |
| Immediate selection            | Native quantity preparation followed by five delivered                                                     |
| Partial delivery and backorder | Two delivered; exactly one three-unit remainder, including concurrent identical saves                      |
| Receipt review                 | Five received; saved batch cost/sale/MRP 2.5/5/7 and the reviewed expiry                                   |
| Immediate then declined expiry | Five prepared, transfer still assigned, source stock ten and zero delivered                                |
| Automatic valuation            | Five delivered; one posted balanced stock journal with minus twenty/plus twenty lines and native analytics |

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
