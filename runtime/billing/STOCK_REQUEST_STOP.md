# Stop an exact pending stock request

[Billing guide](README.md) · [Recovery storage](STOCK_RECOVERY.md) · [Confirmation review](STOCK_CONFIRMATION_PAGING.md)

## Candidate 58, 16 October 2026

This is native backend, typed client, source-gateway and confirmation-dialog
integration. It is not a deployed feature. The owner-closed Billing review gate
remains closed, with no frontend build/server, persistent addon upgrade or
tester/public/production deployment.

A failed save response leaves its outcome unknown. A missing receipt alone
cannot prove an earlier dispatch has stopped. A pending request must not be
discarded merely to enable a fresh action. This contract lets its author stop
the exact request only if the server has not already accepted it.

**Stop request is not Cancel transfer.** It neither reverses stock changes nor
undoes a previously accepted action. Native transfer cancellation, returns and
accounting reversals retain their separate reviewed workflows.

## Three fixed APIs

| Native `stock.picking` method | TypeScript client |
| --- | --- |
| `qorlia_confirmation_paged_stop` | `stopPagedStockConfirmation` |
| `qorlia_operation_paged_stop` | `stopPagedStockOperation` |
| `qorlia_reservation_paged_stop` | `stopPagedStockReservation` |

Each accepts only its original exact completed paged request as `payload`. Do
not strip proof fields, generate another nonce, alter edits or convert a legacy
request. Public arguments cannot select a receipt field, model, token or caller
context. The source gateway adds these three names only; raw/private methods,
database/context overrides and expired access remain denied.

The result has exactly `request_key`, `stopped` and `accepted`. The request key
must match and the flags must be opposite booleans. The client rejects missing,
extra, malformed and contradictory values while preserving the recovery request.

- `stopped: true`: this author's exact request is retired and cannot later save.
  An identical stop replay returns that result without another write.
- `accepted: true`: the original action already won. Do not clear on this result
  alone. Recover its matching accepted status and reviewed saved references.
- Lost, expired, denied or invalid response: keep the exact pending request.
  Re-authenticate where needed, then explicitly recover the same stop request.

## Native implementation and safety

The existing native Stock User role, transfer write rights/rules, allowed
companies and order-transfer scope apply. Request shape is validated, but stopping
does not require a still-current native preview: stale or rejected review state
is precisely a reason to retire a never-accepted request without applying it.

Stop and save acquire the same ordered stock/finance table locks before business
row locks, then reread receipt/marker and scope. An accepted receipt is never
overwritten or reversed. New stops add only protected JSON bookkeeping on the
selected transfer, using the existing server-only write token. No schema column
or dependency is added.

Markers are bound to purpose, exact payload, author and allowed companies. The
key is author-namespaced (`stop:<uid>:<request_key>`), so another stock user's
guessed UUID cannot retire the original author's nonce. Its metadata write can
invalidate a snapshot version like any other receipt change; a fresh review for
the original author can still use the original nonce. Changed intent with the
same author's stopped key rejects. Status/save/reference reads for a matching
stopped request reject instead of presenting an unaccepted request as reusable.

The write is enclosed in a savepoint with 117-table state checks. Only the
selected transfer's targeted receipt JSON and normal write user/date may change.
Other receipt entries must remain exact. Unreviewed stock/financial/configuration
changes or added deferred work reject and roll back, preserving original callback
queues. Early identical-stop/accepted-receipt recovery writes nothing.

## Confirmation screen integration

The [complete confirmation dialog](../../apps/home/src/components/Billing/PagedStockConfirmationModal.tsx)
offers an explicit inline confirmation explaining the distinction from cancelling
a transfer. Nothing stops automatically or merely from opening the dialog.

Only a matching successful stop result permits exact storage clearing and
authoritative transfer/recovery refresh. If clearing fails, the request remains
stored, save/status controls stay disabled for the known stopped action, and
the same stop can be recovered again. If acceptance won, status/references use
the existing accepted-recovery path instead. Missing accepted status retains
recovery rather than clearing it.

Initial status failure no longer hides a restored pending request. This matters
after a stop committed but its response was lost: status now rejects the stopped
request, while exact stop replay can recover it. Expiry still requires reconnect.
Account/order/transfer identity changes discard late UI results and retain the
old account's recovery record. Duplicate dispatch uses the existing busy lock.
The existing controls/design tokens and bounded page rendering are preserved.

Operation and reservation clients/storage support the new native stop methods;
their complete paged React consumers still need migration. Legacy pending
requests retain their original contracts and do not gain this stop action.

## Evidence and release gates

The corrected isolated native run passes all **16 stop cases**, zero failures,
errors or skips, with all 117 monitored table fingerprints preserved after
rollback. Mandatory analytics and native SMS remain enabled. All 89 Python files
and hashes exactly match the mounted candidate. This is source 58 loaded read-only
on installed-49 synthetic data with `--no-http`, not an installed upgrade.

The first run retains one error: the foreign-order rejection correctly raised
the established native `UserError`, but the test expected `AccessError`. The
corrected assertion checks the existing rejection message. No permission or
production behavior was weakened. Failed evidence remains retained.

The actual TypeScript client accepts **15 captured native JSON responses** across
all three stop methods. Only transport is mocked in this replay. The 15 client
unit cases cover exact dispatch, both outcomes, malformed/extra responses and
requests, expiry, native rejection and transport loss. Confirmation component
tests pass all 25 cases, including nine new stop/recovery cases. Home passes
944 cases in 82 suites. Library and focused actual-source/test types, scoped
lint/format/diff, all three gateway unit cases and 35-document link checks pass.
The initial test lint issue was corrected without disabling the rule. Component
tests use SDK/storage doubles, not a real browser or IndexedDB durability test.
The React checklist preserves existing controls, identity boundaries, bounded
rendering and focus on entering or declining the stop prompt.

The separate full-addon candidate-58 run passes **830 cases**, zero failures,
errors or skips, preserving all 117 table fingerprints after rollback with
mandatory analytics/SMS enabled. All 89 Python files and hashes exactly match
commit `b0862d6a`. The disposable native container is removed. This read-only
source-58 mount on installed-49 synthetic data uses `--no-http`; it does not
establish fresh-install, installed-upgrade, dependency, HTTP, gateway or browser
acceptance. Existing bootstrap/DNS/pandas and custom-module warnings are retained
in the log, not described as a clean dependency install.

Private evidence: `request-stop58-native-tests-20261016.log`,
`request-stop58-r2-native-tests-20261016.log` and
`request-stop58-r2-source-wire-verification-20261016.json`,
`full-addon58-native-tests-20261016.log` and
`full-addon58-source-verification-20261016.json`. Raw proofs, database
rows, credentials and launch configuration remain outside the public repository.

## Native HTTP race and recovery checkpoint, 18 October 2026

The actual repository TypeScript client now passes six controlled native HTTP
race cases on fresh, labelled synthetic transfers: save-first and stop-first for
confirmation, reservation and operation requests. Both independent sessions use
the same native author. PostgreSQL lock queues record both requests waiting
before the observer releases the workflow's first save-lock table. This is
observed concurrency, not a sequence of mocked responses or an arbitrary delay.

In each save-first case, the action is accepted once and stop reports that it
was already accepted. In each stop-first case, the marker is committed and the
competing save rejects without applying its stock action. Accepted replay does
not apply the action again, and matching stop replay writes nothing. One
committed stop response is deliberately withheld; the original request recovers
after logout, an expired-session rejection and re-authentication. Accepted
receipts remain unavailable to a different author.

The six cases use small, one-move transfers. They do not establish large-transfer
race latency or representative hospital capacity. Two separately reviewed native
cleanup requests restore the accepted reservation and operation fixtures. No
accepted action is rerun merely because an observer loses its connection.

Independent post-close SQL verifies all eight requests: five accepted receipts
and three stopped markers, with exact purpose/author/company/request hashes.
All six original move and quant identities remain; each fixture has ten physical
units, zero reserved/recorded/delivered units and no detailed operations left.
All 117 guarded table fingerprints match the recorded final state after shutdown,
with 25 tables also checked per row during action accounting. Existing unrelated
rows remain unchanged outside the reviewed effects. Mandatory analytics and SMS
stay enabled. This is synthetic correctness evidence, not a financial audit.
A separate full-product inventory query confirms exactly the six original quant
rows, sixty physical units in total and no extra/missing quants or reservations.

All 89 mounted Python files and hashes match committed source `b0862d6a`. The
actual client source hash also matches. Source 58 is mounted read-only on the
installed-50 synthetic copy, without an installed module upgrade. The private
HTTP diagnostic is stopped, has no published port and uses no frontend/review
gate. The trusted private observer uses existing administrative SQL access for
locks and comparisons; that access is not part of the product or tester API.

The first seed attempt rolled back because the verifier incorrectly assumed
all three workflows had the same first lock table. Later failed observations
are retained: SSH timeouts, a stopped tunnel, incomplete runner upload/file
ownership, and audit-row identity/receipt-history assumptions. The first
accepted save and later accepted cleanup were recovered without redispatch.
The completed run accounts for those original actions, not six newly repeated
actions. Read-only verification permits a changed date-bound current snapshot
version after midnight, but not changed accepted receipt fields or stored state.

Native review includes visible audit messages, while saved business-reference
pages intentionally omit audit identities. The private verifier resolves those
rows from reviewed values and the complete original table fingerprint, including
when an older row has identical displayed content. It does not expose audit
identities through the API or guess the newest row. No product guard or API
privacy filter changed to make the verifier pass.

The initial client ran through private SSH transport; the completed observer runs
on the VPS's private network with the same compiled TypeScript source and its
verified hash. There is no mocked business response. Raw proofs, credentials,
logs and observer launch files remain private. Evidence is retained in
`request-stop-http58-acceptance-20261017`, the failed revision folders,
`request-stop-http58-local-acceptance-20261018` and the completed
`request-stop-http58-local-r3-acceptance-20261018` with `acceptance.json` and
independent `postclose.json` and `stock-identity-supplement.json`.
Earlier unit and JSON-replay evidence keeps its
separate scope.

## Remaining release gates

- Every writer must run the matching candidate before enabling stop. Older
  workers ignore author-namespaced markers. Mixed-version deployment cannot
  guarantee retirement. No runtime rollout is included here.
- Complete broader configuration, scale and failure acceptance. The six scoped
  HTTP races above do not establish every deployment or large-transfer race.
- Complete installed-upgrade and representative configuration acceptance. The
  source-58 830-case full regression does not establish those runtime states.
- Actual protected-gateway/browser/IndexedDB durability, keyboard/narrow layout,
  multi-tab and reconnect fault acceptance remain open behind owner approval.
- Remaining paged operation/preparation consumers, large validation/return flows,
  performance under realistic hospital load and full Billing/product parity remain.
