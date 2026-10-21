# Complete native validation review

[Billing](README.md) · [Native validation steps](STOCK_VALIDATION.md) · [Saved recovery](VALIDATION_RECOVERY_PAGING.md)

Later [candidate 61 write/recovery source](VALIDATION_PAGED_WRITE.md) adds the
matching native writer and reports actual native write availability. The false
readiness flag and missing-writer notes below describe the candidate-60 checkpoint,
not the newer source. The new React/storage consumer remains unfinished.

## Candidate 60 source, 19 October 2026

This is the complete-review side of the unfinished large-validation writer. Two
fixed `stock.picking` entry points return compact load state and ordered review
pages. They do not implement a new save/status/stop contract, change recovery
storage, remove the current UI write limits or update a running installation.
Both responses explicitly return `write_ready: false`. Do not send their version
or completion token to an older validation endpoint.

Implementation: [native protocol](qorlia_billing_ui/models/stock_validation_paged.py),
[native cases](qorlia_billing_ui/tests/test_stock_validation_paged_review.py),
[typed client](../../apps/home/src/components/Billing/billingService.ts),
[client cases](../../apps/home/src/components/Billing/__tests__/stockValidationPagedService.test.ts),
[source gateway](../../scripts/review-host/server.cjs).

## Why another review protocol is needed

The old editable load constructs a full transfer graph limited to 500 moves and
2,000 operations. Simply removing a React size guard would not complete native
validation. The new load checks the complete native transfer/order scope, package
scope and inventory pages, then signs their digests, native configuration/table
stamps, author, companies and date. It does not return partial move/operation
arrays labelled complete. A read-only saved-receipt scope version is not reused
as an editable review version.

The native validation action, receipt confirmation, immediate choice, backorder
choice and expiry choice still follow the installed native implementation. A
review applies at most one saved-prompt decision inside rollback. It does not
replay an earlier accepted decision or process the next prompt produced by the
current action. Earlier accepted preparation remains saved.

## API

`qorlia_validation_paged_load(order_id, transfer_id)` returns exactly:

```text
order_id, transfer_id, version, transfer,
inventory_quant_count, package_count, reason, write_ready
```

`transfer` is the complete compact header/count contract. The inventory scan
checks record and field access on every page, including a hidden tail. It does
not change the existing capped load or old native payloads.

`qorlia_validation_paged_review(payload, after=0, review_version=false,
continuation_token=false, limit=50)` accepts this exact selection:

```text
order_id, transfer_id, version, continuation_key, decisions
```

The first native Validate action uses `continuation_key: false` and no decisions.
A continuation identifies an existing author/company/order-bound saved native
step and carries exactly one matching boolean decision. No wizard ID, model,
method, raw action or caller context is accepted. Missing/consumed prompts fail
without recreating a transient.

Response fields extend the selection with:

```text
review_version, state_after, write_ready,
input_prompt, prompt_rows, next_step, terminal,
effects, after, total_count, prompt_count, effect_count, next_after,
continuation_token, review_complete_token
```

The one logical review sequence contains **all input-prompt rows first**, then
**all readable native effect rows**. Counts identify the two sections. A boundary
page can contain the last prompt rows and the first effects. `input_prompt` and
`next_step` are bounded metadata/counts, not misleading empty arrays. Input rows
retain native units, quantities, prices, expiry values, warnings and selections.
Next-step metadata describes the prompt that would exist after saving this action;
that future choice is not processed by this review.

Effects preserve the existing native created/updated/deleted/schema/labels shape
and `private_effect_counts`. Unreadable financial/audit bodies stay private but
remain signed. Related labels retain native access checks. The shared effect-page
helper keeps its original `private_audit_counts` default for confirmation,
preparation and operation callers; validation explicitly selects its existing
private-count key.

## Ordered proof and rollback

- Page size is 1 to 100, default 50. Offsets must be nonnegative integers, not
  booleans. First page requires false review/continuation tokens.
- Later pages require the original review signature and the server-issued token
  for that exact position and selection. Changed data, scope, identity or a
  skipped page fails. Continuation and completion use separate signing purposes.
- Only the terminal page returns `review_complete_token`. Earlier pages return
  only a continuation token. Zero visible rows still bind private effects and
  next-prompt state; they are not a guessed no-op.
- Every page recomputes the complete native rollback preview. Native configuration
  and all guarded tables must restore, along with original callback queues. The
  signature covers the entire input prompt, complete effects/private effects,
  resulting state and complete future prompt, not only the returned slice.
- Stock User membership, native read/write/field/record scope and Validate
  availability are retained. Native lot validation, mandatory analytics and
  notification guards are not disabled. External immediate sends and company-wide
  SMS-setting changes remain blocked rather than hidden or simulated.

`write_ready: false` remains deliberate until a matching exact save, recovery and
retirement protocol is implemented and verified. No new write route is present
in the source gateway. A valid review token alone does not authorize an old API.

## Verification checkpoint

The full Home suite passes **1,109 cases in 88 suites**, including 36 new client
boundary cases. Library and focused actual-source/test typechecks and scoped
ESLint pass after test-fixture literal typing corrections. Three source-gateway
cases pass, including only the named load/review routes and a denied new-save
route. All 93 Python source files parse.

The final isolated native run passes **36 cases**, zero failures, errors or skips:
10 new review cases, 11 saved-recovery cases, 12 native-step cases and three shared
confirmation/preparation/operation review regressions. All **130 guarded tables**
remain after rollback, with mandatory analytics and native SMS enabled. All **93
Python files and hashes** match the readonly mounted working source. This is
candidate-60 source on installed-49 synthetic metadata with `--no-http`, not a
persistent upgrade, full-addon regression, clean install or hospital-scale test.

Native coverage includes a valid 501-move/2,001-operation transfer whose old load
rejects, all 101 saved receipt-operation rows followed by all native effects in
one ordered chain, skipped/changed/wrong-purpose proofs, private valuation counts,
automatic balanced accounting with required analytics, expiry/preparation/decline,
foreign author/public role, native context filtering, stale inventory/hidden
records, missing prompts, callback restoration and external-send rejection.
The new APIs never save those previewed effects or record a new request receipt.

The actual TypeScript client accepts **69 captured native JSON responses**:
49 loads and 20 review pages. Exact routes, original selections, page positions,
signatures and token parameters match. Only replay transport is mocked. This is
not HTTP/protected-gateway/browser acceptance. Client source SHA-256:
`23daf06b68899333dc1978aaa64c31d3f65bb93f598923e4136db27bae34797f`.

The first private no-HTTP diagnostic stops before tests because macOS archive
sidecars violate the source-integrity assertion. Its failed log is retained.
The archive is regenerated with `COPYFILE_DISABLE=1`, without weakening the guard.
The second native run remains a failed diagnostic: all 33 cases run with one
failure and two errors, while all 130 guarded tables and mandatory analytics/SMS
remain preserved. It reports a missing required
lot on newly added zero-quantity fixture operations, an overly early fixture
snapshot and reuse of a version after another transfer was created. Corrected
fixtures retain lot checks, snapshot after the initial complete load and request
a fresh version after intentional setup changes. Test literal types are also
corrected without loosening client checks. No product availability guard,
permission or source-integrity assertion is relaxed. Failed runs are retained,
not counted as passes.

Private evidence: `validation-review60-r1-native-tests-20261019.log` (archive
guard), `validation-review60-r2-native-tests-20261019.log` (failed diagnostic),
`validation-review60-r3-native-tests-20261019.log`,
`verify-validation-review60-source-wire-20261019.cjs` and
`validation-review60-r3-source-wire-verification-20261019.json`.
The final no-HTTP diagnostic exits zero and its one-off container is removed.
Upstream bootstrap warnings, including a failed pandas dependency attempt, remain
in the logs. No dependency-install acceptance is claimed.

## Remaining work and operating limits

The matching complete native save/status/reference/prompt/stop contract, durable
request handoff and retirement, React write consumer, real browser/IndexedDB/
gateway/HTTP acceptance, installed upgrade, large returns and full Billing/product
parity remain unfinished. The current UI continues using its original write
limits. The saved-step reader remains a separate completed source checkpoint.

The native effects engine still captures complete business tables in memory and
each page repeats a complete preview. Inventory scanning is complete but linear,
and review locking remains coarse. Bounded JSON is not realistic hospital-scale
performance, concurrency, clean-install or safety acceptance.

The owner kept the Billing review gate closed. No frontend build/server, live
browser, tunnel, installed upgrade, public/tester/production update or purchase
is included. Native diagnostics use the existing private synthetic database and
readonly mounted source, with no HTTP or published ports.
