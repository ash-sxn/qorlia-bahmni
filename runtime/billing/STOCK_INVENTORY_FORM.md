# Native Inventory transfer form contract

[README](../../README.md) · [Billing](README.md) · [Inventory workspace](STOCK_INVENTORY_WORKSPACE.md)

Latest saved-transfer source: [native onchange and complete effect inspection](STOCK_INVENTORY_EDIT.md).
It is separate from the unsaved draft path below and is not save approval.

## Candidate 76 pinned new-transfer drafts, 20 October 2026

This source adds the native **new, unsaved transfer** form lifecycle. It does
not yet edit an existing transfer, create a record, duplicate, save or authorize
release. Three source APIs remain blocked from the review gateway:

| Native method on `stock.picking` | Purpose |
| --- | --- |
| `qorlia_inventory_draft_load(picking_type_id=False)` | Read native initial defaults once and return their signed seed and form. |
| `qorlia_inventory_draft_onchange(seed, edits)` | Authenticate that original seed and replay the ordered scalar-field edits. |
| `qorlia_inventory_draft_choices(seed, edits, node, search='', offset=0)` | Replay first, then search the selected relation using the edited form's domains/context. |

The installed merged form and native `_onchange_spec` define the actual onchange
chain, including native child-field specifications. No frontend stock engine,
default generator or reference sequence is introduced. Initial scheduled dates
remain pinned while the clock moves; replay does not call fresh default/onchange
initialization and silently replace them. Date/child-command values use Odoo's
own JSON serializer before signing, so a browser round trip has the same basis.

The seed is signed native JSON, **not encrypted data or save authorization**.
It can contain native initial child defaults; do not log it to public analytics
or paste it into GitHub. Its purpose/version binds the database, actor, active
companies, groups, sanitized native action context, merged view/field/spec,
server/user calendar day and 132-table configuration/data snapshot. A changed
scope or seed must reload, not silently rebase. Caller default contexts cannot
choose another company or operation type. The selected type must pass the
existing native active/type/company/read checks; opening requires create rights.

Each edit is exactly `{node, value}`, where `node` is the zero-based occurrence
in that form's root layout. Up to 100 edits are replayed in order; conditions and
field permissions are checked again at each step. Hidden, readonly, collection
and unsupported fields cannot be changed through this scalar path. Native
selection/finite numeric/relation checks, exact date/UTC date-time formats,
active-company boundaries, default-type context, warnings and cleared values
remain. Intermediate company inconsistencies are not rejected before the user
can complete the remaining edits; native final company validation belongs in
the future save review, as in the native form. Native-length notes are not
artificially capped at the older generic helper's 10,000-character limit.
The signed seed must be finite JSON no larger than two million serialized
characters; the finite edit ledger has the same size boundary. Larger native
forms need a paged contract, not truncation.

Native onchange-supplied domains persist across the ledger. Edited relation
searches combine them with the view-domain-or-model fallback as the installed
modern relation model does. Selected relation values are checked against the
current native domain, name-search eligibility and record access, not just
accepted because they are IDs.
Python expressions remain server-side installed metadata, not caller code.

Load/onchange responses are `read_only: true`, `write_ready: false`. They contain
the original seed/version, exact accepted edit ledger, current domains and the
reconstructed native presentation/values. Choice responses identify the same
original version/ledger and exact relation page. A form read version is still
not a save proof. All three methods use the shared rollback-only callback and
132-table boundary; unexpected stored writes are rejected and rolled back.

The corrected **58 unique native cases pass with zero failures/errors/skips**:
13 new draft cases plus the prior 45 form/list/detail cases. All 110 Python
source hashes match the frozen package. All 132 guarded tables are preserved,
mandatory analytics/SMS remain enabled and installed metadata remains 49.
Independent committed SQL counts/full-row hashes match the pre-run baseline.
An independent checker verifies 76 native JSON responses, including 20 signed
draft loads, 18 ordered onchange results and one edited-form choice page. No
records are created by these APIs. Log SHA256:
`6a8cf2823e331fcf3fb235b8180b4b56f434e2abfd01d06187a36b5304a3b24e`.
The worker is terminal/removed, with readonly source, no HTTP or published ports.
Bootstrap warnings remain; this is not clean-install or installed-upgrade proof.

Earlier packages and logs are retained. The first
run is retained with 15 errors (including subtest errors), zero assertion
failures/skips and all guards/independent committed SQL unchanged. Native Python
date objects in the returned seed were not JSON serializable by the capture
boundary. Source now normalizes native responses with Odoo's JSON date serializer
before signing and tests the seed's browser-style JSON round trip. The two later
57-case runs retained two fixture errors, then one fixture assertion failure,
respectively. They flushed with all guards and independent SQL unchanged. The
fixtures now distinguish immutable identity rejection from field-access denial,
normalize the native Form helper's datetime/string representations, and switch
back to an outgoing type before editing its visible shipping policy. Native
hidden/readonly rules were not loosened. Source also checks custom native
name-search eligibility, rejects malformed selection containers cleanly, and
adds native cross-company intermediate-state/long-note comparisons. An executed
58-case run retained one fixture error, all guards and unchanged independent
SQL: the fixture selected a company-specific contact before selecting an
operation type, so the native company domain correctly excluded it. The final
fixture first selects that company's type, then follows the native transition;
no relation/domain rule is loosened. Three temporary
gateway stub checks pass and explicitly keep all five unfinished form/draft
methods blocked. No React/client/HTTP/browser acceptance is implied.

Existing-transfer onchange must preserve and review its native linked-move
writes rather than pass through this new-record-only path. Reviewed create/edit/
duplicate effects, actual-save comparison, exact durable recovery, child editors,
typed client/React UI, complete role/configuration and scale/concurrency checks
remain. The source-74 full regression is separate and does not accept this
source. No schema/dependency/permission grant, persistent addon upgrade,
frontend build/server, review reopening, tunnel or deployment is included.
The current ledger reconstructs the full native presentation and broad read
fingerprints repeatedly. Profile and reduce repeated work using the pinned
basis without weakening callback/guard checks before hospital-scale use.

## Candidate 75, native presentation and relation choices, 20 October 2026

The form reader now preserves separate conditional label nodes, each root
field's widget/options/help/placeholder/onchange attributes, and ancestor
conditions. It evaluates visible/readonly/required rules against native values,
including model/record/field write permissions. For example, the same Contact
field is labelled Receive From, Delivery Address or Contact according to the
native operation type. Hidden and readonly field occurrences cannot be used to
search a relation. Duplicate occurrences keep their own rules.

`stock.picking.qorlia_inventory_form_choices(transfer_id=False,
picking_type_id=False, node=0, search='', offset=0)` reads a relation search
from an exact root-layout node of a fresh, **unedited** native form. Identity
rules are the same as the reader. `node` is a zero-based layout index, not an
arbitrary field/model/domain supplied by the caller. The search is at most 200
characters; offset is an integer from zero to 100,000, not a Boolean. Each page
contains up to 25 native labels and a `has_more` flag. Native `name_search`
ordering, active-record context, ACLs, record rules and label field access remain.
The operation-type default context for a new form remains native; untrusted
caller defaults are discarded and field context cannot widen active companies.

The installed native web client's domain precedence matters. Both legacy
`web/static/src/legacy/js/views/basic/basic_model.js` (`_getDomain`) and the
native relation implementation choose a view domain before the model fallback.
These are **not intersected**. In this installation, Responsible's view domain
is `share = false`, replacing the field's default Stock User domain. Matching
that native search does not grant the selected user Stock permissions. Python
domain/context expressions come only from the installed merged view/field
metadata and are evaluated on the server, never from caller-provided source
or by a browser `eval`. Stored HTML notes remain data, not executable markup.
The modern native relation model also intersects any onchange-supplied domain
with that view/model choice. Future edit replay must retain those domains; the
unedited search reader is not evidence of that still-unimplemented workflow.

Both methods use the same rollback-only callback/guard boundary. Searches that
unexpectedly write guarded data fail and roll back. The response identifies the
exact transfer/type, node, field, offset and fresh `form_version`; that version
is still a **read version**, not save authorization or a pinned new-form seed.
The native name search does not offer offset, so the adapter fetches its bounded
prefix to preserve ordering. The allowed maximum is not scale acceptance.

The source gateway deliberately blocks both unfinished form methods. There is
no typed client, React form editor, edit replay/onchange, selected-value domain
validation, reviewed create/edit/duplicate, save or durable recovery yet. In
particular, searching an unedited form is not proof of search after changing its
operation type/contact/location. Native onchange can affect linked moves; it
must be rolled back and incorporated into the future complete effect review,
not replaced by a scalar write or omitted from save verification. Action widgets,
chatter, child editors and unsupported/custom modifier operators still need
their explicit adapters. Unsupported conditions fail closed.

Ten new native cases compare presentation and scalar rules with the installed
Form, all three direction labels, native relation ordering/pagination and domain
precedence, operation-type/company defaults, record/field access, malformed and
hidden/readonly searches, inherited context/ancestor conditions and unexpected
search writes/callback rollback. The corrected **45-case source-matched native
run passes, with zero failures/errors/skips**. All 108 Python hashes match the
frozen package, all 132 guarded tables remain, mandatory analytics/SMS stay
enabled, and installed metadata remains 49. Independent committed SQL counts
and full-row hashes match the pre-run baseline. A separate checker verifies 37
captured native JSON responses: five new forms, 26 existing forms and six choice
pages. This is not typed-client, React, HTTP or browser acceptance. Log SHA256:
`d2b7bd8f6985a3957f80fe376f203d57c6fe731ee70c1006201b1734168d1e0a`.
The worker is terminal/removed; its source was readonly without HTTP or
published ports. Bootstrap warnings remain, not clean-install/upgrade acceptance.
Python AST parsing passes for 108 files and three temporary gateway stub checks
pass. The older 35-case result below accepts source 74 only. The 1,029-case full
source-74 worker remains separate and does not accept source 75.

An earlier source package was retained before running, when inspection found
new-form relation searches also need the server-selected operation-type default
context. The first executed 45-case run then recorded zero assertion failures
and one fixture error: pending stock computations flushed as the public actor
while entering the test's exception savepoint, before the denial API ran. Its
132 guards and independent SQL remained unchanged. The corrected fixture flushes
setup under the authorized account before creating the public environment.
Product permissions are unchanged. Earlier packages and the failed log remain.

No schema, dependency, permission grant, installed addon upgrade, frontend build,
dev/review server, tunnel, public hosting or production deployment is included.
Billing review access remains closed.

## Candidate 74, 20 October 2026

This source adds the native form reader used to prepare transfer creation and
editing. It does **not** finish those workflows, add a React editor, authorize a
save or publish a new tester build. The protected review gateway deliberately
does not expose this method yet. Review remains closed.

The installed merged `stock.view_picking_form`, not just its upstream XML,
defines the form. This includes installed Bahmni overrides and the actor's field
groups. The read-only audit used a synthetic Stock User without Sales access,
all three native operation types and no HTTP/published ports. Its transaction
rolled back with all 132 existing guard tables unchanged. Independent inspection
found native `create` also passes through `bahmni_stock`; `write` and onchanges
retain native stock behavior. A plain picking write is not a substitute for the
eventual reviewed create/edit workflow.

### Native observations that affect the UI

- Reference is model-readonly. Do not invent an editable reference field or a
  frontend sequence generator.
- Operation type is editable only in Draft and may be hidden when the native
  action supplies a default type. Company is native-readonly in this installation.
- Source/destination defaults differ between receipt, delivery and internal
  types. Multi-location rights and operation direction control their display.
- Scheduling has native persisted-record requiredness and Done/Cancelled
  readonly rules. Keep UTC values separate from timezone display.
- Contact, shipping policy, responsibility, priority and notes have their own
  native rules. Notes are HTML data, not permission to execute or inject HTML.
- Owner and other group-restricted fields must come from the actor's merged
  view. An absent field is not permission to add it from an administrator's view.
- Demand rows, detailed operations, packages, chatter and header scalars are
  distinct native surfaces. Do not send an entire child graph through a scalar
  header editor or silently omit their future workflows.

### Source API

`stock.picking.qorlia_inventory_form_load(transfer_id=False, picking_type_id=False)`

- A positive transfer ID reads that transfer with complete native Inventory
  scope, linked-record and company checks. Do not supply a new default type for
  an existing transfer through this reader.
- Literal `False` requests a new form. An optional positive operation type must
  be readable, active, one of the native receipt/delivery/internal types and in
  the actor's active companies. Create ACLs are checked before opening a new form.
- `0`, `True`, `None`, strings, negative IDs and fractional IDs are not the
  new-form sentinel. Caller-supplied default contexts are discarded.
- Native default/onchange logic supplies the new values. Existing forms read
  current stored/computed values. Related labels require native model, field and
  record read access before anything is returned.

The response has `read_only: true`, exact transfer/type identity, a read version,
timezone, native field metadata, ordered root-field layout, scalar values,
permitted relation labels, native warning, collection names and unsupported field
names. Each layout node retains native modifiers, its label override and its
page/group placement. Duplicate field nodes remain distinct, because one
occurrence can have different conditions from another. Child fields are not
mistaken for root picking fields.

Collection records and binary content are not disclosed by this response. The
existing complete transfer detail readers remain responsible for stock rows.
The future editor must handle unsupported native surfaces explicitly, not render
an incomplete form and call it native parity. Native domain/context expressions
are metadata here; do not execute Python or evaluate them as JavaScript in a
browser. Reviewed relation-choice and onchange adapters still need implementation.

The version binds the current native view, field/rule metadata, values/labels,
complete transfer scope, actor, active companies, groups, locale, timezone and
132-table snapshot. It is a **read version, not a save proof**. New-form clock
defaults can legitimately differ on a fresh load. A future writer needs a pinned
native draft/default basis, ordered effects, actual-save comparison and durable
recovery; it must not simply trust a posted metadata/value object.

Reading isolates native transaction callbacks, flushes and checks the existing
132 guard tables inside a rollback-only savepoint. Unexpected changes to those
guarded tables are rejected; the savepoint rolls back transactional changes,
and the original callbacks/cache boundary is restored.
No new schema, permission grant, generic write route, dependency or replacement
stock engine is added.

### Verification and remaining gates

The ten new native cases cover three-type defaults against the installed Form,
existing draft/ready/done/cancelled values, exact merged layout and child
boundaries, group fields, changed header/view/context versions, malformed IDs,
hidden transfers/moves, root-field/related-label denial, rollback/callback safety
and non-stock rejection. They run with all nine existing Inventory list cases
and 16 detail cases: **35 unique cases pass, zero failures/errors/skips**. All
108 Python source hashes match the frozen package; all 132 guarded tables remain
with mandatory analytics/SMS. Independent committed SQL counts/full-row hashes
match the pre-run baseline. Installed metadata remains 49.

An independent checker verifies 17 captured native form responses (four new,
13 existing), exact mode/record identity, root layout/field correspondence,
relation-label identity and exclusion of child/binary values. This is native
JSON-contract evidence, not a typed-client, React, HTTP or browser replay.
Log SHA256:
`eb8157572bde60894d497f967e2b72ec3e56a697c5cfa912f8b53ebacd24a5cb`.
The worker is terminal/removed; source was readonly with no HTTP/published ports.
Bootstrap warnings remain, so this is not clean-install or upgrade acceptance.

The first package stopped at its pre-run unique-case assertion because a direct
test-class import made the loader discover a class twice. No cases were accepted
from it. Independent committed SQL still matched the baseline. The corrected
test imports the fixture module, preserving the 35-case/unique-ID assertion.
A second run completed 35 cases with four assertion failures, zero errors/skips
and all 132 guards preserved; independent committed SQL matched. Three subtest
assertions compared native datetime objects with serialized strings (and used a
clock patch that did not replace the field's bound default). The rollback test
attempted contact creation that the stock-only actor could not perform. The
corrected fixtures freeze the native field default, compare exact wire datetime
values, and attempt an actually permitted synthetic picking write so rollback
is tested rather than an unrelated ACL denial. They also cover no preselected
type and foreign-company type rejection. Product permissions/defaults are not
changed. Both earlier packages/logs are retained.

The frozen **1,029-case full-addon run passes** on its separate synthetic
database copy, with zero failures/errors/skips, 108 matching Python hashes,
132 preserved tables, mandatory analytics/SMS and unchanged installed metadata.
Independent committed SQL counts/full-row hashes match the original synthetic
database. Frozen-source client replay accepts 322 confirmation, 438 cancellation
and 328 return responses (1,088 total), using mocked transport; 17 native form
responses pass the JSON-only checker. Native log SHA256:
`9cceb3a1d122d7cb0fda26903077781a289361725b62332adedaa737379e441f`.
Frozen client SHA256:
`752cb9efae2d33d7460930631c52954b804936e09bdcf663be8bc2f0986cabda`.
The worker is terminal/removed, with readonly source and no HTTP/published ports.
This verifies source 74 only, not newer source, a clean installation, installed
upgrade or actual HTTP/browser/React/release acceptance. Bootstrap warnings remain.

Python AST parsing and three temporary gateway stub checks pass. The gateway
test explicitly verifies this unfinished form method is blocked. No frontend
code changed in this checkpoint; the prior Home result remains 1,613 cases/102
suites, not evidence of a form editor. Broader native configuration/role checks, typed client and
React integration, onchange/choices, create/edit/duplicate, stock demand and
orphan/completed-operation changes, remaining fields/actions/views, actual
HTTP/browser/layout/recovery/concurrency, scale and approved release remain.
Direction-specific label nodes, native help/widget/options behavior and action
controls also need explicit mapping before claiming a complete native editor.
