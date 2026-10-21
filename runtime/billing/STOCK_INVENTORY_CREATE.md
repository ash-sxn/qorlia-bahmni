# Native Inventory transfer creation

[README](../../README.md) · [Billing](README.md) · [Draft form](STOCK_INVENTORY_FORM.md) · [Inventory](STOCK_INVENTORY_WORKSPACE.md)

## Candidate 82 native execution source checkpoint

The next private stage, `_qorlia_inventory_create_native(seed, edits)`, executes
actual native creation as the original actor, using the verified preparation
boundary and operation context. It obtains the real transfer ID/reference from
native `create`; there is no fake saved-record anchor or generated browser name.
It returns the original unsaved form, actual native outcome, complete effects,
private audit and real new references for a future reviewed Save consumer.

The shared native-effect guard now has an explicit creation mode. Its caller has
no existing transfer identity; the returned record must be a genuinely new,
stored transfer, not an existing, empty, missing or different-model result.
Native create record rules and company checks apply. The guard retains existing
financial, configuration, physical-stock, terminal-state and complete-effect
checks. Its default existing-transfer path is unchanged. The execution boundary
uses a savepoint and restores the original deferred callback objects, functions
and data on failure, rather than retaining work from a rolled-back create.

This is **Save-only internal execution, not a read-only preview**. Native
creation allocates real references. PostgreSQL sequence allocations may survive
a failed native transaction, as explained below; no counter is reset or claimed
to be rolled back. The helper must not be wired to a preview/read endpoint.
Sequence-safe review, the public Save protocol and independent durable
acceptance/Stop/retry recovery remain unimplemented. The UI Create action and
gateway routes remain disabled. There is no new model, field, table, ACL,
dependency, installed upgrade, frontend build/server or review reopening.

Ten added execution cases compare real receipt/delivery/internal creation and
default-child/autoconfirm behaviour with native `Form.save()`. They check real
distinct references, caller ownership, private follower effects, rejection of
configuration/physical/financial/terminal changes, wrong returned identity,
invalid seed/actor, callback restoration and refusal to reuse an existing root.
An explicit active-second-company case checks the actual created company's
effects and rejection of an extra foreign-company effect in the same request.
The corrected source-82 native regression completed **171 cases, zero failures,
errors or skips**: ten execution, eleven preparation and 150 existing
inventory/form/header-save/confirmation cases. All **118 Python hashes** match
the frozen worker and source. This is not the full addon suite. The worker
preserved all 134 protected tables; independent committed SQL counts/full-row
hashes match before/after. Mandatory analytics and SMS stayed enabled. The
no-HTTP worker had a read-only source mount and no published ports, exited
successfully and was removed. Installed addon metadata remained version 49;
the in-memory source version was 82, not a persistent addon upgrade.

The actual unchanged TypeScript client accepts **254 recorded native responses
across all 14 existing form/draft/header-save methods**, with transport mocked.
This validates those existing response contracts, not a new public Create API
or creation UI consumer. Three gateway stub checks, 118-file Python parsing,
contributor-document links and whitespace checks pass. No frontend tests, types
or build were rerun because frontend implementation is unchanged and review
remains closed. This is not HTTP/browser, IndexedDB, full-addon,
concurrency/scale, sequence-safe preview, durable create recovery or release
acceptance. Source-81's older result below remains separate history.

Native log SHA-256:
`b6cc6f793a85d61b132f142e17b82f41729cbeba7b8028359f5e1b9a25183609`.
Matching client SHA-256:
`51769ac13b125b052514f2288c5a01fb99379ae30e9580f2467bab228bb326eb`.
Independent 134-table committed baseline/result SHA-256:
`3b2b546a4afffdb312cf3d354d2214292c137868f6d6e74b6bba4f3b95a85139`.
Raw logs and launch/account/configuration details remain private.

The first 170-case worker was deliberately terminated after confirmed native
errors and is not a complete passing run. Effect projection was still bound to
the empty creation model rather than the actual created transfer, so the strict
company check correctly rejected legitimate created records. Projection now
uses the actual target; the existing company comparison is unchanged. The
frozen failed source/log are retained. The added second-company case proves
both legitimate creation and rejection of another company's unintended effect;
it is not permission to weaken company boundaries or grant production roles.
The failed worker's removal was verified, and independent committed counts and
full-row hashes for all 134 protected tables match before/after. This does not
claim that native reference counters were rolled back.

## Candidate 81 preparation source, 21 October 2026

This is the create-values preparation part of the native creation contract, not
a completed creation workflow. The Qorlia Create button remains disabled. There
is no new public API, create writer, complete-effect review proof, durable
creation receipt, stop marker or enabled gateway method in this checkpoint.
Creation/duplication and recovery remain in the original full parity goal.

[The creation helper](qorlia_billing_ui/models/stock_inventory_create.py) adds the private
`_qorlia_inventory_draft_prepare(seed, edits)` helper. It authenticates the signed
native defaults using the existing actor/database/company/view/data basis,
replays the exact ordered scalar ledger and prepares native root and child
values using the existing merged-view save-field extractor. New forms include
native defaulted values, not just the user's edited scalar names. Required,
readonly, force-save, nested identity and company checks remain server-side.
Before materializing an ORM form, the existing recursive child-command normalizer
converts native JSON relation pairs to IDs and retains virtual child identity.
This does not alter the original signed seed or replace it with fresh defaults.
No ID, name/sequence or root transfer is invented to reuse a saved-record path.

[The draft replay](qorlia_billing_ui/models/stock_inventory_draft.py) now has a private value-returning stage so creation can retain
native child/default values. Existing public draft-load/onchange/choice shapes
remain unchanged. The preparation result is the current unsaved form plus
prepared values, not authorization to submit those values as an arbitrary
browser create request. A future writer must revalidate the exact seed/ledger,
native effects and receipt contract rather than trust returned values.

Preparation runs inside the existing callback-isolated rollback-only form
boundary with an additional check of all 134 saved-header guard tables,
including followers and their subtype relation. It never invokes native create
or assigns a reference. A future real native create also has sequence,
autoconfirmation, follower and linked-row behaviour, which this helper does not
claim to review or persist. Lost-response recovery still needs a durable
identity independent of a record ID the browser has not received. Existing
invoice/order creation-key patterns inform that design; their simpler save
receipts are not automatically complete Inventory creation/recovery parity.

The source manifest is `16.0.1.81.0`. No field/table/ACL/dependency change or
persistent addon upgrade is introduced. The source gateway still blocks all 14
unfinished form/review/write methods and explicitly denies the two new private
helper routes. Billing review stays closed, with no frontend build/server,
native HTTP/browser test, tunnel, public deployment or purchase.

## Requirements for the remaining writer

These are implementation requirements, not an enabled writer or a deployment
decision. The existing header-save receipt cannot simply be attached to a new
transfer ID before native create has returned that ID.

| Case | Required behaviour |
| --- | --- |
| Create response is lost | Recover acceptance from the original actor/scope, request UUID and exact-body digest without needing a returned transfer ID. Never issue a new UUID automatically. |
| Same key, changed body/account/company scope | Reject it. Do not reinterpret a pending or accepted request under a new scope. |
| Concurrent retries | A database uniqueness boundary and transaction-safe serialization must prevent duplicate business creation, including an old transaction snapshot after waiting for a lock. An advisory lock plus an ordinary search alone is not sufficient. |
| Stop wins before create | Preserve a durable stopped outcome independent of an as-yet nonexistent transfer, so the old request cannot create later. |
| Save wins before Stop | Report accepted, not undone. Stopping recovery does not cancel/delete the created native stock document. |
| Accepted transfer is later changed or deleted | Retain the original acceptance so retry cannot create another transfer. Resolve current document/reference access separately from the historical acceptance. |
| Permission changes | Actual native create runs as the authorized actor. Private receipt storage must not grant business access or expose another actor's result. Direct ordinary receipt CRUD and caller-supplied capability contexts must be rejected. |
| Deferred/external effects | Account for native scheduling, autoconfirmation, followers, child rows and callbacks. Unreviewed financial/physical/configuration effects must not escape on failure. |

A separate, minimal, protected request journal is the likely durable anchor:
actor, request UUID/digest, original company scope, accepted/stopped outcome and
native reference identities. This is a design direction to implement and test,
not an existing model or permission to upgrade the installed database. Avoid
retaining the full seed, notes or payload merely to identify a retry. A journal
must survive ordinary business-record deletion and must not be editable through
the native generic UI/RPC. Its schema, privileged metadata boundary, uniqueness,
retention and retirement rules still need explicit implementation and review.

Claim the unique request **before** executing native creation, in the same
transaction as the accepted outcome. Inserting a receipt only after create can
allow two concurrent attempts to allocate references and execute hooks before
the duplicate is detected. A stale-snapshot uniqueness collision must cause a
real retryable PostgreSQL serialization error, so native request handling starts
again with a fresh snapshot; do not convert it to an ordinary validation error
or retry the business action within the old snapshot. A pending claim must not
commit separately from its terminal result. Failed execution must roll back the
claim and business rows and restore deferred callbacks together.

A private SQL journal can use the existing native database transaction without
exposing an ordinary ORM model's generic read/export/write methods. It still
needs versioned, privileged schema installation and real uniqueness checks;
schema creation must not occur as an incidental customer request. Do not use
`ir.config_parameter` as an improvised request store or attach acceptance solely
to a business record which can be deleted. A single-cursor rollback-only test
can check structure and failure rollback, but cannot by itself prove committed
cross-request recovery or concurrent retries. Those need separate evidence
before public Create is enabled. No journal schema is installed by this source
checkpoint or by its current worker.

Read-only inspection of the installed runtime confirms the relevant boundaries:
`odoo.models.check_method_name` rejects underscore-prefixed methods and `init`
over remote dispatch. `odoo.service.model.retrying` rolls back/resets the native
environment and retries recognized concurrency `OperationalError` codes,
including SQLSTATE `40001`, up to five attempts. It converts ordinary integrity
errors into validation errors instead. These source facts guide the future
journal implementation; they are not evidence of an implemented journal or a
successful real concurrent-create test. `TransactionCase` uses one class cursor
and per-test savepoints and closes without committing, so a passing class alone
does not prove durable recovery across independent committed requests.

### Sequence boundary found in the installed source

Installed native `stock.picking.create` calls `sequence_id.next_by_id()` before
assigning scheduling/autoconfirmation/followers. Installed
`base/models/ir_sequence.py` uses PostgreSQL `nextval` for the default `standard`
implementation, and a row update for `no_gap`. Rolling back ordinary table rows
does not prove a standard sequence was restored. The 134-table checks below are
table checks, not a PostgreSQL-sequence preservation claim.

A future preview must resolve and verify that distinction before it is enabled.
Do not repeatedly perform a nominally read-only real create and silently consume
shared reference numbers. Do not reset shared sequences to erase that evidence,
change a hospital's sequence implementation to make a test pass, invent a
reference or treat a predicted next number as reserved. Native identity is
assigned by the eventual native Save. The preparation helper avoids this problem
by not calling create or assigning a reference; it does not solve the remaining
creation-effect/recovery protocol by itself.

## Verification scope

[Eleven new native cases](qorlia_billing_ui/tests/test_stock_inventory_create.py) compare receipt, delivery and internal defaults and
ordered edits with the installed Odoo `Form._values_to_save()` representation.
They also check pinned clock defaults, readonly/force-save and default child
rows, required fields, tampered/stale seeds,
identity rejection, denied actors, no create/sequence call and rollback of an
unexpected follower write/deferred callback. Wire normalization uses Odoo's
JSON date serializer, not hand-written alternate values.

The corrected source-matched native regression completed **161 cases, zero
failures, errors or skips**, including all eleven new preparation cases and the
150 existing inventory/form/header-save/confirmation cases in this selected
suite. All **118 Python source hashes** match both the frozen worker and accepted
source-81 commit `42fa0cd9`. This is not the full addon suite. All 134 guarded tables were preserved,
mandatory analytics and SMS remained enabled, and an independent committed SQL
comparison found identical counts and full-row hashes before/after the worker.
The no-HTTP worker used a read-only source mount, exposed no ports, exited
successfully and was removed. Installed module metadata remained version 49;
this is one-off source-81 execution, not an installed addon upgrade.

The actual unchanged TypeScript client accepted **235 recorded native responses
across all 14 existing form/draft/header-save methods**, including 34 draft
loads, 25 draft onchange responses and one draft choice response. The replay
uses the real client validators and mocks transport. The private preparation
helper is not a new public endpoint. This is not HTTP, browser, IndexedDB,
layout, concurrency/scale or release acceptance. Three gateway stub checks,
118-file Python parsing, contributor-document links and whitespace checks pass.
Frontend tests/types/builds were not rerun because this checkpoint changes no
frontend implementation, and the owner's review gate remains closed.

Native log SHA-256:
`4d3773067aec316d82c7500e5a2b972ab4668706b5a0af81f824a17cfcba2919`.
Matching client SHA-256:
`51769ac13b125b052514f2288c5a01fb99379ae30e9580f2467bab228bb326eb`.
The 134-table committed baseline/result SHA-256 is
`3b2b546a4afffdb312cf3d354d2214292c137868f6d6e74b6bba4f3b95a85139`.
Private raw logs, account/configuration details and launch scripts are not
published in this repository. An initial client replay was attempted before
the local log transfer finished and correctly rejected the incomplete artifact;
the successful source/client checks above used the completed, hash-matched log.

Prior candidate-80's 150-case result did not accept candidate-81 source. Any later creation writer needs additional
native create/effect/readback, permissions, sequence/receipt, retry/concurrency,
deletion/retirement and scale coverage. Browser and release acceptance are
separate from this backend preparation check.

The first candidate-81 worker was deliberately terminated after an observed
fixture error: the test used a visible-only field lookup for the native hidden
ID node. It has no complete 159-case result and is not a pass. Its frozen source
and log are retained. The corrected fixture uses the actual hidden layout node
and retains the existing native identity rejection; no permission or production
validation was loosened. Independent committed counts/full-row hashes for all
134 tables agree before/after that worker's removal. The expanded 161-case
run adds readonly/force-save and native default-child comparisons.

The second worker was also deliberately terminated after a confirmed preparation
error, not an observation timeout. A one-case native diagnostic showed that a
default child's `product_id` was present as `[id, label]` in the signed JSON but
became an originless empty relation when passed directly to ORM `new`. The
required Product check correctly rejected it. Preparation now uses the existing
recursive normalizer, rather than dropping the child, relaxing required checks
or changing the signed seed. The child-date fixture is pinned on both native and
adapter paths. The failed source/log and diagnostic remain retained; the
diagnostic restored all 134 guarded tables and independent committed table hashes
after the failed worker match their baseline. The corrected source-matched third
161-case run passes as scoped above. Neither failed/incomplete run is an acceptance claim.
