# Global inventory transfer workspace

[README](../../README.md) · [Billing](README.md) · [Order transfer details](STOCK_TRANSFER_DETAILS.md) · [Cancellation](STOCK_CANCELLATION.md)

## Candidate 74 native transfer form reader, 20 October 2026

[The form contract](STOCK_INVENTORY_FORM.md) records the installed merged native
layout, header defaults, group/state rules and creation/editing boundaries.
Source adds one rollback-only form reader for new or existing transfers, not a
React editor or a save API. Its 35-case native suite passes with 108 matching
Python hashes, 132 preserved tables and unchanged independent committed SQL;
17 native JSON responses match the read contract, not client/React acceptance.
The source gateway blocks it until the full consumer/review path is ready.
No review reopening, build/server, persistent upgrade or deployment is included.

## Candidate 73 global returns, 20 October 2026

Inventory details and the signed-in recovery notice now open the existing
complete return workflow without a Sales order. All eight
`qorlia_return_paged_*` methods accept literal `order_id: false`: load, original
line pages, role-controlled destination search, ordered review, save, status,
saved references and pending-request stop. No dummy order, new return engine,
schema, dependency, privilege grant or alternative design system is added.
Legacy return APIs remain order-only. Positive-order request fields, canonical
order, purposes, signatures and recovery envelopes remain unchanged.

The installed native return form still supplies moves, base units, quantities,
destination domain, chained-move warning and quantity-update flags. The same
native wizard creates the actual linked return transfer. Creation does not
validate it, move physical stock, create a credit note or refund money.
Complete effect review, native rights/company scope, locks, callback rollback,
financial/configuration guards and comparison with actual saved effects remain.

The existing Qorlia dialog keeps exact schema-7 account/database recovery,
strict persistence before save, unknown/lost/expired outcome handling, identical
retry and explicit stop. Complete saved references and fresh status gate
retirement. Opening the real created transfer routes to Inventory when global,
or the order workspace when linked. The global notice pins its return target
through banner clearing; created-transfer navigation resets the detail scope.
Inventory lists/details are invalidated through the existing query cache.

Home passes **1,613 cases/102 suites**, including literal false across all eight
calls, malformed and mixed-scope rejection, unchanged strict legacy checks,
global complete creation/reference review, original unknown retry, durable
schema-7 recovery with 101 references, Inventory entry/refresh and navigation to
the actual return (including global recovery entered from Sales). Library and actual test-source types, scoped lint, 106 Python
AST parses and three gateway stub cases pass. Component, storage and transport
doubles are not actual browser/IndexedDB or hosted acceptance.

A corrected frozen **49-case native run passes, zero failures/errors/skips**: eight new global
cases plus all 41 existing native return-form, complete-review and complete-write
cases. It includes all three operation types without Sales access, native
defaults/destinations, exact recovery/stop, false-versus-lookalike identities,
stale/incomplete proofs, denied records/writes and creation followed by global
validation. All 106 Python hashes match; all 132 guards remain with mandatory
analytics/SMS, and independent committed SQL counts/full-row hashes match its
baseline and the original synthetic database. The matching frozen client accepts
**220 native responses**, including 65 global, across all eight return methods;
transport is mocked. Log SHA256:
`3c9e721f746cbac7b735fbde5090745821634639ae0e7343585fe82358801515`.
Client SHA256:
`752cb9efae2d33d7460930631c52954b804936e09bdcf663be8bc2f0986cabda`.
The worker is terminal/removed. Source was readonly, HTTP/published ports disabled
and installed metadata remained 49 on its separate synthetic database copy.
Bootstrap warnings remain; this is not clean-install, actual HTTP/browser,
installed-upgrade or release acceptance, nor acceptance of newer source 74.

The first run completed 49 cases with one failed role-fixture assertion, zero
errors/skips and all 132 guards preserved with mandatory analytics/SMS.
Independent committed SQL counts/full-row hashes also match the baseline. The
test removed the multi-location group directly, but native implied membership
still granted it, so location search was correctly allowed. The corrected
synthetic fixture follows the existing native test: remove the implied links,
remove membership, and assert the role is actually absent before testing denial.
No product permission, native group configuration outside the rolled-back test,
or expected denial is weakened. The original failed run/source remain retained.

The corrected cancellation rerun below passes 49 unique cases, with all 106
Python hashes matching, 132 guarded tables preserved and independent committed
SQL matching the baseline. Matching-client replay accepts 438 native responses,
including 225 global, across all six methods with transport mocked. This does
not accept the newer returns source. The older source-68 full
run is now independently verified: **974 unique cases, zero failures/errors/
skips**, 106 matching Python hashes and all 132 guarded tables preserved with
mandatory analytics/SMS. The matching frozen client accepts 322 native JSON
responses, including 96 global responses, across all six confirmation methods
with transport mocked. Independent committed SQL counts/full-row hashes match
the original baseline. Log SHA256:
`33d82e34c011ec1323e014564e5ded3b138c4f8a0211236045f0362025e13128`.
That proof does not accept candidates 69 to 73 or actual HTTP/browser behavior.

Remaining: native transfer create/edit/duplicate, orphan/completed-operation
corrections, remaining native fields/chains/packages, overview/type choices,
full filters/grouping/views, bulk/print and wider permissions/configuration.
Current full regression, actual HTTP/browser/layout/IndexedDB/multi-tab/
concurrency, representative scale and approved rollout remain separate gates.
Whole Billing and whole-product parity are not complete. Billing review stays
closed; no frontend build/server, persistent upgrade, hosted tester or production
deployment is included.

## Candidate 72 global cancellation, 19 October 2026

Inventory details now open the existing complete cancellation dialog for a
transfer without a Sales order. The same six `qorlia_cancellation_paged_*` APIs
accept literal `order_id: false`: load, ordered effect review, exact save/status,
saved-reference pages and pending-request stop. No order is invented or attached.
Positive order requests and the existing cancellation purpose/digests remain;
other legacy stock protocols are not made global. No new engine, raw action,
schema field, permission grant, dependency or separate design system is added.

The native engine remains responsible for reservation release, retained recorded
done quantities, sibling-aware downstream cancellation and permitted private
analytic deletion. Physical stock and protected financial/configuration guards,
native permissions, full review proofs, locking, callback rollback and actual-save
comparison remain. Cancelling an unfinished transfer is not physical receipt,
invoice cancellation or refund. Stopping a pending request only records its exact
stopped outcome and cannot reverse an accepted cancellation.

The shared Qorlia review dialog retains complete ordered effects, an explicitly
destructive save label, exact schema-8 account/database persistence and original
request recovery. Unknown/lost/expired outcomes remain recoverable; no new nonce
or automatic repeat is substituted. All saved references and fresh status gate
retirement. Inventory entry, existing transfer resume and the signed-in Billing
notice use actual transfer identity; the global notice pins cancellation kind
through a cleared-banner refetch. Existing Inventory refresh/focus paths remain.

Home passes **1,605 cases/102 suites**. Library and actual test-source types,
scoped lint, Python AST parsing of 106 files, three gateway stub cases and diff
checks pass. Coverage includes all six global client calls, false/lookalike and
response-scope rejection, complete destructive review/persistence, lost-save
remount/exact retry, full reference retirement, strict global storage/unknown
outcome preservation and direct Inventory/notice routing. Component/storage and
transport doubles are not browser/IndexedDB or hosted acceptance.

The first frozen **49-case native run completed with one test error**, zero
failures/skips and all 132 guards preserved with mandatory analytics/SMS.
Independent committed SQL counts/full-row hashes match the baseline. A negative
test correctly reached the existing native rejection that an unlinked transfer
does not belong to a Sales order, but expected `ValidationError` instead of
the native `UserError`. The corrected test asserts that exact rejection text;
product permissions, scope checks and errors are unchanged. The failed log and
immutable source are retained. The corrected rerun passes **49 unique native
cases, zero failures/errors/skips**, with all 106 source hashes matching and all
132 guarded tables preserved under mandatory analytics/SMS. Independent
committed SQL counts/full-row hashes match its baseline. The frozen client
accepts **438 native responses**, including 225 global, across all six methods
with transport mocked. Log SHA256:
`4dc94ecf81e55c87b9a6a648a8bf0a2ed37a7bdbfc20edadfce3b339fa2058ee`.
Client SHA256:
`250c41aac9d7edbb27330e7545d9479ad9151d58d0afe1939e41ea83a2e47b9f`.
Both workers are terminal/removed; readonly source, no HTTP/published ports and
installed metadata 49 were retained. Bootstrap warnings remain. This is not a
clean install, installed upgrade, actual HTTP/browser or release acceptance.
The older source-68 full result does not accept this source.

Remaining: global returns, native transfer create/edit/duplicate, orphan and
completed-operation corrections, remaining fields/chains/packages, overview/type
choices, full filters/grouping/views, bulk/print, wider permissions/configuration,
current full regression, actual HTTP/browser/layout/IndexedDB/multi-tab/
concurrency, representative scale and approved rollout. Whole-product parity is
not complete. Review stays closed; no build/server, installed upgrade, hosted
tester or production deployment is included.

## Candidate 71 global validation, 19 October 2026

Inventory details now open the existing complete transfer-validation workflow
without a Sales order. All seven `qorlia_validation_paged_*` methods use explicit
`order_id: false`: load, ordered prompt/effect review, save, status, saved-prompt
pages, saved-reference pages and stop. The existing native engine handles real
stock movement, valuation and configured accounting. No frontend quantity
formula, fake order, new validation engine or raw native action is introduced.

Only these complete APIs opt into global scope and literal false. Legacy
validation and individual-step APIs remain order-only. Positive order scopes,
canonical request fields/order, signatures and receipts remain unchanged. A
continuation must still match its saved prompt, author, companies, transfer,
purpose and order/global identity. Consumed/missing prompts are not recreated.
The full Inventory/configuration snapshot, native permissions, effect review,
ordered proof, locks, callbacks and actual-save comparison remain authoritative.

The same Qorlia dialog and design components render each native step. An accepted
preparation step stays saved even if a later expiry choice is declined. Exact
requests and their complete parent history use the existing account/database-
bound recovery envelopes. Stopping a pending child does not reverse its parent;
the saved parent prompt and references must be recovered explicitly. Fresh
status and complete saved pages gate continuation/retirement. Unknown or expired
outcomes retain the original request for exact retry, not a new validation.

Inventory entry and the signed-in Billing recovery notice both open the global
validation dialog directly. The notice pins kind/transfer through banner
refetch; finishing refreshes active Inventory lists/details as well as existing
order queries. Legacy readers cannot consume or clear a new global request.

### Candidate 71 verification

The Home suite passes **1,596 cases/102 suites**, including global/legacy API
identity boundaries across all seven calls, exact canonical request format,
strict persistence before save, lost-response/remount/retry, complete saved
reference review, stopped-child ancestry, direct recovery routing and Inventory
refresh. Component/storage/transport doubles are not actual browser/IndexedDB
acceptance. Library and actual test-source types, scoped lint, Python AST parsing
of all 106 files, three gateway stub cases, diff checks and the
42-document/746-link check pass. No new dependency or design system is added.

A corrected frozen **46 unique native cases pass, zero failures/errors/skips**: ten new global
validation cases, ten existing complete-review cases, 14 complete-write cases
and 12 legacy-step regressions. The new cases cover actual orderless receipt,
delivery and internal movement, batch/prices/references, saved immediate
preparation followed by expiry decline, native backorders, stopped child/parent
recovery, strict false identity, order/global proof separation, stale/incomplete
proofs, hidden moves, write denial and different-author rejection. All 106 Python
hashes match the frozen source. All 132 guarded tables remain unchanged with
mandatory analytics/SMS enabled; independent committed SQL counts/full-row hashes
match the baseline. The matching client accepts **383 native JSON responses**
across all seven methods, including 143 orderless responses; transport is mocked.
Log SHA256: `9bbcc5ae8a298ef6393b28d1b89ed1d0aecf610f31b33734c5cc0df2ff0e910d`.
Client SHA256: `07d956891cea0e1ff25eb5342db69114906794e54b6da7c4584dd2bfe4c9acf9`.
The readonly no-HTTP worker is terminal/removed, with no published ports and
unchanged installed metadata 49. Bootstrap warnings remain; this does not prove
a clean installation, installed upgrade, actual HTTP/browser or release.

The first native run completed 46 cases with one failed internal-transfer test
expectation, zero errors/skips and all 132 guarded tables unchanged. Independent
committed SQL counts/full-row hashes also match its baseline. The installed
native internal transfer correctly returned a Validate Stock Entries prompt,
not an immediate terminal movement. The corrected test explicitly reads and
confirms that saved prompt and checks stock stays unchanged until confirmation.
No native prompt or permission is bypassed; the original failed run is retained.

Remaining: global return/cancellation, native transfer create/edit/duplicate,
orphan operations and completed-operation corrections, remaining native fields,
chains/packages, overview/type choices, full filters/grouping/views, bulk/print,
the wider permission/configuration matrix and whole-product parity. Current full
regression, actual HTTP/browser/layout/IndexedDB/multi-tab/concurrency, scale and
approved rollout remain separate gates. The source-68 974-case worker is older
source, not validation-source acceptance. Review stays closed; no frontend build,
server, installed upgrade, hosted tester or production deployment is included.

## Candidate 70 global operation editing, 19 October 2026

Inventory move rows now open the existing detailed-operation editor for creation;
existing operation rows open the same editor for inspection, editing or removal.
The selection uses the real transfer, move and operation identifiers, with explicit
`order_id: false`. It neither invents an order nor requires a Sales role. The
global form keeps that requested identity even if the native transfer happens to
have a Sales link. Order/global versions and receipts cannot be interchanged.
Legacy operation methods still require their original positive order identity.

All eight existing `qorlia_operation_paged_*` methods are connected: load,
onchange, choices, ordered effect review, save, status, references and stop.
Native form defaults, visibility/readonly rules, units, batch/expiry, location,
package/owner and Bahmni pricing fields reuse the existing implementation.
Native onchanges and choice domains remain authoritative. Model, field, record,
company and related-record permissions, complete stock/configuration snapshots,
effect proofs, locks and actual-save comparison remain in force. This is native
operation recording, not physical transfer validation or a payment.

The existing Qorlia form, effect review, dialog, tables and design tokens are
reused. Full ordered review and exact schema-8 persistence precede save. The
Billing notice opens an original global operation request directly in recovery,
without loading a fresh form or routing to Sales. The target stays pinned while
the recovery banner refetches. Finishing requires every saved-reference page and
fresh status before clearing the exact request. Lost saves/session expiry retain
the request for exact retry, not a new operation. Inventory list/details refresh
when the workflow closes. No dependency, schema field, raw-action gateway route,
permission grant, custom `sudo` or second operation engine is added.

### Candidate 70 verification

Home passes **1,589 cases/102 suites**. Library and actual test-source types,
scoped lint, three gateway stub cases and the 42-document/744-link check pass.
Coverage includes all eight client calls, strict global/legacy identities,
create/edit/delete review and persistence, lost-save/session recovery, complete
saved-reference review, original-target routing, unavailable moves and refresh.
Component tests use SDK/storage doubles; this is not real IndexedDB or browser
acceptance. No additional React library or separate design system was introduced.

The corrected **85 unique native cases pass, zero failures/errors/skips**:
ten global operation cases, all 56 existing operation-form cases, 11 global
confirmation cases and eight preparation cases. All 106 Python hashes match
the frozen source. All 132 guarded tables remain unchanged with mandatory
analytics/SMS enabled; independent committed SQL counts/full-row hashes match
the baseline. The matching actual client accepts **407 native JSON responses**
across all eight methods, including 121 orderless responses. Replay transport
is mocked, not HTTP/browser acceptance. Log SHA256:
`cb67b9b13b13ca86513d0bec3530da900b97bc5b0ec2884e6cd5f219ff3e219f`.
Client SHA256:
`b44d14a6290f18f1462c60537bc8a9124078c0fed752d6515a6aef82d822414c`.
The worker is terminal/removed, with readonly source, no HTTP/published ports
and unchanged installed metadata 49. Bootstrap warnings remain, not clean-install
or installed-upgrade proof. The separate source-68 full regression cannot
verify this newer source.

The first native run
completed 85 cases with two fixture errors, zero assertion failures
or skips, and all 132 guarded tables preserved. Independent post-worker committed
SQL counts/full-row hashes match its baseline. Its internal-transfer fixture used
an inactive native output location; the corrected fixture creates a synthetic
active internal destination instead of weakening the domain. The hidden-move
test now supplies the captured real identifier rather than reading it through
the rule that intentionally hides it. The failed run remains failed evidence.

Remaining: orphaned operations without moves and completed/cancelled-operation
corrections are not editable through this form. Global validation, returns and
cancellation, native transfer create/edit/duplicate, remaining fields, chains,
packages, overview/type choices, full filters/grouping/alternate views, bulk/print
and the broader role/configuration matrix remain. Source-matched full regression,
actual HTTP/browser/layout/IndexedDB/multi-tab/concurrency, representative scale
and approved rollout are separate gates. Review stays closed; no frontend build,
server, installed upgrade, hosted tester or production deployment is included.

## Candidate 69 global preparation, 19 October 2026

Inventory details now open the same complete preparation dialog for all four
native actions: check availability, unreserve, set recorded quantities from
reservations and clear matching recorded quantities. The six existing
`qorlia_reservation_paged_*` APIs accept explicit `order_id: false`, with the
complete Inventory scope, native availability/permissions, inventory/configuration
stamp, rollback effect review, exact proofs, locks and actual-effect comparison.
Positive order scopes/digests and legacy preparation stay unchanged. Other
global write protocols are not silently enabled. No fake order, new engine,
raw action route, module schema field, role grant or custom `sudo` is introduced.

The typed client accepts false only for complete confirmation/preparation.
Exact requests remain in the existing schema-8 account/database-bound slot.
The recovery banner pins both workflow kind and transfer target, including while
a cleared banner refetches, and opens preparation directly rather than an order
or confirmation dialog. The existing finish path refreshes active Inventory
views. Stock preparation is not validation, delivery, an invoice or payment.

Native tracked receipts without prepared batch operations may accept Set
quantities while leaving recorded done at zero. The inspected installed native
`action_set_quantities_to_reservation` only fills eligible existing operations;
Qorlia must not invent a quantity or create an undocumented receipt operation.
The first native run exposed an incorrect five-unit expectation in the new test,
not a reason to replace native behaviour. The corrected test compares the direct
native action with the adapter. True internal-location destinations are now used
in the shared unlinked confirmation/preparation fixture.

Source checks pass **1,574 Home cases/102 suites**, source/test and library
types, scoped lint and three gateway stub cases. Coverage includes all four
orderless actions across all six client APIs, explicit false/lookalike rejection,
exact storage, no-resave recovery, Inventory entry/refresh and workflow routing.
The first 57-case native run finished with one failed receipt-fixture expectation,
zero errors/skips and all 132 guarded tables preserved. Independent post-worker
committed SQL counts/full-row hashes also match its baseline. This failed run
is retained. The corrected **57 unique native cases pass, zero failures/errors/skips**,
including eight global preparation cases, 11 global confirmation regressions
and all 38 existing preparation cases. All 106 Python hashes match the frozen
source; all 132 guarded tables remain unchanged with mandatory analytics/SMS
enabled. Independent post-worker committed SQL counts/full-row hashes match
the baseline. The matching actual client accepts 309 captured native responses
across all six APIs, including 135 orderless responses; transport is mocked.
Log SHA256: `fb188a8ce8b8cbec20eee6aa963e34c997eca734e9a380d45de20520148e23ad`.
Client SHA256: `3951b6028a1c11240c4d75a33c4b6d40c51d91cc3bd090fd930e944503bcc71f`.
The readonly worker is terminal, with no HTTP/published ports and unchanged
installed metadata 49. Bootstrap warnings remain, not clean-install proof.
The candidate-68 974-case full worker is older-source evidence, not acceptance of
this increment. Actual HTTP/browser/layout/IndexedDB/multi-tab/concurrency,
scale and rollout remain separate gates. Review stays closed; no build/server,
installed upgrade, hosted tester or production deployment.

Next: global operation editing and validation, then returns/cancellation,
create/edit and the remaining native form fields, views, filters, grouping,
bulk/print, permission/configuration matrix and whole-product parity.

## Candidate 68 global confirmation, 19 October 2026

Inventory details now open the existing complete confirmation dialog, with
`order_id: false` for a global transfer. This explicit identity is not zero, an
omitted field or an invented Sales order. The same six
`qorlia_confirmation_paged_*` APIs handle load, ordered effect review, exact
save/status, pinned generated-reference pages and stopping an unsent request.
Positive order identities retain their existing scope and request digests.
Legacy confirmation and other stock workflows still require real orders.

The shared native scope helper opts into the complete Inventory read scope only
for this confirmation path. The read version does not become a write proof:
confirmation still adds the full inventory/configuration/financial stamp,
package graph, rollback-native effect preview, ordered proof, locks, caller
permissions and actual-effect comparison. Confirmation may reserve stock or
create native dependencies; it does not validate physical delivery. No new
confirmation engine, raw action route, schema field, `sudo` or role grant is added.

The client represents orderless identity only in paged confirmation types.
Other workflow checks reject it. Exact global requests use the same schema-8
account/database-bound durable slot; old clients cannot recover this new identity
and must not clear or rewrite it. The Billing recovery banner opens confirmation
directly, never an order page. Its target stays pinned during a cleared-banner
refetch so the dialog can finish its acknowledgement and close normally.
Existing order workspaces can also resume the exact global confirmation.
Finishing refreshes active Inventory lists/details, while modal-state queries
remain invalidated without an automatic stock retry. Closing is not undo.

Source checks pass 1,561 Home cases/102 suites, including global identity
boundaries, all six client calls, exact storage, no-resave recovery, Inventory
entry/reload and recovery target stability. Types, scoped lint and gateway stub
checks are separate from native and real-browser acceptance. The first 81-case
native run had nine fixture errors (Odoo's exception helper and a missing native
procurement-group link), zero assertion failures and all 132 tables preserved;
its independent committed SQL also agrees. It remains a failed run.

The corrected source passes **81 unique native cases, zero failures/errors/skips**:
11 global confirmation cases, all 45 existing confirmation preview cases and
25 global read cases. These include orderless receipts/deliveries/internal
transfers with Stock User but no Sales role, actual reservation/batch references,
exact duplicate-save/status/stop recovery, strict false identity, same-author
order/global proof swaps, stale inventory/configuration, hidden rows/fields,
write denial, foreign companies and different-author receipt rejection. All
106 Python hashes match the immutable package. All 132 guarded tables remain
unchanged with mandatory analytics/SMS enabled; independent post-worker committed
SQL counts/full-row hashes match the baseline.

The matching actual client accepts **276 captured native JSON responses** across
all six confirmation methods, including 96 orderless frames. Replay transport
is mocked, not HTTP/browser proof. Log SHA256:
`aaf221a9b5b9d6496bce4beae304613f77d5636c33d9840bf8f2087e085b14f5`.
Client SHA256:
`6319e4292211f848bc38a86f1a2ee60ff096e80520b8dfeeb998445c1c0ef312`.
Source/test and library types, scoped lint, three gateway stub cases and
42-document/740-link checks pass. The worker is terminal/removed; it used
readonly source, no HTTP/published ports and unchanged installed metadata 49.
Bootstrap warnings remain. This is not clean-install or installed-upgrade proof.

The **974-case full-addon worker completed**, zero failures/errors/skips, on
its separate synthetic copy using immutable candidate-68 source. All 106 Python
hashes match; all 132 guards remain with mandatory analytics/SMS. The frozen
client accepts 322 native responses across all six methods, 96 global, with
transport mocked. Independent repeatable-read committed SQL counts/full-row
hashes match the original baseline (snapshot SHA256
`f9d44c1e2f42b39c08ae1c6d639f5ac88392a22592cb609e1adcbb1096765a32`).
Full-run log SHA256:
`33d82e34c011ec1323e014564e5ded3b138c4f8a0211236045f0362025e13128`.
The worker is terminal/removed. This does not accept subsequent source or actual
HTTP/browser/release behavior. The 938-case candidate-65 proof is older evidence.

Still required: global reservation/preparation, operation editing, validation,
returns/cancellation and their durable UI/recovery; native create/edit, remaining
fields, chains/packages, overview/type choices, full filters/grouping/views,
bulk/print and the wider role/configuration matrix. Actual HTTP/browser/layout,
IndexedDB/multi-tab/concurrency, scale, current full regression and rollout remain
separate gates. Review stays closed; no build/server, installed upgrade or deployment.

## Candidate 67 global details, 19 October 2026

The signed-in list now opens the selected native transfer directly, without a
sales-order identifier. [InventoryTransferDetails](../../apps/home/src/components/Billing/InventoryTransferDetails.tsx)
loads its header/snapshot before requesting move and operation pages in parallel.
Both must match the header, timezone, version and actual cursor position. A
rejected or mismatched page hides both tables and cached identifiers; reload
starts a fresh scope, not a stock mutation. Native cursors are retained for back
navigation, including gaps in IDs. Keyboard paging restores focus when Next
becomes disabled, and returning to the list restores the transfer opener.

### Two additional fixed read APIs

- `stock.picking.qorlia_inventory_transfer_load(transfer_id)` returns only
  `read_only`, `transfer` (header plus move/operation counts), `version` and
  `timezone`.
- `stock.picking.qorlia_inventory_transfer_detail_page(transfer_id, section,
  after=0, version=False, limit=50)` adds `section`, `after`, `position`,
  `total_count`, `next_after` and `rows`. Sections are `moves` or `operations`,
  limits are 1 to 100, and later cursors require the original version and a real
  row belonging to that transfer section. The UI uses pages of 50.

The [native implementation](qorlia_billing_ui/models/stock_inventory.py) checks
Stock User/Manager, model/field/record rights and the active transfer company.
It checks every linked move, operation and batch in fixed ID batches before
returning a detail page, with no legacy 500-move/2,000-operation truncation.
Hidden linked rows or labels reject the complete detail scope; this is not the
same as record-rule filtering in a global browse list. Cross-transfer operation
links reject rather than being repaired or silently included.

The read version binds selected rows, rendered dependencies/labels, author,
active companies, groups, language/timezone and access configuration. Unrelated
transfer edits do not invalidate it. It is a read snapshot, **not a save/recovery
proof**: downstream chains, full inventory/configuration and actual native write
effects still require their own purpose-bound complete reviews. No fake order,
`sudo`, permission grant, generic query or caller-context bypass is introduced.
Complete scope checks remain linear and retain complete recordsets; bounded
response pages do not prove bounded total ORM cache, CPU or hospital latency.

Global moves omit Sales line data entirely, including when the Stock User lacks
Sales access. Existing order-linked projections retain their default `order_line`
field. [Shared tables](../../apps/home/src/components/Billing/StockTransferTables.tsx)
now render both workspaces with the same design-system/layout/focus conventions.
Only the existing order workspace supplies reviewed action callbacks. Global
details have no edit/save/cancel/validate controls. Quantities retain native
units; recorded done is not proof of physical movement. Header dates use the
labelled account timezone; batch expiry remains explicitly labelled UTC.

### Candidate 67 verification

- Home passes **1,553 cases/102 suites**: 14 new detail-client cases (including
  both sections' invalid-payload contexts), 11 detail-component cases and the
  new list/open/return focus case. Existing order-detail navigation/action tests
  still pass after shared-table extraction. Source/test and library types,
  scoped lint and three gateway stub cases pass. Basic axe/focus checks are DOM
  evidence, not actual browser/layout acceptance.
- **50 unique native cases pass, zero failures/errors/skips**: nine inventory
  browse cases, 16 global-detail cases and 25 existing order-reader cases. They
  include complete 501-move/2,001-operation reads, stock-only access without Sales,
  empty transfers, hidden tail moves/operations/lot/owner/product, field denial,
  cross-transfer links, stale quantities/batch/labels, author/timezone/policy
  binding, active/inactive companies and unchanged unrelated transfer scope.
- All **106 Python hashes** match the immutable package. All **132 guarded
  tables** remain unchanged, with mandatory analytics/SMS enabled. Independent
  post-worker committed SQL counts/full-row hashes match the pre-worker baseline.
- The matching actual client accepts **72 captured native JSON responses across
  all three inventory APIs**, replay transport mocked. Log SHA256:
  `02b97f7aa25b62084f1205086f1afa42e13fcaffa6fc7388b63ef544fe04e486`.
  Client SHA256:
  `95afa8f0c1db1c3c0639c75708ad66281346b9fb616fb8da1aeefea8707669fe`.
- Native workers use readonly source, `--no-http`, no published ports and
  unchanged installed metadata 49. Bootstrap warnings remain recorded; this
  is not a clean install, installed upgrade or HTTP/browser/release acceptance.

Still required: global reviewed confirmation/reservation/operation editing/
validation/return/cancellation and exact durable recovery; native create/edit,
remaining form fields, chains/packages, type choices/overview, full filtering,
grouping, alternate views, bulk/print and the wider permission/configuration
matrix. Source-matched full regression, actual transport/browser/layout,
IndexedDB/multi-tab/concurrency, scale and approved rollout remain separate.
The earlier 928-case source-64 proof and still-running 938-case source-65 worker
do not include this source. Review remains closed; no build/server/deployment.

## Candidate 66 browse checkpoint, 19 October 2026

The signed-in Billing workspace now has an **Inventory transfers** tab in source.
It reads receipts, deliveries and internal transfers without requiring a charge
order, including native empty transfers. This is the first global inventory read
flow, not completion of Inventory or permission to reopen review access. No
frontend build/server, actual HTTP/browser review, installed upgrade, hosted
tester or production deployment is included.

## Native contract and request path

The inspected native `stock.all_picking` menu opens
`stock.action_picking_tree_all` on `stock.picking` without a sales-order domain.
Stock User/Stock Manager can access it. Native search uses transfer name/origin;
Waiting includes both `confirmed` and `waiting`. Native Inventory also has an
operation-type overview, more filters, grouping and other views, not silently
equated to the smaller list now implemented.

1. [BillingPage](../../apps/home/src/components/Billing/BillingPage.tsx) mounts
   [InventoryTransfersPanel](../../apps/home/src/components/Billing/InventoryTransfersPanel.tsx)
   only after Billing sign-in and selection of the fifth Billing tab.
2. [The typed client](../../apps/home/src/components/Billing/billingService.ts)
   calls `getInventoryTransfers(search, operation, state, offset)`.
3. The [protected gateway](../../scripts/review-host/server.cjs) permits only
   `/web/dataset/call_kw/stock.picking/qorlia_inventory_transfers` for this flow.
   Review, clinical/native sessions, exact model/method, empty args and no caller
   context remain required. Raw stock search/write/cancel/validate routes stay
   closed. Gateway tests use temporary stubs, not a reopened review service.
4. [The native reader](qorlia_billing_ui/models/stock_inventory.py) uses ORM
   search, record rules, model/field rights, active companies and native ordering.
   No `sudo`, order link, stock adjustment or caller-supplied domain is used.

The four keyword arguments are `search` (trimmed, at most 160 characters, native
name/origin `ilike`), `operation` (`all`, `incoming`, `outgoing`, `internal`),
`state` (`all`, `draft`, `waiting`, `assigned`, `done`, `cancel`) and `offset`
(nonnegative bounded integer). Pages contain at most 25 rows. Waiting is a native
combined filter, not a new state written to a transfer.

The response contains `read_only`, echoed `filters`, `offset`, `next_offset`,
`total_count`, `timezone` and `rows`. Headers reuse the permission-checked native
reference, actual state, operation type, contact, locations, scheduled/completed
dates, origin, company and backorder projection. Native UTC date values are
formatted in the supplied account/context timezone, which the UI labels.

Global browse follows native record-rule filtering: hidden transfers are absent
from rows and counts. Complete linked-order/effect reviews must instead reject
hidden dependencies rather than silently omit them. Unreadable referenced labels
still reject without disclosing names. Denied/expired refreshes hide stale rows
and offer retry/reconnection, not a successful empty-list message. Account and
filters are in the query key. Paging is current inventory, not a signed write
review or a stable multi-page snapshot.

## Design and verification

The panel reuses existing design-system inputs/buttons, Billing layout tokens,
state labels and focusable horizontally scrollable tables. No dependency/global
style was added. Status filters are labelled form controls, not row actions.
Search, clear, refresh and pagination do not change stock.

- Home passes **1,527 cases/100 suites**, including 14 inventory-client cases,
  six panel cases and two new sign-in/tab cases. Source/test and library types
  and scoped lint pass. Basic axe checks pass; browser layout/keyboard acceptance
  remains separate.
- **Nine unique native cases pass, zero failures/errors/skips**: real menu and
  stock-only access without Sales privileges; three unlinked operation types and
  read-only preservation; 56-row native ordering/paging; reference/origin search;
  actual confirmed/waiting moves; hidden-row counts; nonstock/portal rejection;
  invalid filters; and active-company scope for an actor authorised for both.
- All **106 Python hashes** match the immutable native package. All **132 guarded
  tables** are preserved after rollback, with mandatory analytics/SMS enabled.
  Independent post-worker committed SQL counts/full-row hashes match the
  pre-worker baseline for all 132 tables.
- The matching actual client accepts **15 captured native JSON responses**;
  replay transport is mocked. Log SHA256:
  `1c517940b1e61861cf9f407820b0c6a6b4ff85bc0ea8ae58126a4961de020bd0`.
  Client SHA256:
  `88fd8022f85dc979ac6fcf3aa9cf8b717e7f0ca4abddb064c7bc9099b362b6bf`.
- Native workers use readonly source, `--no-http`, no published ports and
  unchanged installed metadata 49. Recorded pandas-bootstrap/wkhtmltopdf warnings
  remain; this is not a clean-install result.

The [928-case candidate-64 regression](STOCK_CANCELLATION.md#candidate-64-full-regression-completed-19-october-2026)
is separate earlier-source evidence. The candidate-65 938-case full regression
is running on its own immutable package/database copy, without this candidate-66
reader. Do not sum overlapping suites or call either current whole-product or
runtime/browser acceptance.

## Remaining work at candidate 66

- Global transfer detail/move/operation pages and actual operation-type choices.
- Order-independent confirmation, reservation, operation editing, validation,
  returns and cancellation, with exact purpose/company/author/transfer-bound
  review and durable recovery. Existing order-scoped protocols remain unchanged:
  never invent an order ID, attach an unrelated order or use a context bypass.
- Native create/edit/duplicate, receipts/purchases, picking-type overview,
  packages/lots, product/partner/type and personal/date/late/backorder/activity
  filters, grouping, alternate views, printing and bulk actions.
- Matching full regression, broader field/related-record/role/configuration
  matrix, actual transport/browser/IndexedDB/reload/concurrency, representative
  scale, accessibility/layout and approved rollout.

This read increment does not redefine Inventory completion. Billing-first and
whole-system one-to-one parity remain the objective. Review stays closed.
