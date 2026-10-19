# Complete native return creation and recovery

[Billing](README.md) · [Complete form/review](RETURN_PAGED.md) · [Native return audit](STOCK_RETURNS.md)

## Candidate 63 source, 19 October 2026

The complete native return protocol now has eight fixed APIs: the four existing
load/form/location/review readers plus matching save, status, reference paging
and stop. The native writer requires the exact complete review and checks actual
effects again before recording acceptance. It uses the existing protected receipt
field, not a new stock database or a generic wizard endpoint.

This includes backend/client/source-gateway, durable recovery storage and the
React return form/review/recovery/receipt consumer described below.
A passing client test does not authorize exposing or deploying this source.

Implementation: [writer](qorlia_billing_ui/models/stock_return_paged_write.py),
[native cases](qorlia_billing_ui/tests/test_stock_return_paged_write.py),
[typed client](../../apps/home/src/components/Billing/billingService.ts),
[client cases](../../apps/home/src/components/Billing/__tests__/stockReturnPagedWriteService.test.ts),
[source gateway](../../scripts/review-host/server.cjs).

## Readiness and native behavior

The original form, product-base units, remaining/default quantities, hidden
quantity-update flag, chained-operation effects and role/domain-controlled
location remain native. The new load reports `write_ready` only when its native
form and required stock role/parent write access are available. A successful
complete native review reports true readiness. This replaces the false flag at
the candidate-62 read/review-only checkpoint, not the legacy writer's contract.

Creating a return creates and prepares a linked, uncompleted transfer. It does
not receive the goods, reduce delivered quantities, post a credit note or refund
money. Save receipts retain the state at creation, not a promise that later
physical receipt is finished. The React consumer links to the returned
transfer's separate native operation/validation workflow.

## Exact write and recovery contracts

`qorlia_return_paged_save(payload)`, `qorlia_return_paged_status(payload)` and
`qorlia_return_paged_stop(payload)` accept the same exact eight-key request:

```text
order_id, transfer_id, version, location_id,
lines: [{move_id, quantity}, ...],
review_version, review_complete_token, request_key
```

The original five-key selection is checked without the legacy 500-row cap.
Unknown fields, extra context, hidden quantity-update edits, duplicate/foreign
moves and nonfinite values reject. Proofs are 64-character lowercase hashes;
the caller generates one canonical UUID request key and retains it through
unknown acceptance. The client copies the checked request, not a mutable alias.

Save locks all complete guarded tables in deterministic order before row locks,
rechecks the native scope/receipt, reruns complete rollback review and verifies
both the full review signature and terminal completion proof. It then runs the
original native `create_returns()` through the guarded helper inside a savepoint.
The actual form/effects/private effects/state must match the review before the
protected receipt is recorded. Recording that metadata is checked separately:
the exact map, prior receipts, all other guarded stock/configuration state and
deferred work must not change. A response failure inside that savepoint rolls
back the creation and restores native callbacks; a lost transport response after
acceptance instead requires exact status recovery. It must not generate a new
request or assume failure.

Save/status/stop return exactly:

```text
accepted, stopped, request_key, state_after,
return_transfer, reference_count, current
```

`current` is only order/transfer identity, a current read-scope version and the
complete compact transfer header/counts. It does not depend on an editable return
form or a size-capped legacy graph. `return_transfer` is the one saved native
return reference (`model`, `id`, `name`, `available`), not all reference bodies.

| Outcome | Meaning |
| --- | --- |
| accepted true, stopped false | Native creation was recorded once. The original creation state and return reference/count are recoverable. Exact repeated save or stop returns that acceptance, never creates again or reverses it. |
| accepted false, stopped true | This exact pending request has an author-bound stop marker and cannot later save. There is no return reference or accepted creation state. |
| both false | No exact outcome is known. Keep the request; do not silently clear it or claim cancellation. |

Accepted and stopped cannot both be true. Unknown/stopped outcomes have false
state/reference and zero references. Receipts bind purpose, full request,
author, active companies and order. Old return/validation receipts and new
requests are not interchangeable, even when the UUID is reused. Generic stock
writes cannot forge protected receipts. Lost native access blocks recovery or
returns unavailable references as appropriate; no privileged fallback is used.

## Every saved reference

`qorlia_return_paged_references(payload, after=0, version=false, limit=50)`
requires exact accepted recovery and returns the existing bounded reference-page
shape: request key, version, offset/counts, next offset and rows. Every row has
`key`, `model`, `id`, `name` and `available`. The first page pins the current
native scope/labels; subsequent pages require that version. Reference keys use
native canonical indices and lexicographic order, not UI-generated padded keys.
Missing/hidden bodies do not disclose their IDs or names. An inaccessible linked
record in the complete native order scope denies recovery rather than returning
a misleading partial graph.

All business references must be read and cross-checked against the compact
receipt by the UI before retiring its durable request. Merely receiving
one page or seeing a creation success message is not complete recovery.

## Explicit stop

Stop checks native Stock User membership and parent write ACL/rules, uses the
same deterministic 132-table lock scope as save, then rechecks for an already
accepted or stopped outcome. An accepted action always wins without reversal.
Only an unresolved exact request can get a stop marker. Stop never replays the
return action or tries to undo a native return.

The marker is recorded through the existing protected receipt helper because
ordinary `stock.picking.write()` rejects this field. All guarded state apart
from this transfer's receipt field and normal write metadata must remain
unchanged. Receipt contents and deferred callbacks are checked as well; a
changed lot, configuration or unrelated receipt fails and rolls back the stop.
The durable store waits for fresh exact acknowledgment before clearing the
request. The shared confirmation/preparation/operation stop paths are not
rewritten by this increment.

## Verification checkpoint

The three return client suites pass 124 cases, including 49 new write/recovery
boundary cases. The full Home suite passes 1,289 cases in 92 suites. Library and
focused actual-source/test typechecks, scoped ESLint, format/diff and contributor
links pass. All three isolated gateway fixture cases pass, with the eight fixed
methods gated and generic/private wizard methods denied.

The first private native diagnostic runs all 87 selected cases with zero
failures/one error. The error is the bounds test passing an exception tuple to
Odoo's overridden `assertRaises`, which requires a class. The fixture now selects
the exact expected exception without changing validation. All 132 guarded tables
restore, and mandatory analytics/native SMS remain enabled. This earlier source
run predates the additional metadata-hook guard and its new test. Its failed log
is retained, not counted as current-source acceptance.

The second run passes **88 cases**, zero failures/errors/skips: 16 new writer/
recovery/metadata cases, 56 original and complete-review return cases, and 16
shared stop regressions. All **132 guarded tables** restore; mandatory analytics
and native SMS stay enabled. All **99 Python files/hashes** match the readonly
mount. The 501-positive-line case creates one native return with all 501 moves,
recovers every saved business reference through bounded pages, and proves exact
retry/status do not duplicate it. Original delivered quantity and physical stock
are not changed by return creation. Stop-only state, incomplete proofs, stale
stock, foreign author/protocol, inaccessible scope, actual-effect changes,
receipt response failure and metadata-hook tampering are also covered.

The actual TypeScript client accepts **155 captured native responses** across all
eight APIs: 34 loads, eight line pages, 56 reviews, one location search, 27 status
reads, ten saves, 16 reference pages and three stops. Routes, exact requests,
cursors and proofs agree; transport alone is mocked. This is not actual HTTP,
protected-gateway or browser acceptance. Client source SHA-256:
`62229ec11e0174bc489cf3f8c41b11e4cd66edba2e960dbe2ec0a22b9ecdb00f`.
Final native log SHA-256:
`42bf061715f7553476888959c9b4b27b65885b716e11df9c351ba891bba8c588`.

Private evidence: `return-write63-r1-native-tests-20261019.log`,
`return-write63-r2-native-tests-20261019.log` and
`verify-return-write63-source-wire-20261019.cjs`. The final no-HTTP one-off exits
zero and is removed. Candidate-63 source on installed-49 synthetic metadata is
not a persistent upgrade, full-addon run or clean dependency install. Existing
bootstrap warnings, including the failed pandas dependency attempt, remain in
the logs. An initial client fixture's padded reference indices were corrected
to match native canonical keys without loosening the validator.

## Durable request storage source, 19 October 2026

The [existing stock recovery store](../../apps/home/src/components/Billing/stockReservationRecovery.ts)
now stores a separate return kind in its existing database/account slot. Schema
7 has exactly `schema`, `kind: paged_return`, `database`, `uid` and `request`.
The request keeps all eight original native fields, including every selected
line and completion proof. There is no validation history, new IndexedDB store
or parallel pending slot. Strict readwrite commit precedes a caller's save.

- `persistPagedStockReturnRecovery(uid, request)` copies and validates the exact
  request, refuses another pending action and awaits durable commit. It never
  calls save or stop, including after a quota/write failure.
- `loadPagedStockReturnRecovery(uid)` reads the exact saved request without
  rewriting proofs, changing the nonce or replaying a native operation.
- `clearPagedStockReturnRecovery(uid, request)` first requires that identical
  local pending request. It checks native Billing UID/database and exact status.
  Unknown, failed or malformed outcomes retain the record. An accepted creation
  requires all pinned reference pages, strictly increasing keys across page
  boundaries, consistent counts and the saved return reference. A fresh status,
  final pinned-reference recheck and second account check precede the atomic
  exact-request clear. Explicitly stopped outcomes require no created references.

The account/database checks use the existing native session-info endpoint. Its
installed source exposes `uid` and the active database. The configured frontend
Billing database must match; missing/different identity does not trigger a
fallback or delete the request. A changed pending action before the final clear
is retained. Failed strict deletion commits retain even known accepted requests.

Return requests are excluded from confirmation and generic paged-write
discrimination. The generic resume dispatcher now returns them intact and routes
them to the dedicated React return workflow. All older typed readers/clearers
still reject pending returns. A complete-validation clear also cannot consume
the return kind. Older pending payloads and validation histories are not
migrated, proof-stripped, overwritten or silently cleared.

The storage suite passes **71 cases**, including 24 new return cases. Tests cover
501 selected rows, strict commit/abort, malformed/foreign envelopes, old-protocol
coexistence, unknown reads, all 101 reference rows, missing/overlapping/drifting
references, accepted/stopped retirement, UID/database changes and a different
request appearing before clear. These are an IndexedDB test double and mocked
native transport, not real browser, multi-tab or storage-device acceptance.
The full Home suite now passes **1,313 cases in 92 suites**. Source/test types and
scoped lint/format/diff checks pass. Native contracts/runtime are unchanged by
this storage increment.

## React complete return consumer source, 19 October 2026

The [return dialog](../../apps/home/src/components/Billing/PagedStockReturnModal.tsx)
is available from completed transfer details inside signed-in Billing. The
existing transfer recovery dispatcher recognises the exact schema-7 request,
including its original order/transfer even when another order is currently open.
The workflow uses the same shared Modal, Button, TextInput, effect viewer and
Billing styles as the other redesigned stock workflows. It does not embed the
old Odoo screen, add a pre-login Billing entry or introduce another design system.

1. Load the native compact form and first original-item page. Explicitly load
   every remaining page before review. Counts, metadata, pinned version and
   strictly increasing original move IDs must agree across pages. Only 50 rows
   render at once; loaded quantities and removed selections survive navigation.
2. Edit finite base-unit quantities or remove original rows. There is no new
   default-quantity maximum or zero/negative clamp. Native rejection remains
   authoritative. The hidden order-quantity rule is read-only, not a submitted
   flag. Unit visibility follows the native form. Role-controlled destination
   search uses the pinned native domain and ID cursor; other roles cannot edit it.
3. Review selected item rows followed by every native effect page in order.
   Selection, review identity, counts, metadata and continuation proof remain
   pinned. Reviewed quantities must match the full selection, with original
   products/units/hidden rules. No create action is available before the terminal
   completion proof. Editing again discards the review and starts from page zero.
4. Generate one request key and await strict durable persistence before save.
   On rejection, lost response, session expiry or uncertain status, retain all
   eight fields. Recovery never automatically replays a write. A manual exact
   retry checks fresh status first and uses the same stored payload, not a new
   nonce. A changed storage slot blocks it. Stop has an inline confirmation and
   cannot undo an accepted creation, including when save wins the race.
5. Read every pinned saved-reference page, checking cross-page keys, counts and
   the actual saved return. Missing/inaccessible references are explicit, not
   invented successes. Fresh displayed-outcome and durable-store checks precede
   retirement. Unknown or failed retirement retains the pending request.
6. Open the actual created return in the Qorlia transfer workspace, including
   recovery from another order. Its operations, batches, preparation and native
   validation remain separate. Alternatively finish creation recovery without
   claiming receipt, delivered-quantity adjustment, credit note or money refund.

Closing preserves pending requests. Unsaved form edits require explicit discard
before close, reload or reconnect. Page/error/stop/discard headings have focus
targets; close restores the opening control or its Back-button fallback. The
created-transfer handoff focuses its heading when this will not steal focus
from another control. These are source/JSDOM checks,
not a rendered visual, complete keyboard or assistive-technology acceptance claim.

The component tests use actual React/shared UI with SDK and storage doubles.
They cover complete 501-item loading/review, unit and hidden-rule preservation,
over-return/zero/removed quantities, finite-input correction, inconsistent pages,
strict-commit ordering/failure, unknown/expired/rejected saves, exact retry,
save-winning-stop, acknowledged stop, deletion failure, all 101 references,
missing/overlapping/drifting/inaccessible references, stale displayed outcomes,
native destination rules, dirty discard, focus return and basic axe checks.
Transfer tests cover fresh entry, unavailable unfinished transfers, exact resume
dispatch and opening a returned transfer belonging to another order. Older
typed storage consumers still reject returns rather than converting their proofs.

At this return-consumer checkpoint, **1,354 Home cases in 94 suites** pass, including 35 return
component cases, three actual-SDK wire cases and three new transfer routing cases.
The wire tests stub transport and durable storage, not client request/response
validation. They cover the complete create/reference/handoff path, incomplete
proof rejection and lost save acknowledgment without replay. Library and focused
actual-source/test TypeScript, scoped ESLint, formatting and contributor links
pass. The earlier 88-case native and 155-frame client replay evidence is retained;
native tests were not rerun for this UI-only increment. The first UI diagnostic
failed because JSDOM lacks `structuredClone` and Carbon exposes empty alert
regions; the fixture clone and named error queries were corrected without
relaxing production guards. A subsequent focused run passed before the full suite.

No native contract, addon source, installed version, frontend build/server,
review gate, hosted tester or deployment changed in this consumer increment.

## Native return-to-receipt lifecycle coverage, 19 October 2026

The [lifecycle tests](qorlia_billing_ui/tests/test_stock_return_paged_lifecycle.py)
join the actual complete return, detailed-operation, quantity-preparation and
validation APIs instead of proving only isolated methods. Five cases cover:

- Creating a linked return, editing its native operation and separately receiving
  it, with original stock, delivered quantities and valuation checked.
- Partial receipt and a separate native backorder decision, preserving the
  unfinished backorder and the accepted prompt chain.
- Automatic valuation with a balanced posted journal, required analytic
  distributions and no invented refund or payment.
- Stopping a pending continuation without reversing accepted preparation or
  losing the original return-creation receipt.
- All 501 positive original/return moves through every form, review, prompt and
  reference page, native preparation and separate physical receipt. Exact retries
  must not duplicate accepted effects or receipts.

The initial isolated five-case run passes with all 132 guarded tables preserved,
mandatory analytics and native SMS enabled. That frozen diagnostic predates the
additional saved-prompt and operation-onchange assertions in the current source;
it is not acceptance of those extra assertions. The next full-suite preflight
stopped before execution because the harness expected 847 text-defined methods,
while the native loader includes 898 unique cases through inherited tests. The
diagnostic is retained, and no product test was skipped or changed to fix it.

The corrected 898-case run is in progress against a matching read-only 100-Python-
file source mount in the isolated synthetic native database. Source candidate 63
and installed metadata 49 remain distinct. No HTTP listener, published port,
persistent addon upgrade or frontend server is involved. Do not describe the full
run or subsequent actual-client replay as passed until their terminal results and
matching source hashes are checked. The separate signed-in Billing
[recovery-entry source](STOCK_RECOVERY.md#signed-in-billing-recovery-entry-19-october-2026)
does not change this native contract.

## Remaining work and release gates

Actual HTTP/gateway,
browser/IndexedDB, keyboard/visual, concurrent save/stop, source/worker rollout,
clean install and deployment acceptance remain unproven. Whole Billing and the
remaining product redesign are not complete.

Do not strip `location_id`/`lines`, drop completion proofs or force a return into
an older schema to bypass a failing deployment or acceptance gate.

Complete selected forms still travel in each review/write/recovery request.
Those five fixed complete-return routes get a bounded 1 MiB JSON body allowance,
after authentication. Other non-upload routes keep 32 KiB; named uploads keep
their existing 15 MiB bound. Gateway fixtures check a 5,001-line payload reaching
the authenticated stub, oversized rejection and denial before parsing without
the required clinical session. This is transport-bound evidence, not a native
5,001-line write or a live gateway deployment. Full business captures and repeated native
rollback remain in memory, and locks remain coarse. A 501-row test is not proof
of unlimited payload capacity, realistic hospital latency or concurrent safety.
Those limits need measurement and resolution, not hidden browser truncation.

Review access stays closed. No frontend build/server, browser session, tunnel,
hosted tester update, persistent addon upgrade, purchase or real patient record
change is included in this source checkpoint.
