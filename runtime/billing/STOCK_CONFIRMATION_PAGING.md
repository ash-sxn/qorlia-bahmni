# Complete paged native confirmation

[Billing guide](README.md) · [Existing confirmation](STOCK_CONFIRMATION.md) · [Detail reads](STOCK_TRANSFER_DETAILS.md)

## Shared confirmation and preparation source, 19 October 2026

The public confirmation wrapper now delegates to
[the shared paged write dialog](../../apps/home/src/components/Billing/PagedStockWriteModal.tsx),
also used by [the preparation consumer](STOCK_RESERVATION_PAGING.md#react-preparation-consumer-source-19-october-2026).
The confirmation protocol, exact recovery and 25 component cases are preserved.
The shared implementation keeps fresh writable loads separate from compact
recovery summaries, retains strict persistence-before-HTTP, complete effect and
reference paging, exact retry/stop and identity/focus boundaries. No native or
gateway contract changes. Home passes 970 cases/83 suites; types and scoped
source checks pass. This does not establish actual browser/storage/gateway
acceptance or deploy a UI. The dated source checkpoint below describes its
original scope; preparation's size-lock/consumer gap is superseded by the later
linked increment. Operation editing and large validation/return flows remain.

## React confirmation consumer source, 16 October 2026

New confirmations from the order-transfer panel now open
[the complete-review dialog](../../apps/home/src/components/Billing/PagedStockConfirmationModal.tsx).
Its compact load, sequential effect review, exact save/status and pinned saved
reference pages call the five existing typed paged APIs. The original
[legacy dialog](../../apps/home/src/components/Billing/StockConfirmationModal.tsx)
remains for older pending confirmation requests; they are never converted to a
new protocol or nonce. Completed paged recovery routes to the new dialog even
when the original order/transfer is not on the current list page.

Confirmation alone no longer inherits the legacy 500-move/2,000-operation UI
lock. Native readiness, role/state restrictions, transfer-page coherence and the
shared pending-request lock remain. Validation, preparation and operation-editor
limits are unchanged until their consumers are migrated. The current transfer
details remain available in the existing paged panel behind the modal; the new
dialog shows compact saved transfer identity, route and record counts, not a
truncated table represented as the full transfer.

Effect pages render at most 50 records at once. Only cursor/proof metadata is
retained for backward navigation, not the accumulated effect graph. A changed
review version, total or outcome rejects the continuation and hides the previous
effects. Save remains unavailable until the terminal completion proof is reached.
Private audit counts apply to the complete review, not each page's row count.

The exact completed request is committed through
[schema-5 storage](STOCK_RECOVERY.md) before HTTP. Unknown responses, expiry and
rejection retain it; no write is automatically retried and no new nonce silently
replaces it. The dialog can explicitly check status or retry the identical
request. Accepted references are paged separately, with their own pinned version,
escaped labels and hidden-reference privacy. Finish requires the reference pages
to be read (or a zero reference count), a fresh accepted status and exact clear,
then authoritative transfer/recovery refresh. Failed reads or clearing keep the
recovery state. Account/order/transfer changes remount local state and discard
late display results; an unmount before storage commit does not start HTTP.

Verification: Home passes 920 tests/81 suites. The five focused consumer/legacy/
SDK/transfer suites pass 126 cases, including 16 new-dialog cases and one new
paged routing case. Checks cover 101 effects/references, bounded rendering,
backward pins/focus, premature-save blocking, durable dispatch order, double-click,
lost-response/remount recovery, rejected retry retention, stale pages, expiry,
unavailable storage, failed finish/clear, native readonly and identity changes.
Initial selector failures were corrected for Carbon's accessible danger label
and appended reference IDs. Test fixture helpers were extracted unchanged for
reuse by SDK/component tests. Library and focused actual-source/test types,
scoped lint/format/diff and all three gateway unit cases pass. The React checklist
was applied to identity keys, async results, stable references and focus, using
the existing design-system controls without new dependencies.

These are source/JSDOM tests with SDK/storage doubles, not a real native browser
save or storage durability test. Earlier native JSON/HTTP evidence retains its
own source/runtime scope. No frontend build/server, visual review, expired-gate
reopening, persistent addon upgrade or tester/public/production deployment.

Remaining release gates include actual protected-gateway/browser/IndexedDB,
keyboard/narrow-layout and multi-tab fault acceptance. Rejected unaccepted
requests now have a later [exact-request stop candidate](STOCK_REQUEST_STOP.md)
in native/client/dialog source. Real HTTP race, matching-worker rollout and
browser/storage acceptance remain release gates. An unaccepted status is not
cancellation, and manually clearing storage is not that contract.
Operation/preparation consumers, large validation/return flows, realistic backend
performance and broader Billing/whole-product parity remain unfinished.

## Candidate 52, 16 October 2026

This is a **native backend candidate**, not a released UI or a deployed tester
update. It adds a separate confirmation protocol for transfers above the legacy
500-move/2,000-operation limits. Existing confirmation APIs keep their original
contracts and limits. Other stock actions do not gain large-transfer support from
this change.

The source now has a typed client and five named protected-gateway routes, with
the scoped native HTTP checks below. At this backend checkpoint there was no
React consumer. The later source integration is recorded above. Do not call
the old modal with the compact response or represent it as a complete stock graph.
The owner-closed review gate stays closed; it must not be bypassed to test this
candidate. Source route coverage is not a deployed gateway or tester upgrade.

Later client integration source adds [completed-request storage](STOCK_RECOVERY.md)
in the existing per-account slot. Its schema 5 is distinct from earlier pending
requests. The modal/routing consumer and actual browser durability checks remain.

## Full-addon mandatory-analytics regression, 16 October 2026

The final native full-addon run passes **765 cases**, with zero failures, errors
or skips. It loads unchanged source-52 application models against the isolated
installed-49 return copy using a read-only source mount and `--no-http`. There is
no persistent upgrade. All original rows in 25 monitored stock, finance, bank,
analytic-plan/default-model, company and configuration tables retain their
fingerprints after rollback. Mandatory analytics remain enabled throughout.

The initial 764-case run records 80 errors in older bank/charge-order fixtures,
not a successful full run. Those positive fixtures omitted required native
allocations. The next 765-case run records three remaining errors: cash-basis
sources using the customer's actual receivable account, and generated discount
lines lacking their native default allocation. Both failed runs and their
preservation checks remain retained. They are not counted as additional passing
coverage or combined to manufacture the final clean result.

The corrected fixtures query native plan applicability for the real company,
account/product and business domain, and supply each mandatory plan separately.
Test staff get the native analytic permission required for those allocations;
explicit permission-rejection cases remain. Generated adjustment lines use an
explicit synthetic partner/account-scoped native distribution rule, rather than
guessing a department from one sale item. The new regression rejects a missing
mandatory allocation without creating invoices or transfers, then confirms with
the complete allocations while retaining the earlier plan's allocation.

Only test fixtures/regressions and documentation change in this increment. No
production model, API, SDK, gateway, authentication policy or dependency changes.
Current Home-809 and gateway evidence remain earlier unchanged-source results,
not newly rerun frontend checks. Native/bootstrap warnings remain in the logs.
The full addon result does not establish installed-52 upgrade, every deployment
configuration, HTTP/browser or representative performance acceptance. The
separate native HTTP cases below have their own scope.

Private evidence: `full-addon52-r4-20261016/native-tests.log` (764/80 errors),
`full-addon52-r5-20261016/native-tests.log` (765/three errors), and
`full-addon52-r6-20261016/native-tests.log` (final clean 765, 25-table preservation).
Read [the fixture/testing guidance](../../docs/testing-guide.md#mandatory-analytic-configuration-is-part-of-the-test)
before extending these tests. Credentials, launch configuration and raw rows stay
outside the public repository.

## Large native HTTP and recovery checkpoint, 16 October 2026

The actual repository TypeScript client now exercises complete large confirmations
and nonempty reference traversal against the private installed-50 synthetic copy
with unchanged source-52 models. There is no mock business response or published
port. Only the diagnostic URL-prefix/cookie transport is adapted.

| Synthetic case            | Visible effect rows reviewed                                      | Accepted native result                                                                           |
| ------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 501 moves                 | 505 records over six pages                                        | 500 merge rows removed, one move retaining demand 501, no reservation or delivery                |
| 2,001 detailed operations | 2,005 records over 21 pages                                       | All 2,001 operations retained, confirmation only, no reservation or delivery                     |
| Three batches             | 13 records in one review page, then three one-row reference pages | Seven units reserved across three new operations, ten physical units retained and zero delivered |

Skipped-page and premature-save proofs reject. The 2,001-operation and three-batch
cases pass exact status/save replay, request/actor/company-bound receipt hashing,
logout/re-authentication and native value checks. The third case deliberately
withholds its accepted response and recovers the original request and all three
generated references without creating another receipt. Stored operations retain
their native move, unit, lot, recorded and reserved quantities.

The first 501-move verifier exits nonzero on its selected product's full-row audit
stamp. Exact SQL reconstruction using only the earlier audit user/date reproduces
the original whole-row hash: its free quantity was already ten and no product
business value changed. A separate read-only recovery exits 0, checks the original
receipt and state, and submits **no save**. The initial failure is retained. A
first read-only recovery attempt loses an expired SSH transport; a fresh private
Unix socket completes it. That transport failure is not counted as a pass or a
reason to repeat a mutation. Later checks retain whole-product comparisons and
allow business changes only when they appear in the reviewed effects.

Independent post-close SQL checks all three receipts, native move/operation/batch
identities and exact request hashes. All 24 monitored table fingerprints match
the final accepted state, with no late writes. Across the diagnostic cases,
stored ledger, payment, reconciliation, valuation, bank, configuration, template
and lot rows remain unchanged. Physical quantity remains ten in each fixture;
only the reviewed third case reserves seven. Mandatory analytics and native SMS
remain enabled. Selected order/line business values are preserved; computed
invoice totals are not independently recalculated.

The reference fixture is separately declared synthetic opening stock. Its seed
preserves all original rows in the same 24 tables and creates only its declared
new rows. It is not stock created by the product confirmation endpoint. The
native HTTP container is stopped and the diagnostic tunnels are closed. Data,
original requests and failed/corrected evidence remain private and retained.

This is correctness evidence in one synthetic configuration, not installed-52
upgrade, actual protected-gateway, browser/human-review or representative hospital
capacity acceptance. The 2,001-operation continuations take roughly 5.6 to 9.3
seconds each and its save takes about 17.3 seconds in this constrained concurrent
diagnostic. These are observations, not a latency/SLA commitment. Complete effects
are still recomputed per page; scale and performance remain open. Other large
stock actions and the paged confirmation review/recovery UI remain unfinished.
No UI gate is reopened and no protected tester/public build is updated.

Private evidence: `paged-confirmation-scale-http52-20261016`, its
`read-only-recovery-r2.json`, `paged-confirmation-scale-http52-r2-20261016`, its
`postclose.json`, and the rollback-only `paged-confirmation-cache-trace-20261016`.
The client SHA-256 remains
`3764949d86e0766e2a20c6202492607bb8be93040076cb3925891a95675dba67`.
Older small-save and empty-reference checkpoints below retain their historical
scope rather than being relabelled as this broader check.

## Client and native HTTP checkpoint

The [Billing service](../../apps/home/src/components/Billing/billingService.ts)
exports these separate methods, without changing legacy consumers:

| Native method                          | TypeScript method                     |
| -------------------------------------- | ------------------------------------- |
| `qorlia_confirmation_paged_load`       | `getPagedStockConfirmation`           |
| `qorlia_confirmation_paged_review`     | `getPagedStockConfirmationReview`     |
| `qorlia_confirmation_paged_save`       | `savePagedStockConfirmation`          |
| `qorlia_confirmation_paged_status`     | `getPagedStockConfirmationStatus`     |
| `qorlia_confirmation_paged_references` | `getPagedStockConfirmationReferences` |

`checkedPagedStockConfirmationRequest` validates the exact six-field recovery
payload. The compact types cannot stand in for a full transfer graph, and the
legacy request validator rejects the new proof field. Existing native effects,
typed field/reference validation and error/session handling are reused.

The page client checks exact keys, selected identities, original state/review
versions, safe counts, exact offsets/lengths/end cursors, mutually exclusive
continuation/completion proofs and ordered native/generated identities. Generated
ordinals are numeric, not lexical. It rejects unsafe ordinals, unused model groups
and unrelated relation labels. Private audit counts remain global repeated
metadata. It does not automatically fetch the next page or submit a save. Callers
must display the reviewed pages and preserve the original recovery request.

Reference pages preserve unavailable records without their identity/name, reject
private audit reference models, and check lexical key order, exact bounds and the
reference-specific snapshot. The [gateway](../../scripts/review-host/server.cjs)
adds only the five public native names. Its three unit tests cover review/clinical
gates, cookie/authorization isolation, exact database, origin/model/method/args/
context restrictions and expiry, including denied raw/private/unknown actions.
These tests use fake backends, not another gate for the real review environment.

The actual TypeScript client also passes scoped native HTTP on a private
installed-50 synthetic copy with source-52 code mounted read-only, no published
port and no persistent module upgrade. Compact reads report all 501 moves and
2,001 operations. A separate one-move/one-operation manual transfer reviews all
five native effects across three pages. Skipping a page and using an intermediate
proof to save reject. Two overlapping identical saves produce one receipt; one
accepted response is deliberately withheld in private transport. Original status
and exact replay recover it, changed accepted payloads reject, old source-50
confirmation/operation receipts still recover, and anonymous/logout/re-login
checks pass. Its accepted generated-reference page is empty. **Nonempty reference
paging and complete large-transfer writes are not native HTTP acceptance here**;
their native/unit evidence remains separate.

The initial HTTP verifier exits nonzero because its full-row preservation check
also detects the selected order's changed audit metadata. The investigation
reconstructs its exact original whole-row SHA-256 using only the earlier
`write_date`/`write_uid`. This proves every other field is unchanged, rather than
dropping the order from financial checks. A subsequent read-only recovery verifier
exits 0, confirms there were no further changes since that first run, and submits
no new mutation. The initial failure, request and dispatch remain retained.

Independent SQL verifies the exact purpose/request/actor/company-bound receipt
hash, one receipt, zero recorded/reserved/delivered quantities for this case, and unchanged unrelated
rows in 20 tables. Invoice/payment/valuation/bank and physical-quant rows are
unchanged; selected-order audit metadata is the explicit exception, not an amount
change. Original installed-49 rows and their copied rows are preserved in 18
tables, with no new ledger/valuation rows. SMS and mandatory analytics remain
enabled. The protected tester remains at 43 with unchanged stored stock/finance.
Computed invoice totals are not independently recalculated.

The temporary backend is stopped, sessions closed and the private SSH socket
removed. Its synthetic data and private evidence remain. The actual review gate
still returns 410. The TypeScript source SHA-256 used for the HTTP checkpoint is
`3764949d86e0766e2a20c6202492607bb8be93040076cb3925891a95675dba67`.
Known native/bootstrap and Unix-socket TCP_NODELAY warnings remain; no dependency
or paid service is added. Library and real-source/test types, scoped lint/format
and the contributor-link check pass. Current Home suite results are recorded in
the readiness ledger.

This checks **service to native API to stored data to typed result**, not a
rendered user story. Actual protected-gateway/native integration, React page
display and explicit human review, browser storage/recovery, installed upgrade,
wider HTTP configurations and realistic scale remain release gates.

## Why a separate contract?

Complete detail reads are not sufficient for a signed write. Native confirmation
can merge or delete moves, reserve batches, create upstream transfers and create
draft supplier RFQs. Its full effects can exceed a single response. Signing only
the first page, or silently omitting later changes, would approve unreviewed work.

This protocol computes the complete native effects, returns every visible changed
record in bounded pages and authorizes a save only after sequential traversal of
all effect pages. The final save recomputes and compares the **complete** effects,
including signed private audit details, before and during the native mutation.
Traversal tokens prove the server delivered preceding pages to the authorized
caller. They do not prove a human read or understood them. A future interface must
display those pages and require an explicit final confirmation.

## Read the code in this order

1. [`order_deliveries.py`](qorlia_billing_ui/models/order_deliveries.py): complete
   order-linked read permissions, snapshot identity and native projections.
2. [`stock_confirmation.py`](qorlia_billing_ui/models/stock_confirmation.py):
   native action, effects/schema capture, financial/physical/configuration guards,
   callback-safe rollback previews and signing.
3. [`stock_confirmation_paged.py`](qorlia_billing_ui/models/stock_confirmation_paged.py):
   compact load, page traversal, completion proof, save/status and reference pages.
4. [`test_stock_confirmation_preview.py`](qorlia_billing_ui/tests/test_stock_confirmation_preview.py):
   existing small-transfer regressions and `test_paged_*` native contract cases.

There is no second confirmation algorithm. Both protocols call the same native
Odoo action and private rollback-preview helper. Package projections and accepted
reference labels also reuse the existing permission-checked helpers.

## API sequence

All methods are on `stock.picking`, use the authenticated native actor and retain
only `allowed_company_ids`, `lang` and `tz` from caller context. No arbitrary
model, SQL, field, domain, sudo flag or native method is accepted as input.

### 1. Compact load

`qorlia_confirmation_paged_load(order_id, transfer_id)` returns:

```text
order_id, transfer_id, transfer, package_count, reason, write_ready, version
```

`transfer` is the native transfer header with complete `move_count` and
`operation_count`. It does not contain fake empty `moves`/`operations` arrays.
Read the separate detail-page APIs when those collections are needed. Load checks
read access across the complete order-linked graph and packages before returning
counts, then native confirmation write rights and button availability.

`version` binds the complete linked read scope, package digest, native tables,
actor, active companies, native context and current day. It is domain-separated
from the legacy graph version. Load may provide a native unavailability `reason`;
`write_ready` describes the installed contract, not unconditional permission to save.

### 2. Sequential effects review

First call:

```text
qorlia_confirmation_paged_review(order_id, transfer_id, version,
  after=0, review_version=False, continuation_token=False, limit=50)
```

`limit` is an integer from 1 to 100. `after` is a zero-based count of effects
already traversed, **not** a move ID or a transfer-detail cursor. The response:

```text
order_id, transfer_id, version, review_version, state_after, write_ready,
after, total_count, next_after, effects, continuation_token, review_complete_token
```

Effects are ordered by model name, then `created`, `updated`, `deleted`, then the
existing native effect-row order. Each page preserves every native before/after
value, schema field, assigned-on-save marker and generated reference of its
selected records. Relation labels are limited to those rows. Global private audit
counts repeat on each page, are not per-page counts and must not be summed.
Private audit content never leaves the signing engine.

When `next_after` is not `False`, call the same method using that count and the
returned `review_version` and `continuation_token`. Keep the original `version`.
The HMAC continuation proof binds the complete review, original state, actor,
companies and exact next position. Changing page size does not permit a gap.
Missing, forged, reused-at-another-position or wrong-purpose tokens reject.
Every page recomputes the complete rollback preview, so changed state or changed
native effects reject instead of assembling mixed snapshots.

Only the terminal page returns a `review_complete_token`. Nonterminal pages never
return one; the terminal page never returns a continuation token. An actual review
with zero visible changes can finish on its initial empty page, but its private
audit counts/content still participate in signing. Continue/complete/action
signatures have separate domains and cannot be substituted for each other.

### 3. Save once with an exact recovery request

`qorlia_confirmation_paged_save(payload)` requires exactly:

```json
{
  "order_id": 123,
  "transfer_id": 456,
  "version": "<64 lowercase hex characters>",
  "review_version": "<64 lowercase hex characters>",
  "review_complete_token": "<terminal completion proof>",
  "request_key": "<canonical UUID>"
}
```

Save retains the existing coarse deterministic table locks. Under those locks it
rechecks access, current state, complete native effects and the terminal proof.
The actual native action runs inside a savepoint and must produce the identical
complete effects signature. Unreviewed changes roll back stock state, receipts
and callback queues. Physical movement, completed stock or unreviewed financial
and configuration changes are rejected by the shared native engine.

The existing guarded per-transfer JSON receipt stores a distinct protocol kind,
exact request digest, actor, resulting state and native generated references.
No new receipt field or database table is added. An identical accepted request
recovers the original result instead of confirming or adding RFQ quantity again.
Changing its payload, author or protocol while reusing its key rejects.

Persist the exact request before dispatch. If a response is lost, call
`qorlia_confirmation_paged_status(payload)` with that same request. Do not generate
a new key or retry the mutation to investigate an uncertain result.

Save and status return:

```text
accepted, request_key, state_after, reference_count, current
```

`current` is the compact load, not a capped full graph. `state_after` is the
accepted historical state, while `current` describes present native state.
Generated references are paged separately rather than silently truncated.

### 4. Traverse accepted created references

`qorlia_confirmation_paged_references(payload, after=0, version=False, limit=50)`
requires an accepted exact request. It returns:

```text
request_key, version, after, total_count, next_after, rows
```

Each row is `key, model, id, name, available`. Keys are stable generated-reference
keys from the accepted receipt, sorted lexically, not native numeric identities.
`after` is an offset. Continue with the reference page's own version, not the
review or detail version. Changes in native labels, access or linked state reject
stale continuation. Deleted or inaccessible created records keep their reference
key/model but return `available: false`, `id: false`, `name: false`, following the
existing reference recovery policy. They are not recreated by a status/replay.

## Limits and remaining acceptance

Paging bounds the number of records per response, not the byte length of each
record. Each review page and save still capture/hash the entire native effect
scope in memory. Reference pages also build their full permission-checked
reference projection before slicing. Coarse locks and per-transfer JSON receipts
remain existing scale limits. This is not constant-cost paging or hospital-scale
performance acceptance. Native sequences may advance during rolled-back previews.

## Native validation checkpoint

The frozen source-52 candidate ran on private installed-49 synthetic data with
mandatory analytics, without upgrading that database or opening HTTP/browser
access. There are 16 new paged contract cases in the shared native stock suite.
The verification is deliberately reported as separate runs:

- R1 ran 42 confirmation cases: 41 passed and one assertion failed because its
  expected reference models omitted a native-created detailed operation. The
  corrected test compares every returned reference to the exact native receipt.
- R2 ran all 238 selected shared-stock cases: 237 passed, zero failed, one errored
  and zero skipped. The error was Odoo's assertion helper rejecting a tuple of
  exception classes, before the malformed-input API calls could run.
- R3 reran that corrected reference-page case: one passed, zero failures/errors/
  skips. Its adapter source is byte-identical to R2; the only addon file difference
  is the test assertion using the common native `UserError` base class. Together
  these runs exercise 238 distinct cases, **not** a clean single 238-case rerun
  after the test fix, nor a full-addon or installed-52 acceptance suite.

The cases verify all effects of a 501-move native merge across pages and save,
all 2,001 native operation updates across pages and save/status/exact replay,
unchanged legacy caps, native reservation without delivery, MTO supply, draft
supplier RFQs and exact retry without added quantity. They also cover strict
requests, missing/skipped/tampered/wrong-purpose proofs, actor/company/hidden-row
checks, stale state/inventory, identical full-effects reconstruction, callback
rollback, actual unreviewed-effect rejection, private-audit signature binding,
complete created-reference traversal, stale labels and unavailable hidden RFQs.

Each run's rollback check preserves the original rows in 18 stock/financial
tables and mandatory analytic configuration. Independent stored-data checks keep
the hosted tester at 43 and the prior validation/completed-receipt copy unchanged.
The review gate remains 410. No surviving synthetic mutation, persistent upgrade,
new HTTP server, frontend build or public/tester deployment occurs in this phase.
Native sequence advancement is not part of row-fingerprint preservation.

Python syntax, staged diff and contributor documentation checks pass. No fresh
Home/UI suite is claimed because client/UI code is unchanged. Pre-existing native
warnings and the bootstrap's unsuccessful optional pandas lookup remain recorded
in private logs; no new dependency is added.

The client/native HTTP checkpoint above supersedes the earlier missing client
and named-route work, not the untested configurations and release gates it lists.
Other large stock actions remain limited until their own complete review/write
contracts are implemented and accepted.
