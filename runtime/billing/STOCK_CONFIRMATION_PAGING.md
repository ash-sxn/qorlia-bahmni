# Complete paged native confirmation

[Billing guide](README.md) · [Existing confirmation](STOCK_CONFIRMATION.md) · [Detail reads](STOCK_TRANSFER_DETAILS.md)

## Candidate 52, 16 October 2026

This is a **native backend candidate**, not a released UI or a deployed tester
update. It adds a separate confirmation protocol for transfers above the legacy
500-move/2,000-operation limits. Existing confirmation APIs keep their original
contracts and limits. Other stock actions do not gain large-transfer support from
this change.

The new methods are not yet allowed through the protected review gateway and do
not have a TypeScript boundary or React consumer. Do not call the old modal with
the compact response or represent it as a complete stock graph. The owner-closed
review gate stays closed; it must not be bypassed to test this candidate.

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

Still required: typed client validation, named protected-gateway routes, actual
HTTP/session/concurrent-save acceptance, installed upgrade/recovery checks,
React page display and explicit human review, browser recovery, realistic scale
and protected release approval. Other large stock actions remain limited until
their own complete review/write contracts are implemented and accepted.
