# Native stock operation forms

## Candidate 53 scope

This checkpoint changes the backend form reader, not the large-operation save
protocol or the published tester. The local review gate stays closed.

The existing endpoints keep their request and response shapes:

| Endpoint on `stock.picking` | Purpose |
| --- | --- |
| `qorlia_operation_load` | Load one saved operation, or native defaults for one new operation on a saved move. |
| `qorlia_operation_onchange` | Replay ordered field edits with native onchange hooks, then roll back writes and transaction callbacks. |
| `qorlia_operation_choices` | Search permitted units, lots, locations, packages or owners using the native field domain. |

The form previously called `qorlia_transfer_load`, which assembled the entire
selected transfer. Its legacy 500-move/2,000-operation limit prevented even one
operation from loading. The new reader uses the same complete order-wide access
and snapshot checks as the paged transfer reader, then loads only the selected
move/operation's form. It does not request, return or sign a truncated graph.

## Reading the implementation

1. [Order deliveries](qorlia_billing_ui/models/order_deliveries.py):
   `_qorlia_delivery_transfer_scope` validates the transfer ID, checks the complete
   order scope, and verifies that the transfer belongs to that order. Existing
   full-transfer and paged-confirmation paths reuse this same selection check.
2. [Operation form](qorlia_billing_ui/models/stock_operation_form.py):
   `_qorlia_operation_source` verifies the selected move/operation relationship,
   preserves native defaults, context, visibility, readonly/group rules and
   labels, and builds an opaque form version. That version binds the complete
   linked-stock snapshot, inventory, packages, selected values and configuration.
3. The onchange path replays the edit history in order. Changing a cost and then
   manually overriding a selling price is not equivalent to reversing those
   edits. Native domains, units, lot expiry and warnings remain authoritative.
4. [Operation edit](qorlia_billing_ui/models/stock_operation_edit.py) still owns
   complete rollback review, save and exact-request receipts. Its legacy graph
   limits have not been removed. A compact form is not proof of complete review.

## Safety and remaining limits

- Hidden sibling records fail the whole form load. It never presents an apparently
  complete accessible subset while silently ignoring another stock record.
- Changes to sibling moves/operations, inventory, packages, permissions, actor,
  company or relevant configuration invalidate the old form version.
- Public users, staff without the native stock role, foreign moves, foreign
  operations and malformed identifiers remain rejected.
- An oversized transfer returns an explicit inspection-only reason with
  `write_ready: false` and `can_delete: false`. Native form rules and rollback-only
  onchange remain available for inspection, but save/delete review stays blocked.
- The existing 2,000-quant inventory limit remains fail-closed. Large inventory
  scope paging is separate work. Choice searches still use the documented native
  prefix/offset approach; this is not a high-volume catalog search redesign.
- The snapshot checks inspect the complete linked scope. Bounded response size
  does not imply constant-time work or accepted hospital-scale performance.
- No new endpoint, gateway allowance, dependency, database field or migration is
  introduced. Small-operation save/status shapes are unchanged. Older unsaved
  reviews must reload; accepted exact receipts retain their existing recovery path.

## Verification

The [native form tests](qorlia_billing_ui/tests/test_stock_operation_form.py)
include 501-move and 2,001-operation fixtures. They forbid the legacy full-graph
reader during load/onchange/choices, select an operation beyond the old limit,
check stale/hidden/foreign cases and assert that inspection does not save rows.
Large signed preview must still reject rather than accept partial effects.

### Verification checkpoint, 16 October 2026

- The initial implementation passes the full **770-case native addon suite**
  with zero failures, errors or skips. This run predates the final inspection-only
  flags and the strengthened per-inspection row comparison. Its result is not
  relabelled as a full-addon run of the final revision.
- The final revision passes **33 native operation-form cases**, including those
  last changes, with zero failures, errors or skips. Its logged Python source
  hashes match the repository source. The 2,001-operation inspection compares
  whole rows across 15 product/package/stock/order/financial tables, not just
  counts or quantities. Both native runs preserve original rows in all 25
  monitored tables after rollback, with mandatory analytics still enabled.
- Both runs use source-53 models on the isolated installed-49 synthetic database
  with `--no-http`. This is not a persistent installed-53 upgrade. Logs and
  run-specific source archives are retained in the operator's private evidence
  pack as `operation-form53-r1-20261016` and `operation-form53-r2-20261016`.
- Home passes **810 tests across 78 suites**. This includes the added component
  case that retains the native inspection reason and keeps save/removal review
  disabled after onchange. The focused client/editor group passes 25 cases.
  Library and actual-source/test types, scoped lint/format, Python parsing, diff
  checks and contributor-document links also pass.

The first component-test attempt used an exact removal-button name and failed on
the installed control's accessible `danger` prefix. The corrected accessible-name
query passes; no production control or accessibility behavior was changed.

No frontend build/browser, protected-gateway/native HTTP, installed upgrade or
tester deployment is claimed by this checkpoint. The temporary native test
containers are removed, no ports were published, and review access stays closed.
