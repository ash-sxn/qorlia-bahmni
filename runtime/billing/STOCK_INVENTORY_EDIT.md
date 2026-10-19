# Stored Inventory header onchange and effect inspection

[README](../../README.md) · [Billing](README.md) · [Inventory workspace](STOCK_INVENTORY_WORKSPACE.md) · [Native forms and new drafts](STOCK_INVENTORY_FORM.md)

## Candidate 77, 20 October 2026

This source reconstructs a **saved transfer's native header form** and previews
ordered scalar edits. It does not persist the header or finish Save. The native
contact onchange can itself write existing stock moves, so pretending this is
just a local field update would lose real native behavior. Those linked writes
execute in a rollback-only preview and can be inspected in complete effect
pages. No fake Sales order or new stock engine is introduced.

All four methods on `stock.picking` remain blocked from the review gateway:

| Method | Result |
| --- | --- |
| `qorlia_inventory_edit_load(transfer_id)` | Current native form, saved identity and original version. |
| `qorlia_inventory_edit_onchange(transfer_id, version, edits)` | Ordered native replay, transient form/domains and an onchange-effect version/count. |
| `qorlia_inventory_edit_choices(transfer_id, version, edits, node, search='', offset=0)` | Replay first, then search the edited field's native domain/context. |
| `qorlia_inventory_edit_effects(transfer_id, version, edits, after=0, effect_version=False, continuation_token=False, limit=50)` | Sequential complete pages of the native onchange's stored side effects. |

## What is pinned and what changes

The selected ID must be a real saved transfer. Complete native Inventory scope,
linked-record access and active-company checks run before replay. Root values
come from that stored record, and existing collections remain linked to their
real native rows. The merged view and native `_onchange_spec` own the field and
child-field behavior. Unsupported native types fail explicitly, not silently.

The original version binds the native form, complete linked scope, actor,
companies, groups, locale/timezone and guarded data/configuration. A stale
record, relation label, view, role or configuration reloads the form. The caller
cannot replace that basis with a supplied values object or arbitrary domain.

Each edit is exactly `{node, value}`, referring to a root-layout occurrence.
New and saved forms share field validation: visible/readonly rules, native
field access, finite values, dates, selections, relation domains and custom
name-search eligibility. The ledger is at most 100 edits and two million
serialized JSON characters; no text is silently truncated. Child/identity
fields need their own native workflow, not a header scalar write.

Replay calls native onchange on the **saved origin**, not a new/dummy picking.
It preserves warnings, cleared values, child commands and dynamic domains.
Transient form values are returned, but stored header values remain unchanged
when the transaction rolls back. Search runs under a nested read-only guard, so
an unexpected search write cannot become part of a supposedly harmless lookup.

Intermediate presentation versions derive from the already pinned full basis,
avoiding another complete database fingerprint for every field edit. Full
initial/final rollback guards remain. This is not concurrent hospital-scale
acceptance; complete native replay and effect capture are still repeated for
each page and need realistic profiling.

## Guard and paging boundaries

The existing preparation capture is reused with an explicit **preserve stored
state** mode. Done/Cancelled notes can be previewed when the native form permits
them, but the stored state must remain identical. Default preparation callers
still reject terminal fulfillment. Financial, configuration and physical-stock
guards remain; queues for precommit/postcommit/prerollback/postrollback are
isolated and restored. All transactional writes roll back before a response.

Responses remain `read_only: true`, `write_ready: false`. `effect_count` counts
public effect rows; private audit counts remain separate. Private effect content
is bound by the existing signing machinery and is not returned. Effect versions
and continuation tokens bind the original request, account and complete native
result. A skipped page, changed request or changed native baseline restarts
inspection. Pages contain at most 100 rows (50 by default).

These are **onchange effects, not complete save effects**. A note-only preview
may have zero stored effects because the actual header write has not happened.
There is deliberately no save endpoint, request key, receipt or save-completion
proof here. Do not use this effect token in another workflow or enable Save from
it. The future writer must review the header write and child commands, compare
actual native results, enforce final company/constraint checks and provide exact
durable recovery. Source read-only inspection is not permission to bypass those
remaining steps.

## Verification status

A corrected frozen **116-case native run passes, zero failures/errors/skips**: 13 saved-form cases, the prior
58 Inventory form/draft/list/detail cases and 45 existing confirmation cases.
The latter exercise the shared preparation helper's unchanged default mode.
All 112 frozen Python hashes match the recorded run. Current source differs only
by one removed trailing blank line in its test file, with exact difference and
equal AST independently asserted. All 132 guarded tables, mandatory analytics,
SMS and installed metadata 49 are preserved. Independent read-only SQL counts
and full-row hashes match the committed pre-run baseline. The worker is terminal
and removed. Its source was readonly with no HTTP or published ports. Bootstrap
warnings remain; this is not a clean install or persistent addon upgrade.

The independent native-JSON checker accepts **101 responses across all nine
form/draft/edit methods**. Three temporary gateway tests still explicitly block
these unfinished methods. Broad role/configuration, child editing, complete
save/create/duplicate/recovery, React, actual HTTP/browser, scale,
concurrency and approved release remain unaccepted.
Log SHA256:
`44475b349f3c9f73bfcc60348c43e9476ad26497ae000d9e987e598af23d5b95`.

The first frozen run completed all 116 cases with **three assertion failures,
zero errors/skips**. All 132 guards, mandatory analytics/SMS and installed
metadata 49 remained unchanged. Independent read-only SQL counts/full-row hashes
match the pre-run committed baseline. The failed source/log are retained.
Two assertions incorrectly assumed newly created/copied moves already carried
the picking's contact; the corrected fixtures compare the actual original move
contacts. The Sales-linked test had not created a procurement group, so its
claimed picking-to-order link was absent. The corrected fixture establishes and
asserts that real native link before preview, while keeping its actor without
Sales membership. No product permission or expected native access is relaxed.
The corrected run also checks callback restoration after native onchange fails.

### Complete current form/draft/onchange client source

All nine existing native methods now have typed source callers through the same
guarded Billing RPC transport. This is not a new save protocol or permission to
expose unfinished routes. New drafts retain their original signed seed and
ordered edits; saved forms retain their actual transfer ID and original version.
No fake order, direct child edit, arbitrary context/domain, new nonce or Save
request is introduced.

| Native API | Client source function |
| --- | --- |
| `qorlia_inventory_form_load` | `getInventoryNativeForm` |
| `qorlia_inventory_form_choices` | `getInventoryNativeFormChoices` |
| `qorlia_inventory_draft_load` | `getInventoryDraftForm` |
| `qorlia_inventory_draft_onchange` | `previewInventoryDraftForm` |
| `qorlia_inventory_draft_choices` | `getInventoryDraftFormChoices` |
| `qorlia_inventory_edit_load` | `getInventoryStoredForm` |
| `qorlia_inventory_edit_onchange` | `previewInventoryStoredForm` |
| `qorlia_inventory_edit_choices` | `getInventoryStoredFormChoices` |
| `qorlia_inventory_edit_effects` | `getInventoryStoredFormEffects` |

Client validation rejects malformed/changed seed echoes, wrong saved/new scope,
unordered or oversized edit ledgers, nonfinite values, write-ready/save-proof
injection, edited-choice/form mismatches, skipped/incomplete effect pages,
unrelated labels and replaced effect versions. Private audit counts stay
separate from public row counts. Final onchange pages do not become Save proofs.
Session expiry propagates rather than becoming an empty successful form.

All **1,701 Home tests/104 suites pass**, including 88 form/edit-client cases.
Library and actual test-source types, scoped lint, Python AST, gateway, docs and
diff checks pass. Independent replay of the actual client accepts all **101
native candidate-77 responses**: 31 form loads, six form-choice pages, 20 signed
draft loads, 18 draft replays, one edited-draft search, 14 saved loads, seven
saved replays, one edited-saved search and three saved-effect pages. Transport is
mocked, so this is source/client contract evidence, not HTTP, React or browser
acceptance. Client SHA256:
`2bf3d860cf32195f7786e3faa4511e7902259a40a675c540b54c3db28b26ea33`.

Before implementing the writer, preserve the native distinction between dirty
fields and all current values. Native `Record.getChanges` omits readonly values
unless `forceSave` applies and obtains child changes through their own command
handling. A source onchange result must not simply be written wholesale. Final
required/company rules, child views/commands, complete native effects and exact
durable recovery still need implementation and independent verification.

### Earlier read-only native form client checkpoint

The [read client](../../apps/home/src/components/Billing/billingService.ts)'s
`getInventoryNativeForm` and `getInventoryNativeFormChoices` call only the two
named form readers. They validate literal new/saved identities, complete scalar
values and relation labels, native layout/rules/presentation, collection versus
unsupported-type separation, search identity, finite JSON and session expiry.
Native domain/context/options expressions remain opaque strings; the browser
does not evaluate Python or invent relation eligibility. Existing native fields,
separate labels, HTML content and unsupported types remain explicit in the DTO.
The eventual React renderer must safely render HTML and resolve unsupported
widgets before enabling a complete editing workflow.

All **1,644 Home tests/103 suites pass**, including 31 new read-client cases.
Library and actual test-source type checks, scoped lint and 44-document link/
no-em-dash checks pass. Replaying the actual client against the older verified
source-76 log accepts **37 native responses: 31 form loads and six choice pages**.
This uses mocked transport, not actual HTTP, React or saved/draft client acceptance.
Client SHA256:
`71c6f5dfe964803f1dcb183779dfa278a7a3cc4fbd7a8b5f0885147dada5b9ca`.
The source gateway still blocks these methods. Adding typed source calls does
not open review access or make the current runtime capable of serving them.

No schema, dependency, permission grant, persistent addon upgrade, frontend
build/server, review reopening, tunnel, hosted tester or production deployment.

The older source-74 full regression is independently verified at 1,029 native
cases, with 108 matching Python hashes, 132 preserved tables, unchanged committed
SQL, 1,088 matching-client responses using mocked transport and 17 native
form-only responses. It does **not** accept source 77 or newer React/runtime
behavior. See the [source-specific form verification](STOCK_INVENTORY_FORM.md).
