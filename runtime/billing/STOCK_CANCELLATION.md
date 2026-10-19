# Native stock transfer cancellation

[Billing adapter](README.md) · [Returns](STOCK_RETURNS.md) · [Pending request stop](STOCK_REQUEST_STOP.md) · [Parity ledger](../../docs/FEATURE_PARITY.md)

## Scope and status, 19 October 2026

Transfer cancellation is a remaining native workflow, not another name for
stopping an uncertain browser request. The Qorlia transfer screen currently
connects preparation, detailed operations, confirmation, validation and returns,
but has no cancellation API or control. Do not label the full stock workflow
complete or reinterpret an existing Stop control to fill this gap.

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
  The eventual permission-aware effects review must include the legitimate
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

These are native contract tests, not a new writer, frontend or full acceptance
of cancellation. The ongoing 898-case return run uses a separate immutable
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

## Implementation and acceptance still required

1. Extend the verified direct native cases/merged form to the relevant denied
   account/stock privileges, empty and large transfers, mixed completed/scrapped
   moves and other installed configurations. Preserve existing records after
   rollback. Do not grant roles to make a negative case pass.
2. Add a purpose-bound complete native effect review, exact author/company/order
   request, matching writer, compact status, all saved references and stop.
   A stop cannot undo an accepted cancellation. Failed or lost responses require
   the original request, not another cancellation attempt with a new identity.
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
