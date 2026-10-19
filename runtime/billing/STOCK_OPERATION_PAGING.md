# Complete paged stock operation review

## React operation consumer source, 19 October 2026

New create/edit/removal actions from transfer details now open the
[complete operation editor](../../apps/home/src/components/Billing/PagedStockOperationEditor.tsx).
It connects the seven existing named paged clients: native form load, rollback-only
onchange, native choice search, complete effect review, save, status and references.
The [shared request recovery dialog](../../apps/home/src/components/Billing/PagedStockWriteModal.tsx)
also connects exact operation stop, alongside confirmation and preparation.
No native/API/storage-schema/gateway/module-version change is included.

- The [shared fields](../../apps/home/src/components/Billing/StockOperationFields.tsx)
  preserve all 14 native field identities, readonly/visibility rules, warnings,
  units, batches, prices and UTC expiry. Ordered edits replay native onchange;
  the editor does not invent a separate stock calculation. Choice search uses
  the complete form's version and a protocol-separated query cache, never the
  legacy endpoint with a new version. Native choice/edit-count bounds remain.
- Every sequential 50-effect page and terminal proof is required before save.
  Review locks the form; returning to edit requires another complete preview.
  Backward paging retains original action, scope and proofs. Changed/failed pages
  cannot leave a stale saveable review. Unsaved edits require explicit discard.
- Save commits the exact action/edits/proof/nonce to schema-5 storage before HTTP.
  Rejection, expiry, navigation and lost responses retain it. Recovery is read-only,
  never generates a new nonce and does not reload a fresh form over a pending
  request. All pinned accepted references and fresh receipt identity/state/count
  are checked before exact clearing. A changed receipt retains recovery.
- Explicit stop requires the matching native acknowledgment; acceptance wins
  recover a receipt instead of undoing stock. Unknown/failed outcomes remain
  pending. [Every writer must support stop before release](STOCK_REQUEST_STOP.md#remaining-release-gates).
- Parent routing preserves original pending protocol, order, transfer, move and
  operation, including off-page/deleted rows. Legacy requests still use the old
  editor. Only operation editing's old transfer-size UI lock is removed here;
  native eligibility, pending locks and validation's size guard remain.

The shared input conversion also corrects a browser/native mismatch in both
editors: `datetime-local` may append `.000`, while native expiry accepts whole UTC
seconds only. Zero milliseconds are removed without device-zone conversion;
non-zero fractions are rejected rather than silently rounded.

Verification: **1,012 Home tests in 85 suites pass**, including 26 new editor/
recovery cases, 12 input-conversion cases, two complete-choice cases and two new
original-kind routing cases. Existing legacy operation, 25 confirmation and 24
preparation cases remain passing. Library/focused source-test types, scoped
lint/format/diff, three gateway unit cases and contributor links pass. Test-only
row-count/danger-label assumptions, fixture literal types and import/format
issues were corrected; native validation/permission guards were not weakened.

These are source/JSDOM checks with SDK/storage doubles, not native screen,
actual protected gateway, real IndexedDB, browser keyboard/layout/multi-tab or
runtime-upgrade acceptance. Earlier native/HTTP evidence below retains its own
scope. No frontend build/server, review-gate reopening, tunnel, addon upgrade or
tester/production deployment. Large validation/returns, broader Billing parity
and the remaining product redesign are unfinished. The dated candidate-57
consumer gap below is superseded by this source increment, not a release.

## Candidate 57, complete operation inventory (16 October 2026)

The new operation protocol now uses the complete inventory reader from
[candidate 56](STOCK_INVENTORY_SCOPE.md), not the legacy 2,000-quant response.
Load, rollback-only onchange, readiness, review and save bind the same checked
inventory summary. Shared private form helpers preserve native field defaults,
domains, readonly rules, warnings and callback/savepoint handling. Legacy public
form/edit/choice endpoints keep their signatures, inventory shape and cap.

There are now seven named paged operation APIs. The added
`qorlia_operation_paged_choices` uses the same native field domains, groups,
`name_search`, 25-row pages and search/offset bounds as the existing choice
reader, but it validates the new form's complete-inventory version. Its typed
client is `getPagedStockOperationChoices`; the gateway adds only this exact
named route. No generic model write, arbitrary domain or caller-selected scope
flag is exposed.

Use the new choice method with a new paged form version. Do not feed that version
to the legacy choice reader or infer a protocol from the opaque version hash.
Accepted earlier operation receipts still recover without rescanning inventory
or applying an operation again. An old unaccepted form must reload/review after
its source version changes, not be silently converted to another request.

The prefix/offset choice-search limit remains. Complete inventory validation is
not a new unbounded catalog search or proof of bounded total ORM/effects memory,
preview CPU or acceptable hospital-scale locking. The React dialog, choice
component and recovery consumers have not yet migrated. The shared
[storage slot now accepts the completed protocol](STOCK_RECOVERY.md); that is not
consumer or browser acceptance.

Current source checks: Home passes 895 tests/80 suites, including nine new client
cases; library and focused actual-source/test type checks, scoped lint/format,
Python AST and three gateway unit cases pass. Eight native regressions cover
large inventory load/onchange/choices, stale/hidden tails, native create/edit/
delete/recovery, previous accepted receipts, choice domains/groups/bounds,
caller-context stripping and preview writes/callbacks. The first 56-case native
run retains two assertion failures, zero errors/skips and original rows in all
117 checked tables after rollback. The corrected run passes all 56 cases, zero
failures/errors/skips, with all 117 tables preserved and mandatory analytics/SMS
retained. Its exact set of 88 Python files and hashes matches the working source.
The actual typed client accepts 285 captured native JSON frames: 35 loads,
141 onchanges, 42 reviews, 32 statuses, 25 saves, five choice pages and five
reference pages. Client SHA-256 is
`af0d73a86ac2dccb7329f7d297d8f65a83a995f8a44189532859654a7dde6bb5`.
Only replay transport is mocked; this does not prove real HTTP/authentication.

Retained private evidence: `operation-inventory57-native-tests-20261016.log`
(failed first run), `operation-inventory57-r2-native-tests-20261016.log`,
`operation-inventory57-r2-source-verification-20261016.json` and
`operation-inventory57-r2-native-wire-result-20261016.json`. These are source-57
models on installed-49 isolated synthetic data, with `--no-http`, not a persistent
upgrade or final full-addon result.

Both corrections are in test fixtures, not product guards. Lot tracking is
implied by this stack's Internal User feature group, so the absence fixture must
remove that implication inside its rollback transaction before asserting the
role is absent. Native precommit work runs to flush inside the preview savepoint;
the callback test now verifies that its writes roll back, deferred callbacks do
not run, and original queue objects are restored. It does not incorrectly demand
that precommit never executes. No running hospital configuration is changed.

Scoped candidate-57 native HTTP and full-addon evidence are recorded separately
below. No actual protected-gateway/browser, installed upgrade, review reopening,
frontend build or tester/public deployment is claimed. The earlier six-method
contract and historical evidence below keep their own scope.

## Complete inventory native HTTP checkpoint, 16 October 2026

Source commit `71c04d26` and the actual TypeScript client pass four logical
accepted operation requests over seven effect pages against the existing
isolated synthetic 2,001-quant inventory fixture. Before each action, the new
form loads and choice search finds the last inventory batch. Legacy form access
still rejects above its inventory cap. Two overlapping identical create requests
from different sessions of the same actor resolve to one operation/receipt.
The operation is then edited to two units, restored to zero and deleted.

The accepted edit response is deliberately withheld. Exact status/replay recovers
without another edit. A premature completion proof and skipped review position
reject. Anonymous/logout access and cross-author recovery reject. Re-authentication
recovers the four exact receipts; a deleted operation reference is unavailable,
and replay does not recreate it. Native fields, effects and reference pages are
checked against stored rows, not only UI-shaped fixtures.

Independent read-only SQL after the diagnostic is stopped verifies all four
receipt digests, accounted changes across 116 guard tables, 25-table per-row
checks and no late/shutdown writes. Original move/operation and all quant IDs
remain, with physical quantity 2,010 and reserved/done/delivered quantities zero.
All 88 Python file hashes match both the actual mounted source and the Git
commit; the actual client hash matches the replay result above. Mandatory
analytics and native SMS remain enabled. This reuses the source-56 synthetic
fixture on installed-50 with source-57 models, not a persistent module upgrade.

Private evidence: `operation-inventory-http57-acceptance-20261016/acceptance.json`,
its durable request/dispatch/before/after/reference records and `postclose.json`,
with `verify-operation-inventory-http57-20261016.cjs` and the post-close verifier.
The private diagnostic and Unix-socket tunnel are stopped; no TCP port was
published. This is not the protected review gateway, browser, React/recovery
migration, realistic performance/concurrency acceptance or a tester deployment.
The separate full 814-case native addon regression on installed-49 passes with
the exact source verification below; it is not actual HTTP or UI acceptance.

## Full native candidate 57 regression, 16 October 2026

All 814 addon cases pass with zero failures, errors or skips on the isolated
installed-49 synthetic copy, with `--no-http` and no persistent module upgrade.
Original rows in all 117 checked tables are preserved after rollback. Mandatory
analytics and native SMS remain enabled. The complete 88-file Python set and
every SHA-256 match Git source commit
`71c04d26d5cd02cf2f302876a87fd9a99564e0e7`, independently of later client-only
commits. This covers the complete inventory integrations in candidates 56/57,
not merely the earlier candidate-55 full regression.

Private evidence: `full-addon57-native-tests-20261016.log`,
`verify-full-addon57-source-20261016.cjs` and
`full-addon57-source-verification-20261016.json`. The terminal process exits zero
and its temporary no-HTTP container is removed. Bootstrap warnings remain in the
log; this is not a clean installation/dependency audit or acceptance of other
native configurations/addons. No port was published.

This closes the clean full-addon gap for that native source/configuration only.
It does not verify the later React dialog/recovery source, actual protected
gateway/browser, IndexedDB, multi-tab faults, installed upgrade, realistic scale
or all Billing/whole-product parity. Review access remains closed and no tester,
public demo or production deployment is updated.

## Candidate 54, 16 October 2026

This backend/client checkpoint removes the legacy full-graph dependency from
operation review and recovery, not by raising its limits or signing one visible
page. The old operation endpoints and their caps remain available for existing
callers. No review access is reopened or tester runtime updated.

Implementation: [native protocol](qorlia_billing_ui/models/stock_operation_paged.py),
[native apply](qorlia_billing_ui/models/stock_operation_edit.py),
[shared effects/rollback engine](qorlia_billing_ui/models/stock_confirmation.py),
[typed client](../../apps/home/src/components/Billing/billingService.ts) and
[gateway allowlist](../../scripts/review-host/server.cjs).

## Request flow

All six endpoints belong to `stock.picking`. They require the native Stock User
role, native read/write/unlink permissions and an order/transfer relationship in
the actor's active companies. Extra caller context is discarded at native entry;
the gateway rejects caller-selected models, methods and contexts.

| Endpoint                            | Contract                                                                                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `qorlia_operation_paged_load`       | Same single-operation form shape as the existing reader, with readiness based on native rules rather than the old review-graph cap.                 |
| `qorlia_operation_paged_onchange`   | Same ordered native edit history and base form version. Preview writes and all four transaction callback queues are rolled back.                    |
| `qorlia_operation_paged_review`     | Exact selection/action/edits, bounded effect pages, sequential continuation and a terminal completion proof.                                        |
| `qorlia_operation_paged_save`       | Exact terminal request, actual native create/edit/delete, rechecked effects and a protected duplicate-safe receipt.                                 |
| `qorlia_operation_paged_status`     | Exact-request recovery with historical operation ID/state and a compact current transfer summary. It does not need the original row to still exist. |
| `qorlia_operation_paged_references` | Snapshot-bound pages mapping reviewed virtual keys to available saved native references. Hidden references do not expose IDs or labels.             |

Choice search continues to use `qorlia_operation_choices` with its native field
domains. That endpoint does not depend on the old full transfer graph.

For a new operation, explicitly select `operation_id: false`. The native form
version, move ID, original operation ID, action and ordered edits stay fixed
throughout review. Never replace the original request with a new nonce after an
ambiguous response. An unaccepted status does not prove cancellation.

## Complete effects, not partial graph signing

The shared engine calls the existing native operation apply path. It captures
the complete stock/procurement/audit effects, including generated references,
and compares physical stock, financial and native configuration state. Metadata
normalization and assigned-on-save identities are reused from confirmation.

Operation guards also cover bank/analytic records and receiving-price
configuration. Financial/configuration guards include many-to-many relation
tables, so changing a zero-rate tax link cannot evade checking just because
monetary totals stay equal. The shared guard strengthens confirmation as well.

Every review page comes from a complete rollback execution. Only its selected
effect rows, their schema/labels and private audit counts are returned. Hidden
audit contents remain private but are included in the server-side signature.
An unreadable non-audit business record fails closed, never silently disappears.
The declared model graph and financial/configuration guards are visible in the
linked source. They are not a claim to audit arbitrary third-party addons;
changing installed native modules requires another contract review and test run.

Continuation and completion proofs are bound to the complete request, review,
position and `qorlia.paged-operation.v1` purpose. Skipped, stale, reordered-intent
or premature requests cannot be saved. Save locks the protected scope, repeats
the preview, executes the real native action and verifies the actual signature
before recording a receipt. Errors restore records and callback queues.

Receipts reuse the existing protected operation JSON field, with a distinct kind
and exact actor/company/request digest. Legacy operation and confirmation proofs
are not interchangeable with this protocol. A retry returns the original
receipt instead of creating, editing or removing an operation again.

## Native behavior and remaining work

- Recording done quantity is preparation, not completed delivery. This protocol
  does not validate stock, post valuation or accounting, or create a refund.
- Units, lot/expiry behavior, package restrictions, receiving prices, native
  warnings and operation state remain native. UI availability is not business
  authorization: the apply path rechecks native rules itself.
- Legacy forms remain inspection-only above 500 moves/2,000 operations. New
  clients must use the complete protocol, not enable an old save button.
- The React operation dialog and recovery consumers have not yet migrated.
  [Storage supports the completed request](STOCK_RECOVERY.md), but component/client
  tests do not prove browser parity.
- The existing 2,000-quant inventory guard and choice prefix/offset search limit
  remain. No inventory or catalog cap is silently relaxed.
- Each page still computes the full native preview, and saves use coarse ordered
  table locks. This bounds responses, not CPU/memory work or lock duration. It
  needs realistic performance/concurrency verification before hospital release.
- Per-transfer JSON receipt storage still needs indexed storage before
  high-volume fulfillment. Native installed-upgrade, protected-gateway/browser
  and broader configuration acceptance remain open. The scoped native HTTP
  evidence below is not a general runtime release.

## Verification record

The private evidence pack retains three run-specific source archives and logs:

1. `operation-paged54-r1-20261016`: 48 operation cases, zero assertion failures,
   one test-harness error and zero skips. Odoo's assertion helper rejects a tuple
   of exception classes before that negative test can execute. The corrected
   assertion does not relax a production guard. This failed run is retained.
2. `operation-paged54-r2-20261016`: 258 stock/delivery/operation/confirmation/
   reservation/return/validation cases, zero failures/errors/skips. It predates
   the final relation-table guard and zero-rate-tax negative check, so it is not
   relabelled as a final-source combined run.
3. `operation-paged54-r3-20261016`: 106 final-source confirmation/operation cases,
   zero failures/errors/skips. All 87 logged Python source hashes match the
   repository. After rollback, original rows in all 116 guarded tables are
   preserved. This includes the 25 monitored stock/finance/bank/company/analytic
   configuration tables preserved in the earlier runs. Mandatory analytics
   remains enabled throughout. These are source-54 models on an isolated
   installed-49 synthetic copy with `--no-http`, not a persistent upgrade.

The final run also records actual public native method arguments/results with
temporary response-recording wrappers. **218 native JSON frames** pass through the
actual TypeScript service: 22 loads, 119 onchanges, 37 reviews, 20 statuses, 16
saves and four reference pages. The replay checks request argument mapping and
response validation, with client SHA-256
`3794698c310c5a9061d84e9c352203dc1b8f8b5ba4f281c96b52a4f33491024b`.
Only the replay transport is mocked. This is native/client JSON-contract
evidence, not real HTTP, authentication, gateway concurrency or browser acceptance.

Home passes **850 tests/79 suites**, including 40 new operation-client cases.
The new and prior paged-confirmation client tests pass together (102 cases).
Three gateway unit cases pass and retain expired access, cookie separation,
database scoping and raw native action denial. Library and focused actual-source
test types, scoped lint/format, Python parsing, diff and contributor-link checks
pass. Initial unit fixtures were corrected to use native ERP session-error code
100 and native rejection arguments rather than treating an HTTP 401 as ERP
expiry. No production session behavior was weakened.

The temporary native containers are removed and no ports were published. No UI
build, installed upgrade, actual protected-gateway/native HTTP, browser or
public/tester deployment is claimed here. Review access stays closed. Bootstrap
warnings remain in the private native logs.

## Native HTTP operation and recovery checkpoint, 16 October 2026

The actual TypeScript client and source-54 native HTTP passed 11 logical accepted
save requests over 26 reviewed effect pages on a separate installed-50 synthetic
copy. The tests cover one reserved transfer, a fresh unmerged 501-move transfer
and an existing 2,001-operation transfer. They exercise native load/onchange,
complete review, create/edit/delete, exact status/replay and generated references.

The reserved case changes batch and done quantity, verifies the native five-unit
reservation moves between batches, then restores the original batch/zero done
quantity. Its accepted HTTP response is deliberately withheld from the client;
status and exact replay recover without another action. Each fixture also sends
two overlapping identical creates from separate sessions of the same author:
one operation and receipt result. Deletion leaves the original create accepted,
but its deleted reference becomes unavailable and replay does not recreate it.

Anonymous/logout access and cross-author receipt lookup reject. Re-authentication
recovers all original accepted statuses. Independent SQL checks the exact
author/company/purpose/request receipt hashes, stored reviewed business changes,
unrelated rows across 25 monitored tables and all 116 guard-table changes. Old
confirmation receipts remain unchanged. Physical stock, total reservations and
delivered quantities are preserved; test-created operations are removed and all
original moves/operations retained. Native computed balance changes and receipt/
audit metadata are accounted for, not described as a byte-identical reset.

After the private HTTP container and Unix-socket connection stop, an independent
read-only SQL check matches all final hashes with no late writes. It verifies all
11 receipts and all 87 Python source hashes against candidate 54, plus its actual
client hash recorded above. Final states are: reserved case one move/one operation,
physical 20/reserved five; large-move case 501 moves/no operations, physical 20/
reserved zero; large-operation case one move/2,001 original operations, physical
ten/reserved zero. All have zero done and delivered quantity.

The seed's initial duplicate synthetic reference failure rolled back and remains
in the private evidence. A separate initial verifier table-allowlist assertion
failed before any operation dispatch; it is retained too. The corrected run and
post-close check exit zero. Logs/requests stay in the private operator pack:
`operation-http54-acceptance-r2-20261016`, not the public repository.

This is API evidence on one synthetic native configuration. It is separate from
the full-addon regression below, not an installed-54 upgrade, actual protected
gateway/browser or representative performance acceptance. Harness phase timings
include recovery and database verification, not pure endpoint latency. Mandatory
analytics and native SMS remain enabled. No UI gate reopening or tester/public
update occurred. The earlier no-HTTP statements retain their historical scope.

## Full native candidate-54 regression, 16 October 2026

The complete addon suite passes **785 cases, zero failures/errors/skips** on the
isolated installed-49 synthetic database with final source-54 models and
`--no-http`. After rollback, original rows in all 116 guard tables plus
`account_analytic_applicability` are preserved: 117 tables total. Mandatory
analytics and native SMS remain enabled throughout.

All 87 logged Python hashes match commit
`150409d6eab6839201cc411e41869416ac1bef2c`, including its complete Python file
set. This is a clean full-addon result for candidate 54, not a full-source-55
run, persistent module upgrade or browser/gateway/scale acceptance. Its distinct
private evidence is `full-addon54-r1-native-tests-20261016.log` and
`full-addon54-r1-source-verification-20261016.json`. No ports were published and
the one-off native container exited. Review access stays closed.
