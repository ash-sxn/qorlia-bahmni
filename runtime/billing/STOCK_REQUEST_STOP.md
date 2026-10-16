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

Remaining release gates:

- Every writer must run the matching candidate before enabling stop. Older
  workers ignore author-namespaced markers. Mixed-version deployment cannot
  guarantee retirement. No runtime rollout is included here.
- Independently verify save-versus-stop concurrency and lost stop responses over
  real native HTTP. Serial native cases and SDK replay do not prove that race.
- Complete installed-upgrade and representative configuration acceptance. The
  source-58 830-case full regression does not establish those runtime states.
- Actual protected-gateway/browser/IndexedDB durability, keyboard/narrow layout,
  multi-tab and reconnect fault acceptance remain open behind owner approval.
- Remaining paged operation/preparation consumers, large validation/return flows,
  performance under realistic hospital load and full Billing/product parity remain.
