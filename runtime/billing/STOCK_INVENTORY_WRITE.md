# Inventory transfer Save and recovery

[README](../../README.md) · [Billing](README.md) · [Native review](STOCK_INVENTORY_SAVE.md) · [Inventory](STOCK_INVENTORY_WORKSPACE.md)

## Candidate 80 in progress, 21 October 2026

This source adds a durable Save protocol for existing transfer headers and their
native derived child changes. It does not create transfers, deploy the addon or
open the review gateway. All 14 form/review/save/recovery methods stay blocked at
that gateway. React editor and dedicated recovery source now call saved-header methods,
but no built/native-HTTP/browser Save flow is accepted or exposed by this change.

## React editor and recovery source, 21 October 2026

The Inventory detail source now opens **Edit or recover transfer header**. The
Billing recovery notice resumes a stored header request directly, without
inventing a Sales order or routing it to transfer confirmation.

- `InventoryHeaderFields.tsx` renders visible native root field occurrences,
  their server-computed readonly/required rules, conditional labels, group/page
  context, selections and current values with existing Qorlia/Carbon controls.
  It never evaluates native Python/domain/modifier expressions in the browser.
- Relation searches begin on interaction, use the original version plus ordered
  edits and the exact node, debounce input and preserve native 25-row ordering.
  A selection must come from a returned page. Search text is not a selected ID;
  hidden, readonly and disabled fields do not search or apply changes.
- `InventoryHeaderEditor.tsx` applies native onchange on field commit. Unapplied
  input blocks review and is not silently dropped when another field changes.
  Reload, reconnect, close and supported planning-document links protect dirty
  edits with explicit discard.
- Complete Save effects reuse the existing stock effect cards, including private
  follower counts. Every ordered page and its original proof must be read before
  Save is offered. Changed/failed pages hide the old review. One UUID is retained
  durably before the first explicit Save; persistence failure never calls Save.
- `InventoryHeaderRecovery.tsx` retains unknown outcomes after a lost connection,
  permits only explicit exact-request retry and requires confirmation for Stop.
  A Stop that loses to Save shows acceptance, never an undo claim. Accepted
  generated references have bounded pages, and Finish rechecks their complete
  native outcome through the existing recovery-retirement helper.
- The notice reads the wider request union through `loadAnyStockWriteRecovery`
  under the descendant cache key `['billing', 'reservation-recovery', uid,
  'notice']`. Older order dialogs keep the narrower parent key/data contract.
  Existing prefix invalidations refresh both without sharing incompatible data.
  Account/transfer identity changes remount the editor rather than retaining the
  prior account's controls.

This is connected source, not accepted one-to-one presentation parity. HTML notes
are edited as escaped source text, not an integrated rich-text editor. Header
date-time input now uses the native Billing account zone and serializes to UTC;
native smart/free-text and locale-specific parsing remain unimplemented. The
planning widget now has the adapter described below; other custom widgets still
use scalar controls. Root collections, chatter,
followers, activities and package interfaces are not implemented by these scalar
header controls. Existing stock-row/operation workflows are separate; header
onchange can still affect linked rows, and those effects require full review.
SPA-history navigation discard protection also needs implementation and browser
verification; the current handlers protect explicit close/reload/reconnect and
full-page unload, not every router transition. These gaps remain in the original
parity goal, not excluded features.

Component checks use the actual house controls, React Query and editor/recovery
components with mocked services/storage. They cover explicit persistence-before-
write, multipage effects, unknown-save remount/exact retry, Stop race semantics,
reference retirement, dirty changes, native rules, safe HTML text, native choices,
account identity, direct routing and cache separation. Automated axe checks on
the loaded form are not a full accessibility audit. Real browser layout, keyboard
and native HTTP/IndexedDB/multi-tab acceptance remain unverified. All 14 methods
remain gateway-blocked; no build/server, review reopening or deployment occurs.
Any later runtime verification must pin a matching candidate-80 addon/client and
v2 review protocol on approved synthetic infrastructure. An older installed addon
or hosted tester is not assumed to support these new source controls.

### Account-local dates and native planning alerts, 21 October 2026

`inventoryDateTime.ts` converts whole-second native UTC strings to canonical
`datetime-local` values in the form's explicit account zone, and converts edits
back to native UTC. It never inherits or mutates the device/default zone.
Invalid stored dates/zones disable the date control with an explanation, not an
invented value. Empty native values remain empty. Luxon preserves the installed
native DST gap normalization, current-offset choice for ambiguous folds and
whole-second serialization. Unchanged controls do not trigger onchange merely
on blur. The original stored-form version and ordered node edits still reach
the existing native onchange/review/save contract.

Home now declares the already-installed Luxon 3.7.1 directly. Its version and
integrity did not change; the root adds genuine `@types/luxon` 3.7.6. The scoped
Yarn install skipped scripts. No native addon, source API or gateway route changed.

The private pure-JS comparison executes the installed Odoo `dates.js` and its
bundled Luxon 3.0.1 in a VM alongside the actual new helper. All **28 fixed-clock
cases / 56 comparisons** agree for canonical inputs, fractional seconds,
quarter-hour/year-boundary zones, half-hour gaps and ambiguous folds with January
and July clocks. The helper uses a deliberately different default/device zone.
Native `parseDateTime`, `serializeDateTime` and `deserializeDateTime` are real;
localization/clock are fixed and translation/cache/string imports have narrow
bindings. This is pure function evidence, not a browser, native HTTP or full
smart-date-parser test. Private result: `inventory-local-time-native-r2-20261021.json`.
Compared helper SHA256:
`c35d6c29b5ef267a86d633289c8be53bbe529af4c1d9a55132e06f315834c46c`.
Installed native dates source SHA256:
`0bc23100be138815103e589cf77fcaf42956043ee63a24b6bfa9b355943428fa`.
Installed native Luxon source SHA256:
`53dacae95f8099b260f550526a10897addc95297f97b9f9a6c7eade48df10068`.

`InventoryPlanningIssue.tsx` follows the installed stock widget/template and
`stock.picking._compute_json_popover`: the alert date is already server-localized
text, not another UTC value to convert. It validates the native JSON shape,
template identity and document IDs, escapes text and never executes native
templates, icon markup or CSS configuration. Visible readonly occurrences show
the alert rather than raw JSON; hidden fields remain hidden. `stock.picking`
documents route to their actual Inventory transfer with no invented Sales order.
Unapplied edits require explicit discard, and pending review/request states
disable document navigation. Other native models, such as `mrp.production`, have
no Qorlia destination yet and remain an explicit parity gap rather than opening
the old application. Planning fixtures follow inspected native source, not a
new accepted runtime read of a nonempty alert.

Five focused suites pass **123 cases** in both the default and US Pacific
process zones, covering helper conversion, actual house
controls, invalid/escaped alert data, readonly/hidden/disabled rules, explicit
dirty discard and actual transfer-route wiring with mocked services. Automated
axe results are not full keyboard/layout or clinical-user acceptance. Closed
review, no frontend build/server and no deployment remain unchanged.

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
automatically retry a write or treat session expiry as acceptance. The editor,
recovery-after-login controls and independent human/browser testing remain open.

## Browser recovery storage source, 21 October 2026

The existing `stockReservationRecovery.ts` now retains a completely reviewed
header-save request as schema 9, kind `inventory_save`, in the same strict
IndexedDB transaction and per-account stock slot. Its database, actor, original
version, ordered edits, proof and UUID are preserved. No second database or
competing pending-stock slot is introduced.

- `loadInventoryStoredSaveRecovery` reads only this request kind. Other pending
  stock kinds block it without conversion or loss.
- `persistInventoryStoredSaveRecovery` validates the complete exact request and
  checks the current Billing account/database before and after durable storage.
  Failure after storage preserves that request and prevents the caller from
  proceeding as though persistence succeeded.
- `clearInventoryStoredSaveRecovery` requires the exact stored request, a native
  accepted or durable stopped outcome, every bounded/version-pinned generated
  reference, fresh matching status and original-account checks. Unknown outcomes,
  changed pages/receipt/account, aborted storage and a changed concurrent slot
  retain recovery. This function does not Save, Stop or generate a replacement
  UUID.

Legacy stock dialogs deliberately fail closed on this new kind, rather than
misrouting it as confirmation or clearing it. The wider global notice now has a
dedicated header-recovery source route, as described above. Its new Save controls
remain unavailable on the closed gateway and existing hosted tester.
Storage tests use an IndexedDB transaction double and mocked native transport,
not a real browser/multi-tab/concurrency acceptance test. Native nonempty
generated-reference coverage remains separate from client paging fixtures.
Account separation is not encryption of browser storage. Shared-device access,
retention and logout/re-login handling still need release review; never put raw
pending notes, tokens, cookies or private recovery records in public evidence.

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

A frozen **150-case native run passes, zero failures/errors/skips**: 18 native form/save-preview cases,
16 durable-save/recovery cases and the prior 116 Inventory/form/onchange/confirmation
cases, with 116 exactly matching Python files and all 134 guarded tables preserved.
An independent committed count/full-row-hash comparison matches its baseline for
all 134 tables. The worker is terminal/removed. Installed metadata remains 49;
mandatory analytics and SMS validation remain enabled. The native tests ran
without HTTP, published ports or a persistent addon upgrade. Actual saves were
inside rollback-only synthetic test transactions, not real patient records.

The matching current typed client accepts **214 recorded native responses across
all 14 form/draft/edit/review/save/recovery methods**, with transport mocked. This
checks the actual native JSON against the actual client, not HTTP or React
acceptance. Native log SHA256:
`dfeddadf12b56809c6d9dace27ca6da27494d01bd9d2ed7fc523e84ed28dee4f`.
Replayed client SHA256:
`51769ac13b125b052514f2288c5a01fb99379ae30e9580f2467bab228bb326eb`.
Independent committed-table baseline/after SHA256:
`3b2b546a4afffdb312cf3d354d2214292c137868f6d6e74b6bba4f3b95a85139`.

The first candidate-80 run completed 34 cases with four assertion failures, one
test-framework error and no skips. All 134 rollback guards and independent
committed-table counts/full-row hashes were preserved. Its fixture corrections
retain native behavior: plain-text HTML notes are wrapped in paragraphs, a
single-row review is already complete, PostgreSQL name collation is not Python
sorting, and Odoo's assertion override requires a single exception class rather
than a tuple. The updated page fixture now genuinely spans multiple pages. No
production model or permission was changed to make those assertions pass. The
successful 150-case rerun verifies those corrected fixtures alongside the prior
native suites; the failed packet remains retained.

Current frontend checks pass: **1,899 Home cases/110 suites**, including 62 added
account-time/planning cases, the earlier 45 header editor/field/routing/cache
cases, 29 Save/recovery client tests and the
earlier 42 header-recovery storage cases. The shared
stock storage suite has 153 cases; the four form/edit/review/recovery client test
files contain 137 cases. Library and actual changed-test-source types, scoped
lint/format and 116 Python AST parses pass. Three temporary gateway stub checks verify that all 14 unfinished
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
changes pass in the candidate-80 native run.

The earlier source-79 focused 18-case/29-response proof remains valid only for its
frozen source and v1 preview-only schema. It does not accept the new writer or v2
complete-proof schema. New client tests and gateway checks are separate evidence,
not a substitute for the native run, real HTTP/browser testing or clinical and
accounting review. Nonempty generated-reference workflows, cross-account/company
matrices, real concurrent Save/Stop replay, wider child-view/context/widget cases
and scale still need explicit coverage. Creation, duplication, the remaining
Inventory/Billing workflows and the other modules remain in the full goal.
