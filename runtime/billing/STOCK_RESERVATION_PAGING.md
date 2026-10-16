# Complete paged stock reservation actions

## Candidate 55, 16 October 2026

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

| Method | Input and output |
| --- | --- |
| `qorlia_reservation_paged_load` | `order_id`, `transfer_id`; returns a compact transfer with complete move/operation counts, package count, native reasons for each action, readiness and a source version. |
| `qorlia_reservation_paged_review` | Exact selection payload plus bounded sequential effect-page parameters. Only the terminal page returns a completion proof. |
| `qorlia_reservation_paged_save` | Exact completely reviewed payload; rechecks and applies the native action once, compares actual effects and records a protected receipt. |
| `qorlia_reservation_paged_status` | Same original payload; returns acceptance, original action/state, generated-reference count and compact current transfer state. |
| `qorlia_reservation_paged_references` | Same original payload plus bounded snapshot-bound reference pagination; inaccessible/deleted references do not expose IDs or labels. |

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
  The broader corrected 136-case native
  run is in progress. Focused success is not a clean combined/full-addon result.

The React reservation dialog and durable recovery slot still use the older
protocol and are not migrated by adding these clients. The operator review gate
stays closed. No frontend build, browser test, protected-gateway/native HTTP,
tester/public deployment or source-55 installed upgrade is claimed.

The existing 2,000-quant inventory guard remains. Paged effects do not turn an
incomplete inventory scope into a safe reservation. Large inventory paging,
other stock actions, broader configurations and complete UI parity remain work.
Each effect page still recomputes the full native preview, and saves hold coarse
ordered table locks. Response bounds are not proof of bounded CPU/memory cost or
acceptable hospital-scale concurrency. Per-transfer JSON receipt storage also
needs an indexed replacement before high-volume fulfillment.
