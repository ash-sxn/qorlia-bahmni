# Inventory transfer Save and recovery

[README](../../README.md) · [Billing](README.md) · [Native review](STOCK_INVENTORY_SAVE.md) · [Inventory](STOCK_INVENTORY_WORKSPACE.md)

## Candidate 80 in progress, 21 October 2026

This source adds a durable Save protocol for existing transfer headers and their
native derived child changes. It does not create transfers, deploy the addon or
open the review gateway. All 14 form/review/save/recovery methods stay blocked at
that gateway. The React header editor and its durable pending-request UI remain
unfinished. Do not infer a working browser Save flow from the new source methods.

## Complete review before Save

The existing `qorlia_inventory_edit_save_review` response now uses protocol
`qorlia.inventory-stored-save.v2`. Preview still rolls back all business changes,
so `read_only` remains true. `write_ready` is true for a successful native review,
but that is not authorization to reopen a host, bypass sign-in or deploy it.

Every intermediate page has a continuation token and `review_complete_token:
false`. Only the final ordered page supplies a complete token. A continuation
token cannot authorize Save. Both proofs bind the database, actor, company scope,
original version, ordered edits and complete native effects, including the
private follower audit. The dedicated save protocol is not an onchange token.

The exact request contains only:

```text
transfer_id, version, edits, review_version, review_complete_token, request_key
```

Generate one UUID request key for an intentional Save, retain the complete request
before sending, and reuse that exact request for recovery. Do not generate a new
key because a network connection dropped. The server binds the request body and
actor to its receipt; changing the body while reusing an accepted key is rejected.

## Source API and client mapping

| Native source method | Typed client | Result |
| --- | --- | --- |
| `qorlia_inventory_edit_save_review` | `getInventoryStoredSaveReview` | Ordered actual native effects and final complete proof |
| `qorlia_inventory_edit_save` | `saveInventoryStoredForm` | Apply the exact reviewed native change once, then record acceptance |
| `qorlia_inventory_edit_save_status` | `getInventoryStoredSaveStatus` | Accepted, stopped or still unconfirmed, with compact current transfer state |
| `qorlia_inventory_edit_save_stop` | `stopInventoryStoredSave` | Durably prevent a pending request, or recover an already accepted result |
| `qorlia_inventory_edit_save_references` | `getInventoryStoredSaveReferences` | Bounded, versioned pages of generated native references |

Stopping a pending request does not undo an accepted save and does not cancel a
stock transfer. An accepted response takes precedence if Save won the race. A
successful stop prevents that exact request from later being applied. The UI must
not call either outcome “undone”. A pending status is not proof of failure.

The TypeScript calls validate exact payload/response shapes, scope, mutually
exclusive outcomes, states, changed field names and reference pages. They never
automatically retry a write or treat session expiry as acceptance. The future UI
still needs account-scoped durable request retention, recovery after re-login,
explicit resolution of unknown outcomes and independent human/browser testing.

## Native execution and receipt safety

- Recheck native stock/company/read/write access. No sudo stock or financial write.
- Acquire the same ordered 134-table lock scope for Save and Stop, then re-read
  the record and receipt. These coarse locks need concurrency/latency measurement
  before hospital release; they are not a scalability claim.
- Reconstruct and verify the complete review under those locks. Execute native
  onchange/write again and compare its full public and private effect signature
  with the approved review. Drift rolls the whole save back.
- Reuse the existing protected `qorlia_validation_receipts` storage, with a
  separate purpose, actor/company binding and exact-body digest. There is no new
  schema field or persistent addon upgrade in this task. Ordinary stock reads and
  writes cannot expose or overwrite the protected receipt field.
- Check receipt/stop metadata writes against all 134 tables, excluding only this
  transfer's targeted receipt field and ordinary write metadata. Unexpected
  business changes or deferred callbacks roll back native Save and its receipt.
- Restore precommit/postcommit/prerollback/postrollback callback state on failure.
- Return a compact receipt and current transfer. Generated references have a
  separate bounded reader which rechecks access and hides inaccessible labels.

## Verification boundaries

A frozen **150-case native run is in progress**: 18 native form/save-preview cases,
16 durable-save/recovery cases and the prior 116 Inventory/form/onchange/confirmation
cases, with 116 matching Python files and 134 guarded tables. No successful
candidate-80 native acceptance is claimed yet. The native
tests run without HTTP, published ports or a persistent addon upgrade. Tests of
real saves are inside rollback-only synthetic test transactions, not real records.

The first candidate-80 run completed 34 cases with four assertion failures, one
test-framework error and no skips. All 134 rollback guards and independent
committed-table counts/full-row hashes were preserved. Its fixture corrections
retain native behavior: plain-text HTML notes are wrapped in paragraphs, a
single-row review is already complete, PostgreSQL name collation is not Python
sorting, and Odoo's assertion override requires a single exception class rather
than a tuple. The updated page fixture now genuinely spans multiple pages. No
production model or permission was changed to make those assertions pass; the
150-case rerun must verify the corrections.

Current frontend checks pass: **1,750 Home cases/106 suites**, including 29 new
Save/recovery client tests; the four form/edit/review/recovery test files contain
137 cases. Library and actual test-source types, scoped lint/format and 116 Python
AST parses pass. Three temporary gateway stub checks verify that all 14 unfinished
form/review/write routes remain blocked. Documentation checks cover 46 linked
documents and 785 local links. These are not native HTTP or browser acceptance.

The source-79 broader run completed 134 cases with one error in the added real
nested-deletion comparison. Its 134 rollback guards and independent committed
table counts/full-row hashes were preserved. Two isolated diagnostics established
that installed native Odoo itself can execute DELETE twice through the computed
`move_ids_without_package` alias. Invalidating caches did not change that outcome.
The current test separately compares successful deletion via the native stored
relation and matching rejection through the computed alias. It does not replace
DELETE with UNLINK or ignore missing records to manufacture success. These test
changes still need the candidate-80 native run to pass.

The earlier source-79 focused 18-case/29-response proof remains valid only for its
frozen source and v1 preview-only schema. It does not accept the new writer or v2
complete-proof schema. New client tests and gateway checks are separate evidence,
not a substitute for the native run, real HTTP/browser testing or clinical and
accounting review. Nonempty generated-reference workflows, cross-account/company
matrices, real concurrent Save/Stop replay, wider child-view/context/widget cases
and scale still need explicit coverage. Creation, duplication, the remaining
Inventory/Billing workflows and the other modules remain in the full goal.
