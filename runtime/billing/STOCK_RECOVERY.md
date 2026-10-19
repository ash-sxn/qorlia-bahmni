# Stock write recovery storage

## Consumer checkpoint, 19 October 2026

Both [confirmation](STOCK_CONFIRMATION_PAGING.md#shared-confirmation-and-preparation-source-19-october-2026)
and [preparation](STOCK_RESERVATION_PAGING.md#react-preparation-consumer-source-19-october-2026)
now use completed paged requests in source, with original-kind routing, strict
commit before save, exact retry/stop and complete accepted-reference recovery.
The new shared dialog does not invent writable state from a compact recovery
summary. Legacy pending dialogs, schemas and slot exclusion remain unchanged.
Home passes 970 cases/83 suites. Actual browser/IndexedDB/gateway acceptance and
the paged operation consumer remain open. No review gate, build/server or
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

- `loadStockWriteRecovery(uid)` returns any validated pending kind, or `null`.
  Dispatch code must check `isPagedStockWriteRequest` before selecting APIs.
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
preparation's source integration; operation remains. No frontend build, browser review, expired
gate reopening, protected-host upgrade or public/tester/production deployment is
included. Real IndexedDB durability/concurrency and save/reload/expiry/storage-
failure flows remain acceptance gates.
