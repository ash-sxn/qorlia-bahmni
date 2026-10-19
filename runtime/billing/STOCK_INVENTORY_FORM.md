# Native Inventory transfer form contract

[README](../../README.md) · [Billing](README.md) · [Inventory workspace](STOCK_INVENTORY_WORKSPACE.md)

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
132 guard tables inside a rollback-only savepoint. Unexpected stored writes are
rejected and rolled back, and the original callbacks/cache boundary is restored.
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

Python AST parsing and three temporary gateway stub checks pass. The gateway
test explicitly verifies this unfinished form method is blocked. No frontend
code changed in this checkpoint; the prior Home result remains 1,613 cases/102
suites, not evidence of a form editor. Broader native configuration/role checks, typed client and
React integration, onchange/choices, create/edit/duplicate, stock demand and
orphan/completed-operation changes, remaining fields/actions/views, actual
HTTP/browser/layout/recovery/concurrency, scale and approved release remain.
