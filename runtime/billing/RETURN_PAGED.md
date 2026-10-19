# Complete native stock-return form and review

[Billing](README.md) · [Native return audit](STOCK_RETURNS.md) · [Workflow ledger](../../docs/FEATURE_PARITY.md)

Later [candidate-63 creation/recovery source](RETURN_PAGED_WRITE.md) adds the
matching writer, saved references and explicit stop. False-readiness and
missing-writer statements below describe the candidate-62 checkpoint, not the
newer source. Candidate 63 also has dedicated durable recovery storage and a
[React consumer](RETURN_PAGED_WRITE.md#react-complete-return-consumer-source-19-october-2026).
Actual runtime/release acceptance remains separate.

## Candidate 62 source, 19 October 2026

Four fixed APIs reconstruct and review the full installed native return form
without relying on the old 500-move/2,000-operation editable graph. This is the
read/form/review side of the complete return integration, not its completion.
There is no matching new save/status/stop contract, durable return-request storage
or React return editor yet. Load and review explicitly report `write_ready: false`.
Their versions/proofs cannot be sent to the old writer.

Implementation: [native protocol](qorlia_billing_ui/models/stock_return_paged.py),
[native tests](qorlia_billing_ui/tests/test_stock_return_paged.py),
[typed client](../../apps/home/src/components/Billing/billingService.ts),
[client tests](../../apps/home/src/components/Billing/__tests__/stockReturnPagedService.test.ts),
[source gateway](../../scripts/review-host/server.cjs).

## What remains native

The original native default/onchange and `create_returns()` logic supplies the
original move, product, product-base unit, default quantity, hidden order-quantity
update flag, chained-operation warning and role-controlled destination. A browser
cannot introduce a product or editable `to_refund` field. A removed form row is
omitted from the selection; zero rows follow native behavior. Finite quantities
are not artificially capped at the displayed default. Changing the destination
requires the native multi-location role and original-or-return-location company
domain. Configuration, record/field access and complete order/transfer scope
remain checked.

Creation may unreserve unfinished downstream moves, including an earlier return.
It does not physically receive the goods, reduce delivered quantities, create a
credit note or refund money. Physical validation and finance are later native
workflows. See the [installed audit](STOCK_RETURNS.md) before changing these rules.

## Fixed API contracts

All entry points are on `stock.picking`, with no positional RPC args or caller
context. Only allowed company, language and timezone context is retained.

| Method | Contract |
| --- | --- |
| `qorlia_return_paged_load(order_id, transfer_id)` | Compact header/counts, native form metadata or false, native reason, version and false write readiness. No graph or full line array. |
| `qorlia_return_paged_lines(order_id, transfer_id, version, after=0, limit=50)` | Pinned offset page of all original native form lines, sorted by original move ID. Returns order/transfer/version, form metadata, cursor/counts and rows. |
| `qorlia_return_paged_locations(order_id, transfer_id, version, query='', after=0, limit=25)` | Pinned role/domain-bound search. Returns matching location ID/label pairs and a native ID cursor, plus exact query and request identity. |
| `qorlia_return_paged_review(payload, after=0, review_version=false, continuation_token=false, limit=50)` | One complete rollback review, sliced into an ordered line/effect stream, with continuation or completion proof. No save. |

The exact five-key selection is:

```text
order_id, transfer_id, version, location_id,
lines: [{move_id, quantity}, ...]
```

IDs must be original positive integers; quantities must be finite numbers.
Duplicate/foreign moves and unknown keys reject. The private complete-form helper
allows the new protocol to exceed 500 selected rows; the legacy private default,
public payloads and SDK retain their original limits.

Form metadata is exactly `location`, `location_editable`, `show_units` and
`chained_move_warning`. Each native form row is exactly `move_id`, `product`,
`quantity`, `unit` and `updates_order_quantities`. Metadata never contains a fake
empty `lines` array standing in for an unread tail.

The review response returns order/transfer/version/location identity, metadata,
`line_count`, `return_state`, `write_ready`, `review_version`, `after`,
`total_count`, `effect_count`, `next_after`, `line_rows`, `effects`,
`continuation_token` and `review_complete_token`. It does not echo the entire
selected line array on every page. The client validates each returned edited row
against the original selection and requires all line/effect counts to agree.

## Complete review and rollback

The logical stream contains all selected edited form rows, sorted by original
move ID, followed by every readable native effect row. A boundary page can carry
both. Native private audit/financial bodies stay private but remain signed;
readable effects retain the existing values, schema, related labels and
`private_effect_counts` projection.

- Offset and limit are integers, not booleans. Limit is 1 to 100. Location search
  uses an ID cursor; line/review pages use offsets.
- Line/location pages require the original version even on page one. Stale stock,
  labels, form, company/author or configuration require a full reload.
- First review page requires false proofs. Later pages require the original
  review signature and the issued continuation token for that exact position and
  complete selection. Changing quantities, skipping pages or reusing another
  protocol's proof fails.
- The final page alone supplies a completion proof. Its signature binds the whole
  native edited form, selection, public/private effects and resulting state, not
  only the visible page or transient IDs.
- Every page repeats the full native action inside rollback under complete stock
  scope locks. All guarded business/configuration/transient tables and all four
  callback queues must restore. Native notification guards remain enabled.
- The source gateway allows only these four names behind existing authentication.
  Generic wizard access and unimplemented new save/status routes remain denied.

## Verification and remaining work

The two return client suites pass 75 cases, including 56 new boundary cases.
The full Home suite passes 1,240 cases in 91 suites. Library and focused
actual-source/test typechecks, scoped ESLint, format and diff checks pass.
The source gateway's three isolated fixture cases and contributor-link checks
pass. These do not prove real HTTP, browser, native stock effects or release
acceptance.

The first scoped native diagnostic runs all 56 selected cases, with two errors
from missing order procurement-group links in the new large-transfer and
non-base-unit fixtures. All 132 guarded tables restore; mandatory analytics and
native SMS remain enabled. The fixture links are corrected without relaxing the
complete order-scope check. This failed diagnostic is retained, not counted as a
pass. The second run has one remaining order-link fixture error in the 501-move
case because its first move did not inherit the new procurement group. The
non-base-unit case now passes. All 56 cases run, with zero failures/one error,
132-table preservation and both safeguards retained. The first move's link is
corrected without changing the order-scope guard. Both failed logs are retained.

The third scoped native run passes **56 cases**, zero failures, errors or skips:
12 new complete-form/review cases and 44 original native/preview/save regressions.
All **132 guarded tables** restore, mandatory analytics and native SMS remain
enabled, and all **97 Python source files/hashes** match the readonly mount.
The 501-move fixture is physically completed through native confirmation,
reservation and validation, not by assigning a Done state. All 501 original form
rows and all 501 selected edited rows are paged, with an actual tail-move return
inside rollback. The old load/helper still reject their legacy limits. Hiding the
last original move denies the complete new load rather than returning a partial
form. Native units, over-return/zero behavior, role/domain rules, stale stock and
labels, malformed selections, ordered/purpose-bound proofs and callback queues
are also checked.

The actual TypeScript client accepts **45 captured native responses** through all
four methods: 17 loads, eight line pages, 19 review pages and one location search.
Routes, exact selections, cursors, signatures and token parameters agree. Only
transport is mocked; this is not real HTTP, browser or protected-gateway
acceptance. Client source SHA-256:
`9099b6e23135023c41c1e6491e02a37e73062b2421556bfc0108a4c513d52919`.
Final native log SHA-256:
`0cdd58adf6264d3f1116a83227ae8d71519d115745eabb7f9a6095151a2bdddb`.

Private evidence: `return-paged62-r1-native-tests-20261019.log`,
`return-paged62-r2-native-tests-20261019.log`,
`return-paged62-r3-native-tests-20261019.log` and
`verify-return-paged62-source-wire-20261019.cjs`.
The final no-HTTP one-off exits zero and is removed. Candidate-62 source runs on
installed-49 synthetic metadata, not a persistent upgrade or full-addon run.
Existing bootstrap warnings, including a failed pandas dependency attempt,
remain recorded and are not clean-install/dependency acceptance.

Remaining: matching complete native return save/status/stop and reference paging,
durable exact-request recovery, React return form/review/receipt and physical
validation handoff, then actual HTTP/gateway/browser/storage/concurrency and
release acceptance. No review gate, app server, frontend build, tunnel, installed
upgrade or hosted deployment is started by this source checkpoint.

Full business captures remain in memory and each page repeats rollback work.
The review request still carries the entire selected form, and the existing
gateway request-size limit remains. Bounded response rows are not evidence of
hospital-scale payload support, acceptable latency or concurrent safety. Measure
and resolve those limits before claiming complete large-return runtime support.
