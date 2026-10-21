# Native stock transfer cancellation

[Billing adapter](README.md) · [Returns](STOCK_RETURNS.md) · [Pending request stop](STOCK_REQUEST_STOP.md) · [Parity ledger](../../docs/FEATURE_PARITY.md)

## Scope and status, 19 October 2026

Transfer cancellation is a distinct native workflow, not another name for
stopping an uncertain browser request. Candidate 64 adds the six fixed native
APIs, matching typed clients and source-gateway routes described below. The
matching React consumer and dedicated schema-8 recovery now connect cancellation
from the transfer workspace and signed-in Billing notice in source. Actual
runtime/browser and broader parity acceptance remain unfinished. Do not
label the full stock workflow complete or reinterpret Stop to fill this gap.

## Candidate 65 completed full regression, 19 October 2026

The immutable candidate-65 worker has finished with **938 unique native cases,
zero failures/errors/skips**, all 132 guarded tables preserved and mandatory
analytics/SMS enabled. All 104 Python files match its frozen source. Independent
post-worker read-only SQL confirms identical committed counts/full-row hashes
between its synthetic copy and the preserved original across all 132 tables.
The matching frozen client accepts 213 captured cancellation responses across
all six methods, including the private analytic reference, with transport mocked.
Log SHA256:
`d779123a3052262a4f4f9cdb6438c21836e45eca4e8207213a8175df250a3322`.
Client SHA256:
`15dbb0f6da558566b9da6182ffd8a9333967f0a5b448e68b1280ad59257e9291`.
The worker is terminal/removed, without HTTP/published ports or installed upgrade;
metadata remains 49 and bootstrap warnings remain recorded. This verifies that
older cancellation source, not candidates 66 to 68, actual browser or deployment.
Do not add overlapping scoped/full case counts together.

## Candidate 65 private analytic reference and mixed-state coverage

The first nine-case native permission/mixed-state matrix against candidate 64
passed eight cases and errored on one legitimate cancellation. Native Odoo
allowed the stock/accounting actor to unlink a move's analytic entry even when a
read rule hid that entry. Our review adapter instead rejected the visible move's
unreadable dependency. That failed run preserved all 132 guarded tables; it is
retained as a diagnostic, not passing acceptance.

Candidate 65 changes only that cancellation projection. When native cancellation
actually deletes the hidden `account.analytic.line` and clears the surviving
move's `analytic_account_line_id`, the review uses an opaque private-reference
marker. It does not publish the analytic identifier or name, pretend the original
value was unset, grant a role, or bypass native unlink rules. The exact hidden
move/entry relationship is included in the server-only signed witness, so
swapping two private relationships cannot be accepted merely because their
public projections and deleted-entry set are equal. Other confirmation,
validation and return callers retain strict dependency handling by default.

The matching cancellation client accepts this marker only in that exact
many-to-one field's before value, with a cleared after value and a positive
private analytic deletion count. Wrong targets, fields, models, relation types,
created/deleted-row placement, retained references and other protocols reject it.
The shared renderer says **Private analytic item**, while ordinary text values
remain literal text. Schema-8 recovery, exact request keys and the cancellation
protocol purpose remain unchanged; this is not permission to migrate or replay
older requests.

The new ten-case matrix compares real native cancellation with adapter behavior:
done nonscrapped rejection; completed scrap plus ordinary unfinished stock;
scrap-only native Done aggregation; move-write, operation-unlink and
analytic-unlink denial; permitted private analytic deletion; a hidden-link swap
between preview and save; noninternal rejection; and loss of transfer read access
after acceptance. It retains physical stock, protected finance, complete review
proofs and receipt guards.

The corrected isolated candidate-65 run passes **40 unique native cases, zero
failures/errors/skips**: the existing 30 direct/API cases plus the new ten-case
matrix. All 104 Python source hashes match the frozen package. All 132 guarded
tables remain unchanged after rollback, with mandatory analytics and SMS enabled.
After the worker exits, independent read-only SQL row counts/full-row digests
also match their committed pre-worker baseline for all 132 tables.

The matching actual client accepts **213 native JSON responses across all six
methods**, including private-reference pages; only replay transport is mocked.
The log SHA256 is `ff5b5865bb11fe3846dc285a7f86bdd4343aa9d450a7592a5789c1fe5c6248e3`;
the tested client SHA256 is `15dbb0f6da558566b9da6182ffd8a9333967f0a5b448e68b1280ad59257e9291`.
The final Home suite passes **1,505 cases/98 suites**, including 64 cancellation
client cases and 23 cancellation-dialog cases. Focused source/test types,
library types, scoped lint and formatting pass. The two new positive client/UI
cases failed before the implementation; negative/context and literal-text cases
also pass after it. Contributor checks pass for 41 documents/721 local links.

The worker uses a readonly source mount, `--no-http`, no published ports and
installed metadata 49. It does not upgrade the running addon or expose a new
review endpoint. Existing pandas-bootstrap/wkhtmltopdf warnings remain recorded;
this is not a clean-install result. The separate 928-case candidate-64 regression
is still running on its earlier immutable source/database copy at this checkpoint,
not acceptance of candidate 65. Do not sum overlapping native case counts.
Actual HTTP/browser, deployment, global inventory scope, broader
role/configuration coverage, scale and whole-product parity remain separate gates.

## Candidate 64 full regression completed, 19 October 2026

The earlier immutable candidate-64 full worker subsequently finished with
**928 unique native cases, zero failures/errors/skips**, all 132 guarded tables
preserved and mandatory analytics/SMS enabled. All 103 Python files match its
frozen source. Independent post-worker read-only SQL shows identical committed
row counts/full-row hashes across all 132 tables between the synthetic copy and
its preserved original.

The matching frozen candidate-64 client accepts 166 cancellation JSON responses
across all six methods with replay transport mocked. Log SHA256:
`402f9a649a0505ea497ca2b471ef30485882c9858b157c83cba0b5b052f89d70`.
Tested client SHA256:
`013ce1e7b0edde70b155ad13f44310055afdbd6e487da59bfd697ad9c21b8fdf`.
The worker is terminal/removed. It used no HTTP/published ports, no installed
upgrade and installed metadata 49. Bootstrap warnings remain recorded.

This is broader earlier-source evidence, not verification of candidate 65's
private-reference correction, candidate 66's inventory reader, or browser/release
behavior. The candidate-65 938-case full worker subsequently completed on its
separate synthetic copy and immutable 104-file source, as recorded above.

## Initial native source audit

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

At the native API/client checkpoint, 51 cancellation cases and the full Home
suite, 1,423 cases in 96 suites, passed. Library/focused source-test types, scoped
ESLint and three gateway tests passed. Gateway tests use test-only stubs, not a live native worker.
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

## React complete cancellation consumer source, 19 October 2026

The consumer extends the existing
[per-account recovery store](../../apps/home/src/components/Billing/stockReservationRecovery.ts),
[transfer dispatcher](../../apps/home/src/components/Billing/OrderDeliveriesPanel.tsx)
and [Billing recovery entry](../../apps/home/src/components/Billing/StockRecoveryNotice.tsx).
Schema 8 contains exactly `schema`, `kind`, `database`, `uid` and `request`, with
kind `paged_cancellation` and all seven original request fields. It uses the same
strict per-account slot, not an independent slot permitting overlapping native
stock writes. Generic dispatch recognises cancellation before older preparation
guards; older typed readers/clearers reject it without dropping its action or
completion proof. Schemas 1 to 7 and validation history remain unchanged.

The [cancellation dialog](../../apps/home/src/components/Billing/PagedStockCancellationModal.tsx)
reuses the [shared complete-review dialog](../../apps/home/src/components/Billing/PagedStockWriteModal.tsx),
Qorlia/Carbon controls, existing styles and permission-aware native effects
renderer. It reads actual cancellation readiness, pages every effect with the
original proof chain and requires an explicit danger-labelled **Cancel reviewed
transfer** action. Browsing a transfer or opening recovery never saves, retries,
stops or clears a request. The transfer entry follows the native unfinished-state
visibility rule and remains locked while snapshot/recovery reads are unresolved.
Native load/review permissions and reasons still decide actual availability.

Exact requests persist before native dispatch, with account/database checks
before and after strict storage commit. Save retries use the original nonce and
proofs. Stop also rechecks that exact durable slot/account before dispatch. A
changed identity or unmount during persistence cannot trigger a late save/stop.
Response loss, native rejection and expiry keep the original recovery request.
An explicitly stopped request has its own finish action and cannot be presented
as a cancelled transfer or retried as a fresh cancellation. Acceptance winning a
stop race recovers the accepted receipt instead of reversing it.

Retirement requires the original account/database, an accepted or explicitly
stopped outcome, all pinned saved-reference pages, a fresh matching status and
atomic clearing of the exact unchanged slot. The UI's reviewed reference version
is carried through retirement, so changed references cannot be silently replaced
with a newer set. Even zero-reference acceptance verifies the empty pinned page.
Changed/missing reads, overlapping pages, quota/commit failure or another pending
request preserve recovery. Recovery opens the original order/transfer even when
it is absent from the currently selected order. Focus returns to the opener or
workspace fallback, and effect/reference headings receive focus after paging.

Source checks pass **1,490 Home cases in 98 suites**, including 104 storage
cases, 21 cancellation-dialog cases and four actual-SDK dialog wiring cases.
The 34 transfer-dispatch and 16 signed-in-notice cases include cancellation.
The wiring cases use synthetic fixtures and transport/storage doubles, not the
166 captured native response frames used by the earlier native-client replay.
The existing confirmation/preparation paths remain covered by their own 25/24
dialog cases. Basic axe checks, library/focused source-test types and scoped
lint/format remain distinct from real browser or release acceptance.

Retained UI diagnostic: the initial ten failing cancellation-dialog selectors
did not include the shared danger control's existing accessible-name prefix.
The tests now match the actual visible action text within that name; no native
proof, account check, effect assertion or action guard was removed.

The candidate-64 full native regression has a separate immutable 103-file mount
and 928 unique cases; its result must be verified independently. This UI/store
increment changes no native API, addon version or database schema. The closed
Billing gate, hosted tester and production are unchanged. No frontend build,
browser, tunnel, live HTTP server or persistent upgrade was used for these checks.

## Remaining parity and release gates

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
3. Independently replay the React/durable recovery flows against an approved
   matching worker, including destructive-action clarity, linked downstream
   effects, saved-versus-stopped messages and all reference pages. Source tests
   do not replace real browser/IndexedDB, quota, crash or multi-tab acceptance.
4. Independently verify physical stock, reservations, surviving operation lines,
   downstream moves, delivered/received quantities, permitted analytic deletion,
   unchanged protected ledger/payment state and exact duplicate recovery.
5. Verify real transport, IndexedDB/reload/expiry, multi-tab/concurrent save-stop,
   keyboard/narrow layouts, source/runtime matching and approved rollout.

No cancellation control should be made live by calling raw `action_cancel`
through the gateway, changing a display state or bypassing a native rejection.
The owner-closed Billing review gate remains closed.
