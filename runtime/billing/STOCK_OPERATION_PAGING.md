# Complete paged stock operation review

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

| Endpoint | Contract |
| --- | --- |
| `qorlia_operation_paged_load` | Same single-operation form shape as the existing reader, with readiness based on native rules rather than the old review-graph cap. |
| `qorlia_operation_paged_onchange` | Same ordered native edit history and base form version. Preview writes and all four transaction callback queues are rolled back. |
| `qorlia_operation_paged_review` | Exact selection/action/edits, bounded effect pages, sequential continuation and a terminal completion proof. |
| `qorlia_operation_paged_save` | Exact terminal request, actual native create/edit/delete, rechecked effects and a protected duplicate-safe receipt. |
| `qorlia_operation_paged_status` | Exact-request recovery with historical operation ID/state and a compact current transfer summary. It does not need the original row to still exist. |
| `qorlia_operation_paged_references` | Snapshot-bound pages mapping reviewed virtual keys to available saved native references. Hidden references do not expose IDs or labels. |

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
- The React operation dialog and durable browser recovery slot have not yet
  migrated to this protocol. Component/client tests do not prove browser parity.
- The existing 2,000-quant inventory guard and choice prefix/offset search limit
  remain. No inventory or catalog cap is silently relaxed.
- Each page still computes the full native preview, and saves use coarse ordered
  table locks. This bounds responses, not CPU/memory work or lock duration. It
  needs realistic performance/concurrency verification before hospital release.
- Per-transfer JSON receipt storage still needs indexed storage before
  high-volume fulfillment. Native installed-upgrade, actual client/native HTTP,
  protected-gateway/browser and broader configuration acceptance remain open.

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
