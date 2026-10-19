# Complete validation save, recovery and stop

[Billing](README.md) · [Complete review](VALIDATION_PAGED.md) · [Legacy recovery](VALIDATION_RECOVERY_PAGING.md) · [Storage](STOCK_RECOVERY.md)

## Candidate 61 source, 19 October 2026

This adds the native write/recovery side of complete validation and its typed
clients. It does not migrate the React write dialog, accept a new IndexedDB
envelope, remove current UI write limits or update a running installation.
Native readiness is now reported from actual Validate availability on load;
successful review reports `write_ready: true`. The older candidate-60 false flag
described a checkpoint before this matching native writer existed.

Implementation: [native writer](qorlia_billing_ui/models/stock_validation_paged_write.py),
[complete review](qorlia_billing_ui/models/stock_validation_paged.py),
[native tests](qorlia_billing_ui/tests/test_stock_validation_paged_write.py),
[typed clients](../../apps/home/src/components/Billing/billingService.ts),
[client tests](../../apps/home/src/components/Billing/__tests__/stockValidationPagedWriteService.test.ts)
and [fixed gateway routes](../../scripts/review-host/server.cjs).

## Exact request and save

All five new native methods are fixed `stock.picking` methods. Each accepts the
same exact eight-key request:

```text
order_id, transfer_id, version, continuation_key, decisions,
review_version, review_complete_token, request_key
```

The selection and both review proofs come from the complete native review chain.
The caller must persist the entire request before dispatch. A continuation token
is not a completion token. No caller model, method, wizard identifier, context,
raw action or stripped seven-key request is accepted. The new request digest is
purpose/author/company-bound. Old payloads and pending requests are not silently
converted or made valid by deleting a completion proof.

`qorlia_validation_paged_save(payload)` first checks an exact accepted receipt or
stop marker. It then uses ordered native table locks, rechecks scope and receipt,
recomputes the complete rollback review, and verifies both the full signature and
terminal completion proof. Actual native effects, private effects, input prompt,
resulting state and future prompt must match the reviewed signature inside the
savepoint. Only then are the actual native action/reference identities recorded.
The preview's rolled-back transient identifiers are never reused for a save.

A native prompt continuation consumes only the matching prior author/company/
order-bound prompt. It can explicitly continue a legacy accepted step or a new
accepted paged step, with a fresh complete review. This is not conversion of an
unresolved request. Duplicate nonce/payload saves recover the accepted result;
another intent or family under the same key rejects. A consumed prompt cannot be
processed with another nonce. Missing prompts are not recreated.

The protected existing JSON receipt field is reused. Its native create/write
restrictions remain intact. The fixed internal SQL recorder is used for metadata,
not elevated stock or accounting writes. Stopping a request does not require
exposing or generally unlocking that field.

## Recovery outcome

`qorlia_validation_paged_status(payload)`, save and stop return exactly:

```text
accepted, stopped, request_key, receipt, current
```

`current` is a compact current order/transfer scope and complete header/counts,
not the editable writer version. It remains available without the old full graph.

| Outcome | accepted | stopped | receipt |
| --- | --- | --- | --- |
| Unknown request | false | false | false |
| Accepted action | true | false | This request's accepted native action |
| Stopped initial Validate request | false | true | false |
| Stopped continuation | false | true | The prior accepted action identified by the original continuation key |

The flags cannot both be true. A stopped continuation has not applied this child
request; its prior accepted preparation is still saved. A receipt contains exactly:

```text
request_key, state_after, reference_count,
next_step, prompt_count, prompt_version,
continuation_key, continuation_reason, terminal
```

`state_after` is the state after that accepted native action, distinct from the
current transfer state. Terminal can mean a declined choice with no stock moved.
Missing/consumed/no-longer-permitted prompts retain the accepted receipt and a
reason, without fabricating a replacement prompt or a terminal delivery.

Unknown acceptance is not a stopped write. Do not clear the request, generate a
new nonce or retry a different intent merely because a status/read/save failed.
No request is retried automatically by the new clients.

## Bounded prompt and reference pages

`qorlia_validation_paged_prompt_page(payload, after=0, version=false, limit=50)`
and `qorlia_validation_paged_reference_page(...)` recover the action selected by
the outcome above. Each response retains the submitted `request_key` and adds
`receipt_key`, the accepted action whose prompt/references are being read.
For an accepted request it is the request key. For a stopped continuation it is
the prior continuation key. Unknown requests cannot use these methods to bypass
resolution and resume an earlier prompt.

The UI consumer must match the page's `receipt_key` to the freshly recovered
receipt, as well as checking page version/count/cursor. A key legal for the
request is not proof that the page belongs to the currently displayed outcome.
Versions bind the exact request digest, accepted source identity, complete current
scope and native rows/labels. Later pages need their original snapshot. Limits
are 1 to 100. Stale, hidden or unavailable data does not become a complete subset.
Related labels retain native read/record/field access; deleted or unreadable
references reveal neither IDs nor names. No raw audit or financial bodies are
returned by reference readers.

## Exact stop and prior preparation

`qorlia_validation_paged_stop(payload)` uses the same ordered complete native
table footprint as save, including analytic applicability configuration. After
locking it checks acceptance and any prior stop again. If save already won, the
response is accepted, not falsely stopped. Otherwise an author-bound stop marker
prevents this exact request from being applied later. A different intent under
the same stopped key rejects.

Stop changes only the targeted receipt metadata and ordinary write metadata.
Native business/configuration/financial rows and deferred work are guarded,
including while generating the returned status. Unexpected changes roll back
the marker and restore callbacks. Direct CRUD protection is not relaxed.

Stopping a child does not cancel its parent prompt or undo prior recorded
quantities, receipt prices, stock movement or accounting. Recovery retains that
parent's actual receipt, references and prompt under `receipt_key`. The future
consumer needs a fresh load, complete review and explicit decision to create a
replacement child after the exact stop acknowledgement. It must durably retain
the prior action through that handoff, rather than treating stopped as a blank
new-transfer state. Consumed/missing prior prompts remain explicit.

## Snapshot consistency correction

A combined expiry/partial-delivery diagnostic exposed stale ORM cache values:
raw database table fingerprints were unchanged, but the transfer-scope and
inventory digests differed after lock-time invalidation. Complete load now
flushes pending native work and invalidates the ORM cache before computing its
version. No stale-version comparison is suppressed, ignored or automatically
retried. The targeted native regression passes after this correction.

## Verification checkpoint

Home passes **1,135 cases in 89 suites**, including 26 new write/recovery client
cases. The focused new write/review/legacy-recovery client run passes 99 cases.
Library and focused actual-source/test types, scoped ESLint, three source-gateway
cases and Python parsing pass. Existing compact receipt and prompt validators are
reused without stripping fields at the HTTP boundary. The nested receipt's exact
shape is checked before constructing an internal validation view.

The first private native run executes 49 cases with one stale-version error,
zero failures/skips, while preserving all 130 guarded tables and mandatory
analytics/SMS. A one-case diagnostic reproduces the cache inconsistency; the same
case passes after the source correction, again preserving those guards. The
corrected full run passes **50 cases, zero failures/errors/skips**, preserving all
130 guarded tables, mandatory analytics and SMS. All 95 mounted Python files
match the working source. Installed module metadata remains candidate 49; this
is a readonly source-mount run, not an installed candidate-61 upgrade.

The actual TypeScript client accepts **238 native JSON responses across all
seven methods** (124 loads, 45 reviews, 35 statuses, 24 saves, two prompt pages,
four stops and four reference pages). Only the replay transport is mocked;
this does not prove HTTP, gateway, browser or IndexedDB acceptance. The full
Home suite remains 1,135 cases/89 suites.

Retained private evidence: `validation-write61-r1-native-tests-20261019.log`,
`validation-write61-diagnostic-native-tests-20261019.log`,
`validation-write61-diagnostic2-native-tests-20261019.log`,
`validation-write61-r2-native-tests-20261019.log`,
`verify-validation-write61-source-wire-20261019.cjs` and
`validation-write61-r2-source-wire-verification-20261019.json`. The corrected
log SHA-256 is `e066fde13fef260b7f8b739333921e782ac2c79899b03fe2ceb016637a7c3f4d`.
Do not relabel the retained failures as acceptance of the latest source.

## Remaining gates

New durable storage and exact parent/child handoff, React write/recovery/stop UI,
actual HTTP/protected gateway/browser/IndexedDB acceptance, true concurrent
save/stop fault tests, actual large physical-effect saves and large reference
paging through this new writer, installed upgrade, broader roles/configuration/scale,
large returns and whole Billing/product parity remain unfinished. Existing
storage validators must not be bypassed to fit a new request into an old schema.
Current UI write limits stay unchanged until the full consumer is connected.

The native engine still captures full business tables in memory and repeatedly
previews complete effects with coarse locks. JSON paging is not hospital-scale
performance or concurrency acceptance. Receipt metadata still needs a volume/
retention/indexing review before high-volume fulfilment.

The Billing review gate remains closed. No frontend build/server, live browser,
tunnel, installed upgrade, public/tester/production update or purchase is included.
Native checks use existing private synthetic data, readonly source mounts and
no HTTP or published ports. No dependency-install or clean-install acceptance is
claimed from the upstream bootstrap.

## Later durable-storage integration, 19 October 2026

[Complete validation history storage](STOCK_RECOVERY.md#complete-validation-history-source-19-october-2026)
now preserves exact parent/child requests in the existing account slot, with
fresh native-status gates for continuation, terminal clear and stopped-child
restoration. It does not strip completion proofs or reinterpret older envelopes.
The React complete-write/recovery/stop consumer and generic resume routing are
still unconnected; existing UI limits stay unchanged. The 47 storage cases use
an IndexedDB double, not browser or multi-tab acceptance. This supersedes only
the storage-source item in the earlier remaining-gates list, not runtime parity.

## React complete-validation consumer source, 19 October 2026

The [complete validation dialog](../../apps/home/src/components/Billing/PagedStockValidationModal.tsx)
now connects all seven fixed native APIs and the exact-history store. New transfer
validation and schema-6 recovery route here from
[order transfers](../../apps/home/src/components/Billing/OrderDeliveriesPanel.tsx).
The old 500-move/2,000-operation UI block is removed for this new path, without
removing native permissions, lot checks, required analytics or SMS safeguards.
This is source integration, not an installed/hosted update or browser acceptance.

### User flow and API identity

1. Open a saved order, stock transfers and a transfer, then **Review transfer
   validation**. Complete native load provides the editable snapshot, not the
   compact recovery version.
2. Review every native input/effect page in order. Only the terminal completion
   proof enables **Save reviewed native validation**. Backward navigation does
   not carry a later page's completion token. A changed/failed page hides the
   previous effects and prevents saving.
3. Save awaits strict history-storage commit, then sends only the exact eight-key
   payload. An opening native action may save preparation and open another prompt
   rather than complete delivery. It never automatically chooses that prompt.
4. Read all pinned saved references and prompt rows before the next choice.
   Receipt operation pages retain units, batches, expiry warnings and native cost,
   sale and MRP prices. Explicit receipt/immediate/backorder/expiry choices start
   a fresh complete review using a newly loaded writer version. Read-only receipt
   scope versions are never submitted as editable versions.
5. An accepted terminal action can finish only after all reference pages, a fresh
   matching native outcome and pinned reference revalidation. A terminal decline
   remains distinct from completed stock movement. Unknown outcomes retain the
   exact stored request, with explicit status check or identical retry only.
6. Stop needs explicit confirmation. If save already won, recover its accepted
   result instead. A matching stopped outcome has a separate retire/restore action
   that preserves prior native preparation and history. It does not cancel the
   transfer or silently undo earlier native effects.

Status, prompt and reference responses must match the displayed exact request
and accepted `receipt_key`, including when a stopped child refers to its parent.
Every later page remains on its original pinned version and count. The dialog
renders only the current page while tracking contiguous read progress. Read
failures, stale outcomes, storage failures, expiry, unmount and another pending
request do not produce a blank fresh-write state or an automatic replay.

Older pending atomic/step requests retain their original recovery/writer routes.
The [saved step reader](../../apps/home/src/components/Billing/SavedValidationRecoveryModal.tsx)
can explicitly hand an accepted prompt of any supported size to complete review
after all saved pages and fresh checks. Its exact seven-key parent stays in the
new child's history; no payload or unresolved request is converted. An unknown
legacy request still uses its original identical-request recovery path. All other
older stock-dialog loaders continue rejecting schema 6, while the generic
dispatcher now returns it intact for the new route.

The [native prompt table](../../apps/home/src/components/Billing/StockValidationPromptRows.tsx)
is shared by the older reader and complete dialog. Both retain the established
Qorlia modal, buttons, table layout and native effect viewer. Paging headings,
errors and stop confirmation receive focus; close returns focus to the opener.
Native labels/audit markup remain text, not executable HTML.

### Evidence and remaining acceptance gates

The new dialog has 26 component cases. The six focused dialog/routing/transfer/
legacy-reader/storage/parent-workspace suites pass 152 cases. They use SDK/storage doubles,
including simulated response loss, storage commit/abort, changed page/receipt
identity, explicit legacy handoff and save-winning-stop outcomes. They are not
real browser, native race or human-usability acceptance. The prior failed fixture
selectors counted both captions and summaries, assumed an earlier reference was
still rendered after paging, or did not wait for a one-page prompt to finish.
Those test helpers/selectors were corrected without weakening product guards.
The zero-reference decline fixture also initially overwrote its zero count with
the generic fixture's default 101; the controller correctly refused that mismatch.
The fixture now retains the actual zero-reference outcome and the test passes.

Full Home passes **1,184 cases in 90 suites**. Library and focused actual-source/
test types, scoped ESLint/format, contributor links and diff checks pass. The full
suite initially caught the charge-order parent refresh test still mocking the
older dialog; its mock now follows the actual new route and the quantity-refresh
assertion remains. The React review checklist covered conditional rendering,
effect dependencies, identity/unmount guards, focus and reuse of existing house
components. No new dependencies or parallel stock ledger were introduced.

The unchanged actual SDK still accepts the retained 238 native responses across
all seven methods, with all 95 native Python files matched. That is replay
transport evidence from the earlier 50-case native run, not a new native run or
acceptance of this React consumer against a running server.

Matching addon deployment, real HTTP/gateway/IndexedDB/browser save/reload/expiry/
quota/crash/multi-tab tests, visual and manual keyboard review, native concurrency,
actual large physical-effect/reference saves, broader roles/configuration and
performance remain release gates. The native engine still repeatedly previews
full tables with coarse locks; removing a UI size threshold is not proof of
hospital-scale performance. Large returns and whole Billing/product parity also
remain unfinished.

The review gate stays closed. No frontend build/server, live browser, tunnel,
installed addon upgrade, public/tester/production update or purchase is included.
