# Complete inventory scope for paged reservation

## Candidate 56, 16 October 2026

Later source candidate: [candidate 57's operation-form integration](STOCK_OPERATION_PAGING.md#candidate-57-complete-operation-inventory-16-october-2026)
extends this reader to the new operation protocol and adds a matching choice
search method. Its native verification and UI migration are separate; the
candidate-56 results below do not automatically accept that newer path.

Source candidate with scoped native evidence. This is not an installed upgrade,
reopened review, frontend build, browser acceptance or tester release.
Candidate-55 evidence does not automatically verify this newer implementation.

The [paged reservation protocol](STOCK_RESERVATION_PAGING.md) previously reused
the legacy inventory reader, which refuses a relevant inventory above 2,000
stock-quant rows. A stock quant is the native quantity for a product, location,
lot, package and owner combination, not an invoice or a patient record.

The new reservation load/review path now explicitly requests a complete scope
from the shared private reader. The five public reservation method names and
payloads are unchanged. Clients cannot select this private mode through a new
payload or context flag.

## What is read and checked

1. Keep the native transfer's products, source locations and source sublocations,
   with its company/shared-stock selection. Do not substitute a wider global
   warehouse search or silently omit inaccessible stock.
2. Check the fixed product, UOM, category, source ancestry, linked operation lots
   and operation-type dependencies using the existing field/record access checks.
3. Select matching quant IDs in ascending keyset pages of at most 500. SQL finds
   the complete matching set before native record rules are checked. A hidden
   row therefore blocks the review instead of disappearing from its inventory.
4. On every page, reuse those same checks for quants, their locations and lots,
   and related records including owners, packages, products and companies. Read
   the same quantity, reservation, expiry and removal-policy fields as before.
5. Bind the checked fixed scope and every ordered page into a chained digest,
   including the final quant count. The server uses this compact summary in the
   existing source-version calculation. It does not return a giant quant array
   to the client or treat the first 2,000 rows as the full inventory.

Native allocation/removal remains Odoo's responsibility. This reader does not
allocate stock, decide FIFO/FEFO itself, change physical quantities or replace
the native rollback/effects engine. Saves still require the complete sequential
review, exact proof, native access checks, unchanged source and matching actual
effects before the protected receipt is recorded.

## Compatibility and boundaries

- The default private-reader mode keeps the legacy response and 2,000-quant
  guard. Legacy reservation and operation-form/edit callers are not migrated by
  this change. In particular, large-inventory operation editing remains work.
- Accepted old reservation receipts must recover without rescanning inventory
  or re-running allocation. An unaccepted request whose source version changed
  must be rejected and reviewed again, not silently translated into a new save.
- This is an internal complete-scope reader, not a new stock-browser screen or a
  user-facing inventory-page API. The React reservation dialog and recovery
  storage still require migration to the newer stock protocols.
- Quant pages bound their query/read batches and the version payload. Fixed
  transfer dependencies are still read as complete recordsets. This does not prove
  bounded total ORM cache, native effects-memory use, preview CPU or response
  time. Complete scans remain linear; repeated native previews and coarse table
  locks remain. Do not claim hospital-scale performance acceptance.

## Checks and evidence

Eight native regression cases have been added in
[the reservation tests](qorlia_billing_ui/tests/test_stock_reservation.py):

- Every row of a 2,001-quant scope is checked in bounded batches, with stable
  summaries and the legacy cap still closed.
- A tail quantity, lot expiry or removal configuration change invalidates the
  scope, and stale reservation review is refused.
- A hidden tail quant, lot or owner blocks the complete scope.
- Quant field access is checked even on the final page.
- Product/source-subtree boundaries exclude unrelated stock and include children.
- Native review/save/exact-request recovery work beyond the legacy quant cap,
  while preserving physical stock and delivered quantities.
- Requests accepted using the preceding inventory shape remain recoverable
  without rescanning inventory or repeating allocation.

The initial 143-case native run contains the first seven new cases plus existing
stock tests. It records zero assertion failures, one test-fixture error and zero
skips, with all 117 checked tables preserved after rollback. A later
recovery-compatibility test was added separately; do not count that new case as
executed by the earlier frozen test package.
The first final 38-case run also records zero assertion failures, one test-fixture
error and zero skips, with all 117 checked tables preserved after rollback.
Copying an unrelated product returned an empty variant in this native stack;
the fixture now creates its unrelated product directly. This changes no native
guard or allocation behavior. The failed run is retained and the corrected
38-case run passes with zero failures, errors or skips. Its clean package's exact
88 Python files and hashes match the final source, including all eight new tests.
All 117 checked tables retain their original rows after suite rollback, and
mandatory analytics/native SMS remain enabled. This uses source-56 models on an
isolated installed-50 synthetic copy without HTTP or a persistent upgrade.

Python AST/diff checks, the unchanged 36 typed reservation-client cases, three
gateway unit cases, scoped formatting/lint and 33 contributor documents/559 links
pass. Private evidence: `inventory-scope56-r2-native-tests-20261016.log` and
`inventory-scope56-r2-source-verification-20261016.json`. Failed initial and first
final runs remain separate. The one-off jobs have exited and their containers
are removed. These scoped native tests are not a final full-addon, protected
gateway/browser or performance acceptance result. Actual HTTP evidence is
recorded separately below.

## Native HTTP checkpoint, 16 October 2026

Source commit `995affc4815f05c61c84ff7cd8ce59cca10ad370` and the actual typed
reservation client complete four logical accepted actions over ten sequential
effect pages against one synthetic product with 2,001 quant rows. This is
source-56 code on an isolated installed-50 database, not a persistent upgrade.
The private native server has no published ports and is stopped afterward.

- The legacy reservation load remains closed at its inventory guard. The new
  load/review/save/status/reference methods operate on the complete scope.
- Native Check availability reserves five units. Set quantities records five
  done units as preparation, Clear quantities returns them to zero, and
  Unreserve returns reserved stock to zero and removes the test-created
  operation. The original move and all 2,001 quant identities remain.
- A reviewed request is rejected after the last quant's quantity is changed.
  Independent reads confirm no receipt or allocation is written. The test
  explicitly records and restores this one synthetic fixture edit; only its
  quantity and native write metadata change. It is not a new generic-write
  route in the product gateway.
- A deliberately withheld accepted response recovers using the exact saved
  request. Two overlapping identical Unreserve requests resolve to one receipt.
  Accepted request replays create no further monitored business/receipt changes,
  including after the old operation reference is deleted and becomes unavailable.
- Anonymous/logout access is rejected and re-authentication recovers all four
  accepted statuses. A second permitted Stock User can load the transfer but
  cannot read another author's acceptance receipt.
- Before/after SQL checks account for reviewed changes across all 116 guarded
  tables and per-row hashes in 31 business/audit tables. All four actions have
  persisted original stored-row before images. Financial/configuration rows,
  unrelated records, physical stock and delivered quantities remain unchanged.
  Native audit records and protected receipts are expected changes, not deleted
  to make the verifier pass.
- Independent post-close SQL verifies four exact receipt digests, all original
  move/quant IDs, physical total 2,010, zero reserved/done/delivered quantities,
  the restored tail quantity and absence of a receipt for the rejected request.
  Final table hashes show no late/shutdown writes. The exact 88 Python files
  match the committed source and the actual client hash matches the tested
  client. The diagnostic is stopped with no published ports.

Private evidence: `inventory-http56-acceptance-20261016`, including
`acceptance.json`, `postclose.json`, recorded original requests and the fixture
injection/restoration checks. Native serialization retries during the overlapping
request test are not a performance guarantee. Timings include independent SQL
verification and must not be presented as native request latency.

This verifies scoped actual client/native HTTP behavior, not the live product
gateway, React dialog, durable browser recovery, full-addon/configuration matrix
or representative hospital-scale performance. No frontend build, review
reopening, tester/public deployment or production change occurred. The operation
editor's legacy inventory reader and stock UI migration remain work.

Implementation: [shared scope reader](qorlia_billing_ui/models/stock_reservation.py)
and [explicit paged reservation callers](qorlia_billing_ui/models/stock_reservation_paged.py).
