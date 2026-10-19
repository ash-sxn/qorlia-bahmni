# Native stock transfer cancellation

[Billing adapter](README.md) · [Returns](STOCK_RETURNS.md) · [Pending request stop](STOCK_REQUEST_STOP.md) · [Parity ledger](../../docs/FEATURE_PARITY.md)

## Scope and status, 19 October 2026

Transfer cancellation is a distinct native workflow, not another name for
stopping an uncertain browser request. Candidate 64 adds the six fixed native
APIs, matching typed clients and source-gateway routes described below. The
Qorlia transfer screen connects preparation, detailed operations, confirmation,
validation and returns, but does not yet expose cancellation. Its dedicated
durable recovery schema, React consumer and acceptance remain unfinished. Do not
label the full stock workflow complete or reinterpret Stop to fill this gap.

The installed image source was inspected read-only while the candidate-63 return
regression continued on its own frozen mount. The database module inventory was
read in an explicitly read-only transaction: `stock`, `stock_account`,
`sale_stock`, `purchase_stock` and Bahmni stock/purchase/sale modules are installed;
`mrp` is not. Finding an MRP source file is not evidence that its override is
active. No production setting, native record or running source mount was changed
by this audit.

## Inspected native entry and effects

- `stock/views/stock_picking_views.xml`: the form's Cancel button invokes
  `stock.picking.action_cancel` for internal users. Its base visibility allows
  `assigned`, `confirmed`, `draft` and `waiting`. The merged-view contract now
  verifies that rule under the synthetic stock-staff account. It reads the
  processed JSON modifiers, not raw XML attributes removed by native processing.
- `stock/models/stock_picking.py`: cancellation delegates to native move
  cancellation, locks the transfer and explicitly cancels an empty transfer.
- `stock/models/stock_move.py`: a completed non-scrapped move rejects cancellation.
  Unfinished moves are unreserved, then marked cancelled with their origin links
  cleared and procurement mode changed by the native engine.
- Native unreservation deletes zero-done operation lines. Nonzero recorded done
  quantities retain their lines while their reserved quantities become zero.
  A retained recorded quantity does not mean physical stock was received.
- With cancellation propagation enabled, downstream moves cancel only when all
  sibling origins are cancelled. With propagation disabled and the required
  sibling states, the native engine detaches the origin and changes downstream
  procurement mode rather than cancelling that move.
- `stock_account/models/stock_move.py` removes a move's linked analytic entry
  before delegating to core cancellation. Therefore a blanket assertion that
  cancellation cannot affect any financial-related model would be incorrect.
  The permission-aware effects review includes the legitimate
  analytic deletion, without inventing a payment, refund or ledger posting.

The source inventory search found no additional picking/move cancellation
override in the installed Bahmni addon tree. This is source inspection, not a
complete override/role/company/runtime acceptance claim. The eventual native
contract tests and merged view remain authoritative.

## Source identity

SHA256 digests from the inspected image files:

| Native file | SHA256 |
| --- | --- |
| `stock/models/stock_picking.py` | `5ad3cc984b5ca45b8aa2927bc250ba65ad7e8638ed07a7ae6d3b2e022c8c1452` |
| `stock/models/stock_move.py` | `8d9a25a7ced3b5f2c2546c297379da1d29d3790109d4156178031d5a08e026f0` |
| `stock/views/stock_picking_views.xml` | `7badde93683112264db8535958749b7e8a28cd95b4f40ecd8a6b85efa4598a64` |
| `stock_account/models/stock_move.py` | `e6f9e94a2d124187ca7904a3ef8b1c29ba527176d0ccfa07cece12455d8579eb` |

These identities pin observations to this image, not an assumed latest upstream
release or another hospital's installation. Additional installed modules need
their own override audit before claiming equivalent cancellation behaviour.

## Direct native contract cases

[Ten source cases](qorlia_billing_ui/tests/test_stock_cancellation_contract.py)
use the existing synthetic stock fixture. They cover the merged form, draft
cancellation/locking, reserved zero-done operations, retained nonzero recorded
quantities, rejection after physical delivery, sibling-aware propagation,
nonpropagating detachment, cancelling only an unfinished backorder, cancelling an
unreceived return and legitimate analytic-line deletion. Stock, delivered
quantities and protected ledger/payment/valuation records are checked as
appropriate. The completed-delivery rejection checks all existing guarded tables.

The corrected isolated run passes **10 cases, zero failures/errors/skips**, with
all 132 guarded tables preserved, mandatory analytics and native SMS still
enabled. All 101 Python files match the frozen package used by that run. After
the worker exited, independent read-only SQL row counts/full-row fingerprints
for all 132 tables match the committed source of the synthetic database copy.
The copy has no public endpoint. Test workers use a read-only source mount,
`--no-http` and no published ports; installed metadata stays 49, source stays 63.

The first run is retained: eight cases passed, one failed and one errored, with
all 132 tables preserved after rollback. The merged-view test initially expected
raw `attrs`, which native processing replaces with JSON `modifiers`. The
completed-delivery rejection test also pinned its baseline before savepoint
entry flushed earlier delivery tracking. It now drains that prior native work
before pinning the baseline and still compares every guarded table after the
rejected cancellation. No native guard, role or state check was relaxed.

These earlier direct native contract tests predate the writer and do not prove
its frontend or full acceptance. The passed 898-case return run uses a separate immutable
100-file snapshot, matched to commit `a8792f2513030be97d42b38fa74544fe47d151d6`.
These later ten cases are not part of that run and must not inflate its count or
inherit its outcome. The earlier same-database cancellation harness was prepared
but never started; execution used the separate synthetic database copy instead.

Private evidence retains both logs and exact package hashes. Corrected log
SHA256: `3cc52f746e3cd0c63c0ff8b8bffa11ad8a318d6961c3e538c08257b875816161`.
The bootstrap's existing pandas-install warning remains in the logs. This is
not a clean-install, real HTTP, gateway or browser acceptance claim. The analytic
deletion positive case uses the native administrator; it does not establish that
an ordinary stock user can delete protected analytic entries.

## Candidate-64 native API and client source

The [native model](qorlia_billing_ui/models/stock_cancellation.py) exposes exactly:

| Method suffix, after `qorlia_cancellation_paged_` | Responsibility |
| --- | --- |
| `load` | Compact native transfer/counts, readiness and version |
| `review` | Ordered complete rollback effect pages and terminal proof |
| `save` | Verify complete proof, run actual native cancellation and record exact acceptance |
| `status` | Read exact accepted, stopped or unknown outcome without replay |
| `references` | Page all saved native references with an access-bound version |
| `stop` | Stop the exact unaccepted request, never cancel goods or undo an accepted cancellation |

The selection is exactly `order_id`, `transfer_id`, `version` and
`action: "cancel_transfer"`. Save/status/stop/reference requests add only
`review_version`, `review_complete_token` and `request_key`. The separate purpose
is `qorlia.paged-cancellation.v1`. Request digests bind the author, allowed
companies, order, transfer and exact request. No existing protocol is converted.
The protected native validation-receipt field is reused with a distinct purpose;
no schema column or installed upgrade is required for these source tests.

Internal-account checks and actual picking/move ACLs and record rules precede
review/write. Native downstream write/unlink checks remain active. An accepted
outcome can still be read after losing write permission, but such an account
cannot start a cancellation or record a stop. Receipt write protection remains.
All 132 guarded tables participate in rollback checks and coarse ordered locks.

Review and actual save compare complete native effects, not just a state label.
No physical quant quantity may change. Protected financial rows remain unchanged
except native `sale.order.delivery_status`, which cancellation recomputes. That
exception applies only to this field, not other order or monetary values.
Legitimate analytic deletion is shown when readable; hidden records use signed
private counts. Receipt bookkeeping may not alter unrelated rows, receipts or
deferred callbacks. Accepted retries recover the original outcome without
calling cancellation again. A stopped request cannot later execute.

The APIs remain order-scoped: an empty transfer whose moves were removed also
loses its native related order link and must reject. The separate direct native
empty-transfer case tests `action_cancel` without inventing that order link.
Global inventory cancellation is still a separate workflow to integrate.

The [typed SDK](../../apps/home/src/components/Billing/billingService.ts) validates
exact request/response keys, identifiers, ordered effect pages, completion proofs,
native states and recovery acknowledgments. Older confirmation validators reject
the cancellation purpose. The source gateway permits only the six fixed named
routes with the existing clinical/ERP sign-in checks, empty positional arguments,
no caller context and the normal 32 KiB body bound. Raw `action_cancel`, move
cancellation, private methods and unknown routes remain denied.

Client verification passes 51 cancellation cases and the full Home suite, 1,423
cases in 96 suites. Library and focused source/test types, scoped ESLint and three
gateway tests pass. Gateway tests use test-only stubs, not a live native worker.
The corrected candidate-64 run passes **30 native cases, zero failures/errors/
skips**: 19 API cases and 11 direct native cases. It preserves all 132 guarded
tables, mandatory analytics and native SMS, with all 103 Python hashes matching
the frozen source. Independent post-worker read-only, repeatable-read SQL also
matches every guarded table's row count and full-row fingerprint in the synthetic
copy against its committed source, without using the native ORM. The large case traverses complete review and cancellation for
501 positive moves and 2,001 operations, not a UI-only count fixture. Native
source is 64; installed metadata remains 49, without a persistent upgrade.

Actual-client replay accepts **166 captured native JSON frames across all six
methods**, checking exact routes/model/arguments and response validators with
transport mocked. Some successful frames come from rolled-back review calls;
not every frame represents a committed write. This does not prove actual HTTP,
gateway/native-worker, browser, IndexedDB or release acceptance.

Completed native log SHA256:
`d15cd5b011f839188703aa35e8e450f4a62f11f2283317d1049ed49a105ce5f5`.
Matching client source SHA256:
`013ce1e7b0edde70b155ad13f44310055afdbd6e487da59bfd697ad9c21b8fdf`.

Retained diagnostics: the first candidate-64 harness stopped before execution
because a mechanical count replacement expected 293 source files rather than
103. The next run executed 29 cases with zero failures and two errors, preserving
all 132 tables. Its tests incorrectly assumed an empty transfer retained its
order link and that an administrator's readable analytic deletion would be
hidden. Corrected assertions preserve scope and privacy rules; an eleventh direct
native case independently covers an empty transfer. No guard was weakened.
The subsequent 30-case run preserved all 132 tables but retained one failed
orphaned-transfer assertion: its baseline preceded earlier setup tracking being
flushed by the API's standard context entry. The corrected test flushes that
prior native work before pinning all 132 tables, just as the earlier direct
completed-delivery rejection does. It does not omit any table from comparison.

## Implementation and acceptance still required

The next consumer crosses the existing
[per-account recovery store](../../apps/home/src/components/Billing/stockReservationRecovery.ts),
[transfer dispatcher](../../apps/home/src/components/Billing/OrderDeliveriesPanel.tsx)
and [Billing recovery entry](../../apps/home/src/components/Billing/StockRecoveryNotice.tsx).
Use a dedicated versioned cancellation record in that same slot, not an
independent slot that permits overlapping native stock writes. Generic detection
must recognise cancellation before confirmation/preparation guards; older typed
dialogs must reject it without dropping its action or completion proof. Preserve
every existing request schema and validation history.

The new dialog must persist the exact request before transport, retain it after
unknown outcomes or expiry, and reopen through the original transfer workspace.
Retirement requires the original account/database, an accepted or explicitly
stopped native outcome, every pinned saved-reference page, and a fresh matching
status before clearing the exact unchanged slot. A saved cancellation and a
stopped pending cancellation need different success messages. No automatic save,
stop or clear is allowed merely from opening the recovery notice.

1. Extend the native cases/merged form to the wider account/stock privilege
   matrix, mixed completed/scrapped moves and other installed configurations.
   Current cases include an empty native transfer, order-scope rejection after
   unlinking all moves, denied picking writes and 501 positive moves with 2,001
   operation lines. These do not prove every configuration or unlimited scale.
   Preserve existing records after rollback. Do not grant roles to pass a denial.
2. Verify the new purpose-bound review/writer/recovery end to end through an
   approved actual transport. Failed or lost responses require the original
   request, not another cancellation attempt with a new identity. A stop cannot
   undo an accepted cancellation.
3. Reuse the durable per-account stock slot and Qorlia design system. Make the
   destructive action explicit and separate from filters, request stopping,
   invoice/order cancellation, backorder decisions and returns. Review linked
   downstream effects, not only the currently visible transfer page.
4. Independently verify physical stock, reservations, surviving operation lines,
   downstream moves, delivered/received quantities, permitted analytic deletion,
   unchanged protected ledger/payment state and exact duplicate recovery.
5. Verify real transport, IndexedDB/reload/expiry, multi-tab/concurrent save-stop,
   keyboard/narrow layouts, source/runtime matching and approved rollout.

No cancellation control should be made live by calling raw `action_cancel`
through the gateway, changing a display state or bypassing a native rejection.
The owner-closed Billing review gate remains closed.
