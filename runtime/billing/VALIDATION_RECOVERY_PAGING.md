# Compact saved-validation recovery

[Billing guide](README.md) · [Native validation steps](STOCK_VALIDATION.md) · [Recovery storage](STOCK_RECOVERY.md)

## React saved-step reader source, 19 October 2026

The transfer panel now routes existing validation-step requests to
[SavedValidationRecoveryModal](../../apps/home/src/components/Billing/SavedValidationRecoveryModal.tsx).
It verifies the stored account/request before reading the compact native status,
then shows saved prompt and business-reference rows in pinned 50-row pages.
It does not call the capped editable load merely to show an accepted receipt.
The same house modal, buttons, cards and keyboard-scrollable tables are used.

The reader preserves all native receipt units, quantities, lot/expiry values,
prices, balance, expiry-soon flag and warning text. Warning markup remains plain
escaped text. Immediate/backorder selections and expiry lots are displayed as
saved values, not actions that process a partial prompt. Missing/consumed
prompts, unknown acceptance and accepted-but-incomplete delivery stay distinct.

Every reference page must be visited before finishing a terminal accepted step.
The reader rechecks the original accepted state/count, terminal state, prompt
snapshot and current scope, then validates the pinned references again before
awaiting exact durable clear. Changed receipts/pages/storage, failed clear,
session expiry and closing a nonterminal prompt preserve recovery. No new nonce,
automatic save, generic wizard call or prompt recreation is introduced.

For a small transfer only, an explicit continuation after all prompt/reference
pages returns to the original validation-step dialog. That dialog loads its own
editable version and performs native preview/review/save as before. The compact
scope version is never passed to a writer. Unknown small requests can explicitly
open the original identical-request recovery, without dispatching a write from
this reader. SMS blocking is retained. Large-transfer validation/retry remains
unavailable; the reader does not remove the existing 500-move/2,000-operation
write limits. Atomic pending requests and new validation still use their original
dialog. Other pending kinds cannot be silently converted.

The full Home suite passes **1,073 cases in 87 suites**. The focused reader,
transfer routing/paging and original validation UI run passes 88 cases, including
23 new reader cases and one additional continuation-routing case. Coverage includes
large summary counts, 101 prompt rows, 101 references,
bounded pinned navigation, unavailable labels, escaped warning text, keyboard
focus/axe, complete-page gating, terminal declined choices, changed outcomes,
strict clear completion/failure, storage/account mismatch, expired sessions,
missing prompts, native choice kinds, SMS and late unmounted responses. Source
types and scoped lint pass. The library and focused actual-source/test typechecks
pass, including the new test source. The first two direct Jest attempts stopped
before test collection on its TypeScript config-loader settings. A command-local
`TS_NODE_SKIP_PROJECT=true` plus CommonJS/node loader override runs the actual
project Jest config without modifying project configuration. No application build
is substituted for tests. Unit service/storage doubles are used; this is not
browser, IndexedDB, HTTP, installed-upgrade or hosted-tester acceptance. The native
evidence below belongs to the unchanged candidate-59 reader APIs, whose 91 Python
hashes also match committed backend source `47eca8e9`.

Still required: complete large validation load/review/save, request retirement/
continuation handling, actual browser/storage/gateway/runtime verification,
large returns, broader Billing and full-product parity. Review access remains
closed; no frontend build/server, tunnel or deployment is included.

## Candidate 59, 19 October 2026

This backend checkpoint adds three read-only APIs for existing, exact seven-key validation-step
requests. It does not add a larger validation writer, migrate the write dialog,
alter old request/storage schemas or upgrade a running installation. The old
load/preview/save/status APIs and size guards remain unchanged.

An accepted step can become unreadable through the old status endpoint if its
transfer later grows beyond that endpoint's full-graph limits. Acceptance must
not disappear because the current transfer no longer fits an old response. The
new reader checks the original receipt and returns a compact current transfer.
Saved native prompt rows and created-document references have separate bounded,
snapshot-pinned pages. This is a prerequisite for complete validation integration,
not a substitute for that unfinished write/review workflow.

Implementation: [native readers](qorlia_billing_ui/models/stock_validation_recovery.py),
[native cases](qorlia_billing_ui/tests/test_stock_validation_recovery.py),
[typed clients](../../apps/home/src/components/Billing/billingService.ts) and
[source gateway](../../scripts/review-host/server.cjs).

## Contract

All methods are fixed `stock.picking` methods. Native Stock User membership,
current order/transfer/company/record access and exact author-bound receipt
identity are rechecked. Request/decision validation is the existing step contract;
there is no caller-selected model, wizard identifier, method, domain or context.
Atomic, paged stock and return requests cannot be passed as step requests.

| Native method | Typed client | Result |
| --- | --- | --- |
| `qorlia_validation_step_compact_status` | `getStockValidationStepCompactStatus` | Exact acceptance/state, reference count, compact current transfer, saved-prompt metadata/count/version, continuation and terminal state |
| `qorlia_validation_step_prompt_page` | `getStockValidationStepPromptPage` | Bounded native receipt-operation, expiry-lot or immediate/backorder-selection rows for the saved prompt |
| `qorlia_validation_step_reference_page` | `getStockValidationStepReferencePage` | Bounded readable/unavailable native business-reference identities |

The original payload has exactly:

```text
order_id, transfer_id, version, decisions,
review_version, request_key, continuation_key
```

Status accepts only `payload`. The page methods additionally accept `after: 0`,
`version: false`, `limit: 50` initially. Limit is 1 to 100. Later offsets need the
original page version. A changed prompt, reference, transfer scope or access
policy rejects a stale version. Counts/cursors must agree with every returned
page; readers never mark a partial array complete or silently return a truncated
receipt. These are read snapshots, not completion proofs for a future save.

The compact current-transfer version is a read-scope snapshot, not the older
editable validation-load version. Do not feed it to a preview/save API or invent
a new intent from it. A writer needs its own matching complete load/review contract.

## Prompt and outcome boundaries

Prompt metadata intentionally has **counts, not empty data arrays**. Its common
fields are `kind`, `title`, `blocked_reason` and `counts`. Receipt metadata retains
source/destination and picking code; expiry retains the native description.
Rows identify their native section (`transfers`, `lots` or `operations`) and
retain native values, units, batch/expiry warnings, prices and selections.
Raw saved window actions, contexts and transient wizard identifiers are not sent.

- Unknown request: not accepted, not terminal, no prompt or references. This is
  not proof an earlier write stopped and does not permit a new nonce.
- Accepted terminal step: no further prompt. Terminal can mean a declined choice
  with stock still assigned; only native transfer state proves completed movement.
- Accepted prompt: continuation remains the original accepted request key.
- Consumed, deleted or no-longer-permitted prompt: acceptance remains, terminal is
  not fabricated, a continuation reason is returned and prompt paging rejects.
  A missing transient is never recreated as a new native action.
- Related labels and every prompt row retain native read/access checks. An
  inaccessible tail cannot be presented as a complete visible subset.
- Unreadable/deleted document references retain their stable key/model but expose
  neither ID nor display name. No audit body or new financial mutation is exposed.

The native wizard descriptor and reference labels are still materialised in
memory before slicing a response. Bounded JSON is not a claim of bounded ORM
memory, preview CPU, locking cost or realistic hospital-scale performance.

## Verification checkpoint

Home passes **1,049 tests in 86 suites**, including 37 new client-boundary cases.
The focused new/old validation-step, atomic-validation and return service run
passes 89 cases. Library/focused actual-source/test types, scoped lint/format,
three source gateway cases and diff checks pass. Gateway coverage includes only
the three named readers and rejects raw wizard/model actions, caller context and
unauthenticated requests.

The corrected isolated native run passes **23 cases**, zero failures, errors or
skips: 11 new recovery cases and the 12 existing native step cases. Original rows
in all **130 guarded tables** remain after rollback. Mandatory analytics and
native SMS stay enabled. All **91 Python files and hashes** match the mounted
working source. This is source 59 on installed-49 synthetic data with `--no-http`,
not a persistent addon upgrade, full-addon regression or clean dependency install.

The cases include acceptance/current counts after growth to 501 moves and 2,001
operations, a real saved receipt prompt retaining all 101 operation rows over
three pages, stale-page rejection, native expiry, terminal/consumed/deleted prompt
distinctions, hidden tails, author/access/context failures and no business or
deferred writes from reading. The 101-reference paging case deliberately seeds
protected receipt metadata with existing synthetic lots; it does not prove that
one validation created 101 lots. The native step regressions separately retain
real receipt/preparation, completed delivery, priced batch and automatic-valuation
journal behavior. Larger validation saves are not enabled by these readers.

The actual TypeScript client accepts **27 captured native JSON responses**:
11 compact statuses, nine prompt pages and seven reference pages. All routes,
original payloads, bounds and snapshot parameters match. Only replay transport
is mocked; this is not HTTP, protected-gateway or browser acceptance. The client
source SHA-256 is `7d566a1f7aba5c6363647c8b64c188fa24e39d8082269e4198743fbcd84a3afd`.

The first
run stops before cases because importing a test class directly duplicates its
12 collected cases. The second runs all 23 cases with one failure/two errors;
all 130 monitored table fingerprints, mandatory analytics and native SMS remain
preserved after rollback. Corrections are test-only: retain native state for
growth rows, compare the actual incoming state instead of assuming assigned,
and use Odoo's supported exact exception assertion. No product availability or
permission guard is weakened. These failed runs are retained, not counted as passes.

Private evidence: `validation-recovery59-r1-20261019/native-tests.log` (collection
failure), `validation-recovery59-r2-native-tests-20261019.log` (retained failed
suite), `validation-recovery59-r3-native-tests-20261019.log`,
`verify-validation-recovery59-source-wire-20261019.cjs` and
`validation-recovery59-r3-source-wire-verification-20261019.json`. The final
no-HTTP diagnostic exits zero and its one-off container is removed. Native
bootstrap warnings remain in the logs; no dependency-install acceptance is claimed.

At the backend checkpoint, remaining work included React prompt/reference/recovery migration
(now partially connected by the separate reader above),
complete large validation review/save, request retirement/continuation handling,
actual HTTP/protected gateway/browser/IndexedDB acceptance, installed upgrade,
broader roles/configuration/performance, returns and full Billing/product parity.
No frontend build/server, review reopening, tunnel, paid resource or
tester/public/production deployment is included.
