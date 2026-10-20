# Saved Inventory transfer: full native save review

[README](../../README.md) · [Billing](README.md) · [Saved onchange](STOCK_INVENTORY_EDIT.md) · [Inventory](STOCK_INVENTORY_WORKSPACE.md)

## Candidate 78 source in progress, 20 October 2026

This source previews the **actual native header write**, including native child
updates and preparation, inside a rollback-only transaction. It does not add a
persistent Save endpoint. Onchange inspection alone was not enough: a note-only
onchange has no stored effects, but saving that note updates the real picking.

`stock.picking.qorlia_inventory_edit_save_review(transfer_id, version, edits,
after=0, review_version=False, continuation_token=False, limit=50)` returns the
intended form/domains, changed header field names, resulting native state and
sequential complete effect pages. Its dedicated review signature and cursors
bind the database, account, original version, ordered edits and complete native
result. It does not reuse an onchange-effect token. Every response remains
`read_only: true`, `write_ready: false`, with no Save-completion proof or receipt.
The source gateway blocks this method as well as the nine earlier form methods.

## Native state and field handling

- Reconstruct the real saved origin and retain its active-company/record scope.
- Replay only the bounded scalar edit ledger using native onchange and domains.
- Use native ORM relation normalization to retain pending child values across
  subsequent link-only onchange responses. Both new and saved draft replay use
  this shared correction, so their regressions must be rerun too.
- Track assigned/onchange fields rather than writing the complete read DTO.
  Native merged-view readonly, force-save and required rules govern extraction.
- Extract derived child changes through native relation commands and child-view
  rules. Explicit root deletion remains deletion, not a silent unlink.
- Execute native `write` and final company validation, then inspect the actual
  resulting graph before rolling the transaction back.
- Capture native follower/subtype changes in the full private audit. They affect
  message access and must not be omitted just because they are not stock rows.
  Follower contents and identifiers are not returned, only signed private counts.
- Permit native nonterminal preparation outcomes rather than forcing every
  header save to remain Draft. Unchanged terminal notes are allowed; new terminal
  fulfillment, physical quantity, financial and configuration changes remain
  guarded. Existing preparation callers retain their earlier default behavior.

Required/readonly decisions include parent conditions, and new child rows have
explicit virtual identities during condition evaluation. Native fields, records
and write access are not replaced by elevated adapter permissions. Precommit,
postcommit, prerollback and postrollback queues stay isolated and restored.

Nested explicit deletions still need identity-aware reconciliation. They are
**rejected explicitly**, not dropped or changed into a different operation.
Non-default child view modes/contexts, complex custom widgets, recursive command
variants and wider configuration/role cases remain part of the unfinished goal.
Do not enable a writer while those native-fidelity gaps remain.

## Checks and current evidence

A third frozen **130-case native run is live**: 14 new save-preview cases and
all 116 prior Inventory/form/onchange/confirmation cases. Its outer guard covers
134 tables, adding native followers and their subtype relation. Legacy helpers
retain their default graph and permissions; the new save path explicitly opts
into the extended private audit. No passing native acceptance is claimed for
candidate 78. The old source-77 116-case proof does not accept these changes.

The first run completed all 130 cases with **six errors, zero assertion failures
or skips**. Five errors exposed a real serialization bug: using the ORM's SET
representation for a computed one-to-many field could make its inverse try to
remove existing moves. Native delete ACLs blocked it. Source now converts those
relations into native-style links/updates and explicit removals instead. No
delete permission was granted. One test helper failed before reaching the
intended denial because it searched only editable nodes on a denied form; it
now submits the actual readonly note occurrence to test the backend denial.
All 132 original guards and independent committed SQL counts/full-row hashes
were preserved. The failed source/log remain retained, not reclassified as a pass.

The second run completed all 130 cases with **five errors, zero assertion
failures or skips**. Its 134 guards and independent committed counts/full-row
hashes were preserved. Removing SET did not fix the cause: applying the native
onchange result through ORM business assignments recomputed related child fields
and emptied a collection before extraction. Replay now updates the temporary
form cache without triggering a second business-assignment cycle. The pending
child regression also checks a full clear/update response containing related
operation-type and location values. The third run must establish this correction;
neither failed run is acceptance, and no delete permission was granted.

The planned native comparisons use real `Form.save` for current supported
headers, contacts/dates, operation-type child changes, readonly/force-save output
and terminal notes. Other cases cover pending child state, explicit deletion,
required fields, denied writes, stale baselines, sequential complete effects,
malformed cursors and protected finance/physical stock. These are not browser or
whole-addon acceptance.

114 Python files parse and three temporary gateway checks pass. The source client
adds `getInventoryStoredSaveReview`; 108 focused form/edit/review cases pass,
including rejection of scope/version/field/page swaps, incomplete effects,
onchange-token/save-proof injection and session expiry. The complete Home
regression passes **1,721 cases/105 suites**, including the private follower-count
regression. Library/actual test-source types and scoped lint pass.
Matching-native client replay is pending;
these checks do not accept candidate 78's native behavior or any browser flow.

## Remaining before a usable Save flow

Finish native command/view parity, complete signed review and durable exact Save,
status/reference/stop recovery. Compare actual saved effects, preserve original
requests after unknown outcomes, and test denied/stale/company/concurrency cases.
Then connect the React editor with the shared Qorlia controls and independently
verify real HTTP/browser, storage, keyboard, narrow layout and recovery behavior.
Creation, duplication and remaining Inventory/Billing/module parity stay in scope.

No schema, dependency, permission grant, persistent addon upgrade, frontend
build/server, review reopening, tunnel, hosted tester or production deployment.
