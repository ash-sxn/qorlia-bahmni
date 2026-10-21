# Native Inventory transfer creation

[README](../../README.md) · [Billing](README.md) · [Draft form](STOCK_INVENTORY_FORM.md) · [Inventory](STOCK_INVENTORY_WORKSPACE.md)

## Candidate 84 creation recovery API source checkpoint

[The recovery adapter](qorlia_billing_ui/models/stock_inventory_create_recovery.py)
adds three named source methods and matching typed client calls, not a public
creation writer or an enabled gateway:

| Native source method | Typed client | Purpose |
| --- | --- | --- |
| `qorlia_inventory_create_status` | `getInventoryCreationStatus` | Compact unknown/accepted/stopped outcome without requiring a returned transfer ID |
| `qorlia_inventory_create_references` | `getInventoryCreationReferences` | Bounded, version-pinned current-access reference pages |
| `qorlia_inventory_create_stop` | `stopInventoryCreation` | Durable Stop, preserving prior acceptance rather than undoing creation |

The original signed seed, ordered edits, review bindings and UUID are retained
exactly. Existing journal database/actor/company/body checks apply. Acceptance
does not vanish when a document is deleted or becomes unreadable. Before an ID
or name is returned, the adapter checks current native model, record, label-field
and active-company access. An unavailable reference contains false ID/name and
an explicit unavailable flag, not a hidden raw ID. The accepted state's original
value is historical, not a claim about the current document state. Unknown and
stopped outcomes have no transfer, state or reference count. Complete reference
pages have a server-secret-bound version; changing current labels or access
requires restarting their pages. There is no generic receipt CRUD interface.

The typed client validates exact request/response keys, original UUID, terminal
flags, created-state vocabulary, root privacy and bounded complete reference
pages. It neither invents a saved ID nor retries Stop after a lost response.
No new Save/review API, browser persistence schema or React Create consumer is
included. All three new methods and their private helpers remain gateway-blocked.

The new native child-reference cases found a real read-boundary issue: native
default-child onchange updates a product's audit author without changing its
business values. The failed first run and separate diagnostic logs are retained.
Native JSONB hash reconstruction, restoring only `write_uid`, exactly matches
the original product row; no other protected table changed in the diagnostic.
One earlier diagnostic reconstruction attempt failed in its own Python-to-JSON
representation; the successful diagnostic retains native PostgreSQL JSONB text
instead of reserializing values through Python. Neither diagnostic is a passing
product regression.

The shared read sandbox now checks all 134 tables for business changes inside
the callback-isolated rollback boundary, then verifies every complete raw row,
including all audit fields, is restored outside it. Native preparation uses the
same business-value distinction inside that boundary. This is not permission to
persist audit changes, omit tables, accept changed business values, consume
sequence references in preview or reset counters. Explicit positive audit-only
rollback and negative business-write cases retain full outside fingerprints and
callback checks; actual default-child recovery cases exercise the native hook.

The second run was stopped on two test-fixture errors, not accepted. Odoo's
native `assertRaises` wrapper requires a single exception class, so each invalid
paging case now states its exact expected exception instead of a tuple. The
callback check also drains the fixture's earlier native tracking before taking
its baseline, matching the read boundary's documented initial flush; callbacks
created inside the sandbox still must not escape. The paging cases, native child
rows, all callback objects and full outside-row checks remain in the selection.

The complete Home suite passes **1,956 cases across 112 suites**. Three focused
service suites pass 121 cases. Source and actual new test-source type checks,
scoped lint/format, three gateway stub cases and contributor links pass. The
Home run retains its existing undefined-query-data warning in a passing
reservation-recovery fixture; no assertion or warning was suppressed. The first
one-off type-check command had incompatible declaration-map flags; its corrected
actual-source invocation reports no diagnostics. These frontend checks use
test doubles and do not accept native HTTP, storage or browser behavior.

The corrected native regression completed **202 cases, zero failures, errors or
skips**: 16 new recovery/read-boundary cases and the unchanged 186-case selection.
All **124 Python source hashes** match both the frozen worker and current source.
The actual typed client accepts **309 recorded native responses across 17 named
methods**, checking complete request envelopes and returned values with mocked
transport. This includes ten creation-status, twelve reference-page and four
Stop responses, not a real HTTP or browser session.

Independent committed SQL counts and full-row hashes for all **134 protected
tables** match before and after the run. A fresh independent query confirms the
journal table is absent. The no-HTTP worker exited zero and was removed, with
read-only source and no exposed ports. Mandatory analytics and SMS remained
enabled; installed addon metadata remains `16.0.1.49.0`. Test-only journal DDL
was rolled back, not installed in the shared database.

Completed native log SHA-256:
`076d47d5f18a4d2d155e1f6cf3ee227be76e61569ccdc1166c9354189d113827`.
Typed client SHA-256:
`a22ab015d3c84cda6185e7b510bfc3870b2ee4d6e8ebdabaa5cb4a1a1f3b3cf8`.
Independent 134-table SQL SHA-256:
`3b2b546a4afffdb312cf3d354d2214292c137868f6d6e74b6bba4f3b95a85139`.

Source-83 committed-race evidence below is separate, not a source-84 race rerun.
Complete sequence-safe review, public Save/proof, durable client/UI creation,
child-form parity and HTTP/browser/release acceptance remain unfinished. Review,
public access, installed runtime and deployment remain unchanged. No frontend
build/server, native HTTP/browser acceptance, tunnel or purchase is included.

## Committed native recovery and concurrency, 21 October 2026

[The opt-in native harness](../../scripts/test-inventory-creation-journal-concurrency.py)
now verifies committed history and real two-connection races on unchanged
source 83. It is not a `TransactionCase`, a mocked journal lookup or an HTTP test.
It refuses optimized Python, HTTP-enabled startup, an unapproved database-name
shape or a missing exact database opt-in. An operator must provision a disposable
synthetic database copy whose name matches `qorliaqa_create_journal_YYYYMMDD_rN`
and set `QORLIA_COMMITTED_JOURNAL_TEST` to that exact name. This script commits
test schema, users and business records in that copy. Never point it at an
ordinary development, shared-demo or hospital database.

It is a manual operator test, not part of ordinary local Python or Jest. Start
the matching native Odoo shell with private configuration, `--no-http`, the
disposable database selected and the exact opt-in environment variable set.
Within that shell, run the repository script with `runpy.run_path`, passing
`init_globals={'env': env}` and `run_name='__main__'`. The operator must archive
the completed evidence and remove only that verified disposable copy afterward.
Do not change the name guards, opt-in, source assertions or native permissions
to run it on an existing shared database.

Each worker opens an independent repeatable-read cursor and reads the unknown
request before the first action. The harness wraps the real journal read only
to hold the first terminal outcome uncommitted, and wraps native creation only
to count calls while delegating to the actual implementation. PostgreSQL
`pg_blocking_pids` must observe the second connection waiting on the first.
Releasing the first commit causes a real immediate-key collision in the second
transaction, actual SQLSTATE `40001`, and the installed native `retrying` loop
rolls back/resets and starts a fresh attempt. No lookup, native result or SQL
failure is fabricated, and no reference sequence is reset.

| First action | Competing action | Committed result | Actual native creations |
| --- | --- | --- | --- |
| Save | Save | Both recover the same accepted outcome | 1 |
| Stop | Save | Both recover the same stopped outcome | 0 |
| Save | Stop | Both recover accepted; Stop does not undo creation | 1 |

All three races pass: the first worker runs once, the second twice, with exactly
one observed `40001` retry per race. Fresh committed cursors then check status,
Save and Stop. Both created transfers are deleted through the actual native ORM
and committed. Further fresh cursors still recover the original exact history
without another native creation. Changed-body reuse rejects. Independent SQL
confirms two accepted journal rows, one stopped row, no pending row and no
remaining transfer matching the accepted IDs. Mandatory analytics and SMS stay
enabled; installed addon metadata stays 49, with all 122 unchanged source hashes
matching source 83. This supplements, not reruns or replaces, the 186-case
rollback regression below.

The one-off worker used read-only source/harness mounts, no HTTP and no exposed
ports, exited zero and was removed. The existing synthetic source database has
independently unchanged counts/full-row fingerprints for all 134 protected
tables and no journal table. Only the disposable copy received committed schema
and fixture data. Its final state was archived with a validated native dump
before removing that exact database; the archive and complete log are private.
No installed shared runtime upgrade, frontend build/server, review reopening,
public deployment or purchase was made.

Harness SHA-256:
`c853cabb8f41afdd3e654804cbda554fb0bc52fe8b2a6f13de25fcf6ef3d9acb`.
Completed native log SHA-256:
`91b15c29599cad095313ec957c0cb1f259f9553b3cdd23b4ff5478b51eb852c9`.

Remaining: sequence-safe complete creation review, public proof/Save/status/
reference/Stop APIs with current access rules, durable client/UI integration,
child-form and other native parity, HTTP/browser/release checks and hospital-scale
contention. The three bounded races are not a load test or public creation-proof
acceptance. Proof-shaped values here remain opaque private-journal bindings.
Create/gateway/review stay disabled. No frontend tests/types/build were rerun;
no frontend or addon implementation changed in this harness checkpoint.

## Candidate 83 private request journal source checkpoint

[The private journal](qorlia_billing_ui/models/stock_inventory_create_journal.py)
adds a native-database request claim and terminal accepted/stopped outcome,
independent of the created business record. It is not an ordinary ORM model, so
there is no generic journal record read/export/write interface. Only the
request UUID, exact-body digest, actor/company scope, timestamp and minimal
accepted transfer/state/reference metadata are stored, not the full form seed,
notes or request payload. The digest also binds the actual database.

Creation claims the immediate unique UUID before calling the source-82 native
engine. The claim, actual creation and terminal metadata share one transaction.
Failures restore the claim, business rows and original deferred callbacks.
Retries and Stop return a matching terminal outcome without rerunning creation;
historical acceptance remains available after the transfer is deleted. Changed
body/actor/company scope rejects. An unexpected persisted pending shape rejects
instead of guessing that creation should run again. Only the journal's own
primary-key collision is converted to a real PostgreSQL `40001` for native
fresh-transaction retry; other native uniqueness errors remain their own errors.

This is **private transaction/recovery source, not a public Save or review-proof
validator**. Proof-shaped values are bound as opaque inputs here. The tests use
clearly labelled placeholder proof bindings to isolate journal behavior; they
do not prove creation-review authorization. A future public writer must verify
the complete native creation review, preserve account-scoped client recovery
and apply current access rules before exposing historical references. The UI
Create action and gateway routes remain disabled. The native engine remains
Save-only, not a read-only preview.

Schema setup is privileged and verifies exact columns and an immediate valid
primary key. Missing/incompatible schema fails closed; ordinary requests never
create or repair it. A [fresh-install hook](qorlia_billing_ui/hooks.py) and
[versioned upgrade migration](qorlia_billing_ui/migrations/16.0.1.83.0/post-migrate.py)
provide future operator-controlled installation. Neither is run against the
installed database by the current worker. Its journal test class explicitly
creates test-only DDL in its uncommitted class cursor and closes with rollback.
Table absence must be independently checked before/after, not inferred from the
134 older business-table fingerprints. There is no new ORM model, role grant,
dependency, installed upgrade, frontend build/server or review reopening.

[Fifteen new native cases](qorlia_billing_ui/tests/test_stock_inventory_create_journal.py)
cover native creation/replay, deleted-record history, Stop, request/actor/company
binding, malformed input, signature failure, native/metadata failure and callback
restoration, real uniqueness errors, invalid pending/result data, immutable
returned metadata and schema/privacy boundaries. The forced stale-read test
uses a real database uniqueness violation and SQLSTATE but a mocked lookup; it
is not an actual two-connection concurrency test. Single-cursor rollback tests
also do not prove committed cross-request or HTTP/browser durability.

The corrected source-83 selected native regression completed **186 cases, zero
failures, errors or skips**: 15 journal, ten execution, eleven preparation and
150 existing Inventory/form/header-save/confirmation cases. All **122 Python
hashes** match the frozen worker and current source. This is not the full addon
suite. New journal cases ran first for faster failure feedback, retaining the
complete legacy case set. Mandatory analytics and SMS remained enabled.

All **134 protected tables** were preserved. Independent committed SQL counts
and full-row hashes match before/after, and a fresh independent query confirms
the journal table is absent. The no-HTTP worker exited zero and was removed;
installed metadata remains `16.0.1.49.0`, with source `16.0.1.83.0` mounted
read-only and no exposed ports. No persistent schema or addon upgrade ran.

The actual unchanged `billingService.ts` accepts **269 recorded native responses
across 14 existing methods**, using mocked transport and asserting the complete
request envelope and response. This does not add or accept a public Create SDK.
Three temporary gateway stub cases, AST parsing of all 122 Python files,
contributor links and whitespace checks also pass. No frontend build, type check
or frontend suite was rerun; no frontend implementation changed here.

The retained corrected native log SHA-256 is
`5c828b60ab046e5431714f12c10d9aa55d90ed7b07e40cfd9715eed3c91ea451`.
The client source SHA-256 is
`51769ac13b125b052514f2288c5a01fb99379ae30e9580f2467bab228bb326eb`.
The independent 134-table SQL result SHA-256 is
`3b2b546a4afffdb312cf3d354d2214292c137868f6d6e74b6bba4f3b95a85139`.
The source-82 proof below stays separate. No sequence-safe creation review,
public endpoint, committed/two-connection concurrency, installed migration,
HTTP/browser/UI or release acceptance is claimed. Create/review remain disabled.

The first source-83 run was stopped on a confirmed fixture error, not accepted:
Odoo discovered a mock's fabricated `_ondelete` attribute and called the mock
as a deletion hook. A plain function guard replaces that mock, retaining real
transfer deletion and the no-duplicate-creation assertions. Its failed log is
retained privately (SHA-256
`5e690ddd91b447bd858a4f2dba69667976ee3df516c5b89bc557c5b964b1513d`).
After worker removal, independent SQL confirmed all 134 committed business-table
fingerprints unchanged and the test-only journal table absent. This cleanup
evidence does not turn the failed run into a pass. The corrected run above has
its own frozen source, complete log and independent cleanup proof.

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
the frozen worker and accepted source-82 commit `7d42f7d3`. This is not the full addon suite. The worker
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

Source 83 above implements the private form of the protected request anchor:
actor, request UUID/digest, original company scope, accepted/stopped outcome and
native reference identities. It is not an ordinary ORM model or permission to
upgrade the installed database. Public writer/proof integration remains
unfinished. The committed source-83 harness above separately proves the three
private-journal Save/Stop races and fresh-cursor recovery; it does not prove a
public creation writer or source-84 current-access responses. Avoid
retaining the full seed, notes or payload merely to identify a retry. A journal
must survive ordinary business-record deletion and must not be editable through
the native generic UI/RPC. The source-83 tests cover the private schema,
metadata, uniqueness and deletion boundary without a committed runtime upgrade.
Retention and retirement must not silently erase duplicate-prevention history.

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
errors into validation errors instead. These source facts guide the private
journal implementation. Source inspection alone is not concurrency proof; the
separate committed source-83 harness above supplies that bounded evidence.
`TransactionCase`
uses one class cursor
and per-test savepoints and closes without committing, so a passing class alone
does not prove durable recovery across independent committed requests.

### Sequence boundary found in the installed source

Read-only inspection of the installed `web/static/src/legacy/js/views/basic/basic_model.js`
(`save`, around lines 1110 to 1215) confirms that a new form serializes all its
prepared values and x2many commands, removes the ID, calls native `create` once
on Save, then reloads the actual saved record. `form_controller.js` delegates to
record Save through `basic_relational_model.js`. No stock-specific Save override
was found in the inspected `stock/static/src` sources. The browser's
`saveInProgress` flag prevents overlapping calls in that open client; it is not
durable lost-response recovery across clients. The separate journal supplies
that additional safety boundary.

The next creation review must preserve this native boundary: review the complete
native prepared form without allocating a root identity/reference, then perform
one actual native creation on Save. Any review of prepared values must be named
honestly, not described as an already executed creation-effect simulation. These
source observations guide the remaining implementation; they are not a completed
review/proof/writer or frontend acceptance checkpoint.

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
