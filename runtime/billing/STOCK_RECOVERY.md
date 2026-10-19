# Stock write recovery storage

## Signed-in Billing recovery entry, 19 October 2026

The [Billing landing page](../../apps/home/src/components/Billing/BillingPage.tsx)
now mounts a [saved-stock notice](../../apps/home/src/components/Billing/StockRecoveryNotice.tsx)
after Billing sign-in, independently of the selected invoice/order tab. Users no
longer have to find an order in the default draft-order list to discover a pending
stock request. The notice reads the existing account-bound IndexedDB slot and
uses the same query key as the transfer workspace. It does not introduce a
second store, change a pending payload or expose its request key/proofs.

The notice identifies preparation, detailed operation, confirmation, validation
or return creation and the original order/transfer. Explicitly opening it mounts
the existing transfer workspace for that order, where the existing protocol-
specific Resume action remains required. Opening, reloading or closing the
notice never sends, retries, stops or clears a native stock request. Native
permissions and all existing exact-outcome/reference checks still apply.

Unreadable storage is an error with an explicit retry, not an empty slot.
Loading hides stale recovery details. Account changes reset the open workspace.
Opening focuses the existing transfer heading when focus would otherwise be
lost, without overriding the created-transfer handoff. This entry's close button
returns to Billing, not to an order-detail screen which was never opened.
Closing rereads storage and returns focus to the opener, retry control or Billing
heading as appropriate. Fast completed refetches also restore focus, even when
React Query batches away the fetching transition.

[Notice tests](../../apps/home/src/components/Billing/__tests__/StockRecoveryNotice.test.tsx)
cover all six stored protocol variants, exact original-order routing, no native
dispatch, retained pending data, resolution, account changes, storage failure,
retry focus and basic axe checks. Billing page tests cover default-tab discovery
and no storage read before Billing sign-in. These are React/JSDOM tests with
storage and child-workspace doubles, not real IndexedDB, browser visual/keyboard,
multi-tab or native save acceptance. The earlier failed focus test is retained
as diagnostic evidence; the production effect now observes completed refetch
timestamps rather than relaxing the focus assertion.

The final source passes **1,372 Home cases in 95 suites**, including 15 notice
cases, two new landing-page cases and the transfer-entry focus/return case.
Five focused routing/entry suites pass 106 cases. Library and focused actual-
source/test TypeScript, scoped ESLint, formatting and contributor links pass.
Adding the existing Billing page tests to the type gate exposed an unsupported
`getByRole` option; removing that unused option preserves its exact string-name
match. An intermediate transfer-heading focus attempt failed the existing
created-return handoff test and was narrowed, not accepted as a new behaviour.
No backend contract, addon version, frontend build/server, review gate, hosted
tester or deployment changed for this UI entry.

## Complete return storage source, 19 October 2026

[Candidate-63 return recovery](RETURN_PAGED_WRITE.md#durable-request-storage-source-19-october-2026)
now has exact database/account-bound schema 7 in the same pending slot. It keeps
all eight native request fields and requires complete accepted-reference reads
or exact stopped acknowledgment before clearing. Native UID/database, outcome
and reference versions are rechecked; failed/changed reads or commits retain the
request. Generic resume now returns the exact validated return request for the
[dedicated React workflow](RETURN_PAGED_WRITE.md#react-complete-return-consumer-source-19-october-2026).
Older typed readers/clearers still reject it. No old pending request/history is
converted. Storage has 71 unit cases, including 24 new return cases; the storage checkpoint's full Home
has 1,313 cases/92 suites. This is storage-double source evidence, not actual
browser/IndexedDB/multi-tab or release acceptance. No review reopening or build.

## Later React validation integration, 19 October 2026

The [complete validation dialog and resume routing](VALIDATION_PAGED_WRITE.md#react-complete-validation-consumer-source-19-october-2026)
now consume schema 6 explicitly. Generic `loadStockWriteRecovery` returns its
validated current request intact for dispatch; the typed validation loader retains
the whole history. All other older dialog loaders still reject it. New writes,
exact recovery, terminal clear and stopped-child restoration use this store;
accepted legacy parents can hand off explicitly without payload conversion.
The historical storage-only checkpoint below is superseded only for consumer
source integration, not real browser/IndexedDB/concurrency or release acceptance.

## Complete validation history source, 19 October 2026

The [candidate-61 validation writer](VALIDATION_PAGED_WRITE.md) now has a matching
typed durable-storage path in the existing account slot. This is storage and
native-status client integration, not the new React validation dialog, real
IndexedDB acceptance or a deployed update. The native addon and database version
are unchanged. No frontend build/server, live browser or review reopening.

Schema 6 contains exactly `schema`, `kind`, `database`, `uid`, `request` and
`history`; its kind is `paged_validation`. The request retains all eight native
fields, including the terminal review-completion proof. History holds the exact
preceding native validation requests in order. Every step is validated, shares
the order/transfer, has a unique nonce and links to the immediately preceding
request key. A new complete initial request has no parent. A legacy seven-key
step can be the first parent only through an explicit continuation; it is not
converted into an eight-key request.

An immediate parent alone is insufficient: after stopping a third step, the
restored second step still needs its own preceding history if a later child is
stopped again. Keeping that chain also avoids a blank new-transfer state that
would hide earlier accepted preparation, receipt prices or native prompts.
The chain stores requests, not passwords, cookies, native financial bodies or
patient records. It has no separate slot that could bypass another stock write.

### Matching consumer API

- `loadPagedStockValidationRecovery(uid)` returns `{ request, history }` or
  `null`. Any older pending kind rejects unchanged, rather than being migrated.
- `persistPagedStockValidationRecovery(uid, request, previous?)` awaits a strict
  commit before a caller can dispatch save. Starting a child requires a fresh
  accepted native parent with an available prompt and the exact stored previous
  request. The single readwrite transaction appends that parent and replaces the
  current request together. An identical retry preserves the whole history.
- `restoreStoppedPagedStockValidationRecovery(uid, request)` freshly checks the
  exact native stopped outcome. In one strict transaction it replaces only the
  exact stopped child with its prior request and remaining history. The returned
  native receipt key must match the stored prior action. A stopped initial
  request has no prior accepted action and can instead be retired. A restored
  legacy parent returns to its unchanged schema-4 format and original protocol.
- `clearPagedStockValidationRecovery(uid, request)` freshly requires an accepted
  terminal native receipt. A declined native choice can be terminal without
  delivery. An unknown result, ordinary rejection, partial prompt or a stopped
  child is not a terminal accepted action. Clearing another valid request leaves
  that request intact; an aborted transaction preserves the committed history.

No helper dispatches, retries or stops a native write. A lost acknowledgement
read preserves the exact request. Native status reads happen before, not inside,
the IndexedDB write transaction; an exact slot comparison still guards commit
against a changed pending request while the read was in flight. This is unit
fault coverage, not a real multi-tab race claim.

All older readers fail closed on schema 6. Older save/replacement APIs reject its
proof before opening storage. The current generic transfer-resume route therefore
does not consume schema 6 yet; it must be routed explicitly to the forthcoming
complete-validation dialog. Existing initial-write and pending routes remain
unchanged until that integration. Do not strip the proof or return only part of
the history to force an older dialog to accept it.

The forthcoming consumer must still read every pinned input-prompt, native-effect
and accepted-reference page, match page `receipt_key` to fresh status, recheck
outcomes before clearing, require explicit stop acknowledgement and reload native
transfer state after resolution. Storage is not a substitute for those checks or
for native authorization.

### Source verification

The recovery suite passes 47 cases, including 20 new complete-validation cases.
Coverage includes nested history/stop restoration, explicit legacy continuation,
unknown/terminal/unavailable parents, no automatic writes, exact proof/database/
schema/identity checks, shared-slot exclusion, held strict commits, transaction
aborts, lost native reads and a changed slot during an acknowledgement read.
The initial two fixture failures used unavailable `structuredClone` in JSDOM;
the fixtures now take ordinary JSON snapshots, without a product workaround.
Tests use the existing IndexedDB double and actual SDK parsers with mocked
transport. Real browser durability, quota, crash and multi-tab behavior remain
acceptance gates. Native candidate-61 evidence keeps its separate scope.

Full Home passes 1,155 cases in 89 suites. Library and focused actual-source/test
types, scoped ESLint/format, diff checks and contributor-document links pass.
No dependency or native Python source is changed in this storage milestone.

## Saved validation reader source, 19 October 2026

The [saved validation reader](VALIDATION_RECOVERY_PAGING.md#react-saved-step-reader-source-19-october-2026)
now reads compact exact step status and complete pinned prompt/reference pages
from the transfer resume route. It retains the existing schema-4 request, does
not fabricate an editable version and clears only an exact fresh terminal receipt
after all reference pages and durable storage commit. Large validation writes,
request retirement, real browser/storage/gateway acceptance and release remain.

## Consumer checkpoint, 19 October 2026

The later [operation editor](STOCK_OPERATION_PAGING.md#react-operation-consumer-source-19-october-2026)
joins [confirmation](STOCK_CONFIRMATION_PAGING.md#shared-confirmation-and-preparation-source-19-october-2026)
and [preparation](STOCK_RESERVATION_PAGING.md#react-preparation-consumer-source-19-october-2026).
All three
now use completed paged requests in source, with original-kind routing, strict
commit before save, exact retry/stop and complete accepted-reference recovery.
The new shared dialog does not invent writable state from a compact recovery
summary. Legacy pending dialogs, schemas and slot exclusion remain unchanged.
Home passes 1,012 cases/85 suites. Fresh accepted receipt state/count and operation
identity are checked before clearing; mismatches retain recovery. Actual browser/
IndexedDB/gateway acceptance and large validation/return consumers remain open.
No review gate, build/server or
deployment is included. The dated storage checkpoint below retains its original
evidence scope; it is not a claim that later consumers are still unmigrated.

## Complete-review storage integration, 16 October 2026

The existing IndexedDB slot now accepts exact completed paged confirmation,
reservation and operation requests. This is client-storage integration source,
not a migrated stock dialog, real browser acceptance or a released feature.
Native models, protocols, schema columns and the module version are unchanged.

Implementation: [storage](../../apps/home/src/components/Billing/stockReservationRecovery.ts),
[SDK validators](../../apps/home/src/components/Billing/billingService.ts) and
[tests](../../apps/home/src/components/Billing/__tests__/stockReservationRecovery.test.ts).
Native contracts: [confirmation](STOCK_CONFIRMATION_PAGING.md),
[operations](STOCK_OPERATION_PAGING.md) and [reservation](STOCK_RESERVATION_PAGING.md).

## One pending action per account

Keep the existing `qorlia.billing.stock-reservation-recovery` database and
`pending` object store. IndexedDB version stays 1. Rows are keyed by signed-in
Billing UID. Separate slots per action would let a different dialog bypass an
earlier action whose result is unknown.

Record schemas are distinct from the IndexedDB database version:

| Record schema | Kind                                                         | Billing database binding          |
| ------------- | ------------------------------------------------------------ | --------------------------------- |
| 1             | Legacy reservation or operation                              | Absent in the historical contract |
| 2             | Legacy confirmation                                          | Absent in the historical contract |
| 3             | Atomic validation                                            | Fixed build database              |
| 4             | Validation step / continuation                               | Fixed build database              |
| 5             | `paged_confirmation`, `paged_operation`, `paged_reservation` | Fixed build database              |
| 6             | `paged_validation`, exact native-step history              | Fixed build database              |

Schema 5 contains exactly `schema`, `kind`, `database`, `uid` and `request`.
The database is the build's `BAHMNI_BILLING_DATABASE` (default `odoo`), not caller
input. The kind must match the request. Existing SDK validators check every
request field, including terminal `review_complete_token`, without stripping it.
A continuation proof is not a completion proof.

Older envelopes are not silently converted, overwritten or given guessed
database provenance. Missing/invalid proofs, wrong schema/kind/account/database,
extra fields and new proofs in old envelopes fail closed and stay stored.
Schemas 1 and 2 retain their original unbound contract; this change does not
establish their missing historical origin.

## Consumer contract

- At this schema-5 checkpoint, `loadStockWriteRecovery(uid)` returned any then
  supported pending kind, or `null`. The newer schema-6 path above rejects this
  older loader until the new validation resume consumer is integrated.
  Schema-5 dispatch code checks `isPagedStockWriteRequest` before selecting APIs.
- `loadPagedStockWriteRecovery(uid)` returns a completed paged request, or `null`.
  An older pending request rejects instead of being upgraded.
- `persistPagedStockWriteRecovery(uid, request)` validates and stores schema 5,
  resolving only after strict transaction completion. An identical retry is
  allowed. Another nonce, proof, edit, action or kind cannot replace it.
- `clearPagedStockWriteRecovery(uid, request)` clears only the exact request,
  after strict transaction completion. A different valid request leaves it
  intact. Aborted writes preserve the prior committed record.
- Older dialog loaders reject paged pending requests. Legacy persist/clear
  methods reject their proofs before opening storage. Never strip a completion
  proof to fit an older endpoint.
- Validation-step replacement still requires the exact preceding step and
  continuation key. It cannot replace another pending kind.

The eventual dialog must finish complete native review, construct one exact
request/nonce, await storage commit and only then send it to the matching paged
save endpoint. Reload, timeout and expiry keep that request for its matching
status/identical retry. An unaccepted status alone does not prove that an earlier
in-flight dispatch was cancelled. Never generate a new request or clear storage
merely to re-enable an action button.

Clear only after a proven accepted outcome or a matching acknowledged
[native request stop](STOCK_REQUEST_STOP.md). An ordinary rejection is not a stop.
Failed receipt/reference/clear requests must
not appear as a clean new-action state. Reload authoritative transfer data after
resolution and retain exact requests across navigation and re-authentication.

Storage is not an authorization or secrecy boundary. Native methods still check
authentication, permissions, companies, current state, proofs and duplicate
receipts. Do not store passwords/session cookies or publish raw recovery proofs.

## Verification and remaining work

Later source connects [the complete confirmation dialog](STOCK_CONFIRMATION_PAGING.md#react-confirmation-consumer-source-16-october-2026)
to this storage, with explicit legacy/paged routing and exact completion proof.
Other dialog consumers and actual browser acceptance remain separate.

The 27 storage unit cases include eight new cases (three are workflow variants).
They cover exact proof retention, five older envelope kinds, same-slot exclusion,
database/account/kind/schema failures, legacy API rejection, strict save/clear
completion, aborted writes and unavailable storage. Initial test-only type/lint
issues were corrected with explicit typed writer callbacks, not product changes.

Home passes 903 tests/80 suites. Library and focused actual-source/test types,
scoped lint/format and diff checks pass. Tests use the existing IndexedDB double,
not a real browser or multi-tab fault test. Earlier native HTTP and JSON replay
evidence keeps its separate scope.

At this storage checkpoint, operation/preparation dialogs, pending routing and
pagination still needed integration. The later consumer checkpoint above records
preparation/operation source integration. No frontend build, browser review, expired
gate reopening, protected-host upgrade or public/tester/production deployment is
included. Real IndexedDB durability/concurrency and save/reload/expiry/storage-
failure flows remain acceptance gates.
