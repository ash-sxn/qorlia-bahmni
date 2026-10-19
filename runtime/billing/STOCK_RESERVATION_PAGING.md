# Complete paged stock reservation actions

## React preparation consumer source, 19 October 2026

New preparation actions from transfer details now open the
[paged preparation dialog](../../apps/home/src/components/Billing/PagedStockReservationModal.tsx).
Its [shared confirmation/preparation implementation](../../apps/home/src/components/Billing/PagedStockWriteModal.tsx)
connects the existing load, sequential review, save, status, references and
exact-request stop clients. Native code, API shapes, storage schema, gateway
allowlist and installed module version are unchanged by this UI increment.

- All four native actions remain distinct. Fresh load readiness and each native
  disabled reason control entry; a compact recovery summary is never promoted
  into a new editable load. Package counts appear only when supplied.
- Effects render 50 records per page. Every sequential page and terminal proof
  is required before constructing one nonce and committing the exact request to
  schema-5 storage, before HTTP dispatch. Backward review retains the original
  action/version/proofs. Failed or changed pages cannot be saved.
- Rejection, expiry, response loss and navigation retain the original action,
  scope, proof and nonce. Retry never generates another nonce. Accepted references
  have their own pinned pages; all must be read and a fresh accepted status checked
  before exact clear and authoritative reload. Stop requires explicit confirmation
  and a matching acknowledgment; accepted actions recover their receipt instead.
- The transfer panel resumes paged or legacy preparation in its original dialog,
  including off-page original orders/transfers. Legacy pending requests are not
  converted or overwritten. Only preparation's legacy transfer-size UI lock is
  removed; validation/operation-editor caps, pending locks and native permissions
  remain. [All writers must support stop before rollout](STOCK_REQUEST_STOP.md#remaining-release-gates).

The final Home suite passes **970 tests in 83 suites**, including 24 preparation
dialog cases, the preserved 25 confirmation cases and two new parent-routing cases.
Coverage includes 101 effects/references, bounded rendering, four exact actions,
strict persistence, identity changes, failures, stop/acceptance races and legacy
dispatch. Library/focused source-test types, scoped lint/format/diff, three gateway
unit cases and contributor links pass. These are JSDOM tests with SDK/storage
doubles, not native screen, real IndexedDB, gateway or browser acceptance.

The earlier native HTTP evidence below keeps its separate scope. No frontend
build/server, browser review, expired-gate reopening, installed upgrade, public
tunnel or tester/production deployment is included. Paged operation editing,
large validation/returns and full Billing/product parity remained unfinished at
this checkpoint. The later [operation consumer](STOCK_OPERATION_PAGING.md#react-operation-consumer-source-19-october-2026)
supersedes the operation-editor source gap, not runtime acceptance gates.

## Candidate 55, 16 October 2026

Later source candidate: [candidate 56's complete inventory scope](STOCK_INVENTORY_SCOPE.md)
replaces the new reservation protocol's quant cap with checked keyset scans.
Its verification is separate. The candidate-55 evidence below retains its exact
historical scope, including the then-current quant guard.

This is backend/client integration source, not an available tester UI or a
release. It removes the legacy full-transfer response dependency for Check
availability, Unreserve, Set quantities and Clear quantities. It does not replace
native stock accounting or increase a legacy cap.

Read [the operation protocol](STOCK_OPERATION_PAGING.md) for the shared native
effects engine and [the adapter history](README.md) for
native action semantics and historical evidence.

Implementation: [native protocol](qorlia_billing_ui/models/stock_reservation_paged.py),
[native actions and shared availability rules](qorlia_billing_ui/models/stock_reservation.py),
[effects and rollback engine](qorlia_billing_ui/models/stock_confirmation.py),
[typed client](../../apps/home/src/components/Billing/billingService.ts) and
[gateway allowlist](../../scripts/review-host/server.cjs).

## Contract

All five named methods belong to `stock.picking`. Native Stock User membership,
record/field access, company scope and order/transfer linkage are required.
Entry strips caller-selected context. No generic native model write or stock
action is exposed by the gateway.

| Method                                | Input and output                                                                                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `qorlia_reservation_paged_load`       | `order_id`, `transfer_id`; returns a compact transfer with complete move/operation counts, package count, native reasons for each action, readiness and a source version. |
| `qorlia_reservation_paged_review`     | Exact selection payload plus bounded sequential effect-page parameters. Only the terminal page returns a completion proof.                                                |
| `qorlia_reservation_paged_save`       | Exact completely reviewed payload; rechecks and applies the native action once, compares actual effects and records a protected receipt.                                  |
| `qorlia_reservation_paged_status`     | Same original payload; returns acceptance, original action/state, generated-reference count and compact current transfer state.                                           |
| `qorlia_reservation_paged_references` | Same original payload plus bounded snapshot-bound reference pagination; inaccessible/deleted references do not expose IDs or labels.                                      |

Review selection has exactly four fields:

```text
order_id, transfer_id, version, action
```

`action` is exactly `assign`, `unreserve`, `set_quantities` or `clear_quantities`.
Save/status/reference payloads have exactly seven fields:

```text
order_id, transfer_id, version, action,
review_version, review_complete_token, request_key
```

The request key is a canonical UUID. Review starts with `after: 0`,
`review_version: false` and `continuation_token: false`. Page size is 1 to 100.
Continue using the previous response's exact next offset, review version and
continuation proof. A continuation proof is not a completion proof. Skipped,
stale, modified or incomplete reviews cannot be saved.

Generated references use a separate bounded cursor/version after acceptance.
Check the original request's status after a lost response, not a new intent or
nonce. An unaccepted status does not prove that an in-flight request was
cancelled. Current compact state is not a new action's reviewed load: fetch a
fresh load before starting a different action.

## Native behavior and protection

The existing availability/permission reasons now have one shared implementation
for old and new readers. New actions call the existing native methods, not a
second stock ledger. The complete rollback execution captures stock,
procurement and audit effects. It checks physical quantity, financial rows,
native configuration and relation tables. Unreadable business effects fail
closed; private audit bodies remain server-side and are included in signing.

Signatures and sequential/completion proofs use the distinct purpose
`qorlia.paged-reservation.v1`. They bind the action, original version, complete
effects, actor and active companies. Save uses ordered table locks, repeats the
preview and compares actual native effects before recording acceptance. The
existing protected `qorlia_reservation_receipts` JSON field is reused, with a
separate receipt kind. Existing legacy receipts/contracts are not rewritten.

All four transaction callback queues are quarantined during the new preview.
Failed saves restore record changes and callback queues. Accepted retries return
the receipt without re-running the action, even when a later native Unreserve
has deleted previously generated operations.

Set/Clear quantities record preparation. They do not complete a delivery,
receipt, valuation, invoice or payment. Unreserve must retain native treatment
of quantities already entered; a client must not manually zero rows instead.

## Verification and remaining acceptance

- Home: 886 tests in 80 suites pass, including 36 new typed-client cases.
- Library and focused actual-source/test type checks, scoped lint/format and
  three gateway tests pass. These are source/unit checks, not a running UI.
- The first native reservation/operation/confirmation run executes 135 cases
  with zero assertion failures, one error and zero skips. The 2,001-operation
  Set quantities case is rejected by the preview state-preservation guard.
  Original rows in all 117 checked tables remain after suite rollback, with
  mandatory analytics and native SMS enabled. This failed run is retained;
  it is not reclassified as a pass. It uses source-55 models
  on an isolated installed-50 synthetic copy without HTTP or a persistent upgrade.
- A one-case diagnostic identifies pending original mail tracking being flushed
  after the preview baseline, not changed stock or finance. The shared engine
  now flushes the caller's earlier work before taking that baseline; paged entry
  strips context and drains pending work before pinning a source version.
  No effects/financial/configuration guard is weakened. Both the original
  2,001-operation case and a new pending-precommit regression pass on corrected
  source, with 117-table preservation and all 88 Python source hashes matched.
- The corrected combined reservation/operation/confirmation run passes all 136
  native cases, with zero failures, errors or skips, original rows preserved in
  all 117 checked tables, mandatory analytics and native SMS still enabled.
  All 88 Python source hashes match the committed candidate. This is source 55
  on an installed-50 isolated synthetic copy, not a persistent addon upgrade or
  a full-addon regression.
- The actual typed client accepts all 152 recorded native JSON frames across
  load, review, save, status and references. This replay mocks transport; it is
  not HTTP, gateway or browser acceptance.

At this candidate-55 checkpoint, the React reservation dialog and recovery
consumers still used the older protocol. The later React source checkpoint above
supersedes that consumer gap, not the remaining runtime acceptance gates.
The shared [storage slot supports completed requests](STOCK_RECOVERY.md),
but adding storage/SDK support does not migrate a consumer. The operator review gate
stays closed. The native HTTP evidence below does not claim a frontend build,
browser test, protected-gateway acceptance, tester/public deployment or source-55
installed upgrade.

## Native HTTP reservation and recovery checkpoint, 16 October 2026

The committed source-55 adapter and actual typed client complete ten logical
accepted actions over 24 sequential effect pages on an isolated installed-49
synthetic database. The private native server has no published ports and is
stopped after verification. No review gate, tester or production environment is
opened or upgraded.

- A small transfer and a transfer retaining all 501 original moves each run
  native Check availability, Set quantities, Clear quantities and Unreserve.
- A transfer retaining all 2,001 original operation rows runs Set quantities and
  Clear quantities. Its original reservation of five units remains; the test
  does not delete its original operations merely to clean up.
- A deliberately withheld accepted response recovers using the exact recorded
  request. Two overlapping identical reservation saves from separate sessions
  resolve once. Old accepted requests remain accepted after Unreserve, with
  deleted operation references unavailable and no repeated reservation.
- Anonymous, logged-out and cross-author access are rejected. Re-authentication
  recovers all ten accepted request statuses. Premature/skipped-page attempts do
  not persist a receipt or business change.
- Independent SQL accounts for changes across all 116 guard tables and checks
  per-row hashes in 31 business/audit tables. Final original move/operation IDs,
  physical stock, reserved totals and delivered quantities match the fixtures.
  Financial/configuration rows remain unchanged. Native audit rows and protected
  reservation receipts are expected changes, not erased to make the check pass.
- The post-close read verifies all ten exact receipt digests, 88 Python source
  hashes, the actual client hash and unchanged final table hashes. It also
  verifies that the private diagnostic is stopped with no published ports.

Retained verifier failures matter. The initial observer expected internal audit
IDs among public business references, then corrected that assumption using
independent SQL without resubmitting the accepted action under a new request.
The first recovered action has reviewed post-save values and unrelated-row hash
checks, but no separately persisted full stored-row before image; do not claim
that stronger proof for it. Later actions capture their original stored rows.

The large native Set quantities action also updates `write_uid`/`write_date` on
2,000 zero-quantity rows. The observer initially rejected those extra row hashes.
A read-only reconstruction of each original metadata pair exactly reproduces
its saved original row hash, proving no other stored field changed on those
rows. The final Clear quantities check captures every original operation row
before dispatch. These are verifier corrections, not a weakened native stock,
financial, access or configuration guard. Failed runs remain in private evidence;
the completed record references them instead of rewriting their history.

Evidence pack: `reservation-http55-acceptance-r4-20261016`, including
`acceptance.json`, `postclose.json` and the exact-request recovery records.
Earlier failed observer packs are retained separately. These are native
HTTP/client checks, not gateway/browser, representative clinical configuration
or hospital-scale acceptance. Timings include independent SQL verification and
must not be advertised as native request latency. The separate full candidate-55
addon regression below is now complete; the earlier 136-case run covers only
reservation/operation/confirmation.

## Full native candidate-55 regression, 16 October 2026

The complete candidate-55 addon suite passes 798 tests with zero failures,
errors or skips. The post-suite rollback check preserves original rows in all
117 monitored tables, with mandatory analytics and native SMS still enabled.
All 88 Python source hashes and the exact file set match source commit
`62c8e4cdd31dfcbe13c4b9f34e659cb18f9b7d39`, not the newer candidate-56 worktree.

This uses source-55 models on an isolated installed-50 synthetic copy without
HTTP or a persistent upgrade. It is a separate run from the source-55 HTTP
checkpoint on installed-49. Neither run proves candidate 56, all clinical
configurations, actual protected gateway/browser acceptance or hospital-scale
performance. There was no frontend build, review reopening or deployment.

Private evidence: `full-addon55-native-tests-20261016.log` and
`full-addon55-source-verification-20261016.json`. The one-off test process exits
successfully; its container is removed. Earlier failed and focused runs retain
their own recorded outcomes.

The existing 2,000-quant inventory guard remains. Paged effects do not turn an
incomplete inventory scope into a safe reservation. Large inventory paging,
other stock actions, broader configurations and complete UI parity remain work.
Each effect page still recomputes the full native preview, and saves hold coarse
ordered table locks. Response bounds are not proof of bounded CPU/memory cost or
acceptable hospital-scale concurrency. Per-transfer JSON receipt storage also
needs an indexed replacement before high-volume fulfillment.
