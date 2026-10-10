# Qorlia React frontend backend readiness

## Native bank-matching contract checkpoint (10 October 2026)

Twenty-four installed-source tests pin Odoo's bank engine before reviewed writes
are exposed. They cover inbound/outbound receivable/payable matching, explicit
partial allocations, repeated matches, net refunds, deposits from multiple payers,
transaction/journal/third currencies, native exchange differences, four native
fee rules and a company-currency tax-exclusive fee. Original statement and
liquidity amounts remain intact when business-model synchronization is suppressed
by the server-owned bank context. Native balance and fiscal-lock checks stay active.

Undo tests establish that native undo removes all matches, restores residuals and
original foreign amounts, and deletes statement-generated payments while retaining
unrelated payments. Native exchange effects can be attached to partial rather than
only full reconciliations. Reviewed undo must disclose these complete effects.
Savepoint tests verify rolled-back matching/undo, not a public preview API or a
complete callback-isolated simulation implementation.

All 383 installed native adapter tests pass with zero failures/errors/skips.
Installed hashes match the three touched test files. The older invoice correction
test now mocks only lock-date fixture setup because an unrelated staged unmatched
bank entry prevents arranging that fixture; its actual native reset rejection is
still tested outside the mock. Staging restarted and mandatory analytic policy was
independently confirmed restored. Subsequent authenticated native reads retain
entry #37, its ledger/matching state, protected records and financial/stock/mail/
statement counts. Existing upstream/report warnings remain.

This is test-only progress. No new bank write API, matching/undo UI or frontend
build/browser acceptance is delivered by this checkpoint. Protected artifact
`bank-read-20261010`, its source archive, gates and expiry remain unchanged.
Foreign/included/cash-basis tax and mandatory analytic cases need further acceptance.
Complete graph/configuration locks, reviewed save/undo, exact-request recovery,
permissions/concurrency testing and browser save/read-back remain required, as do
statement creation/import/checkpoints, provider payments and wider product parity.
Production and the shared public demo are unchanged. Earlier checkpoints below
are historical, not current completion claims.

## Native bank-statement read workspace checkpoint (10 October 2026)

Signed-in Billing exposes bank/cash history, a complete native ledger and possible
matching items through three scoped read APIs. History/candidates page by 25;
ledger pages by 100 with an author/company/source-version-bound positive-ID cursor.
Full totals are calculated over every journal item after native ACL/rule checks,
not over a permission-filtered One2many. Missing/inaccessible rows fail closed.
Journal, foreign and company-currency monetary values are labelled separately.
Candidates use the installed native matching domain, not a Qorlia ranking engine.

The installed suite passes 359 tests with zero failures/errors/skips. New tests
cover read-only accounting access, hidden entries/ledger rows, inactive companies,
invalid inputs, native currency values, 26-item pagination, complete 102-row totals
and stale versions/cursors. Mandatory analytics was independently confirmed restored.
Home passes 396 tests/47 suites; types, touched-file lint, seven gateway/config
checks and direct development webpack pass. Existing upstream/build warnings and
Nx graph limitations remain. These checks do not establish whole-product acceptance.

Protected artifact `bank-read-20261010` passes access checks, with matching hashes
for all 83 JS/CSS chunks and packaged source/license archive. Its three bank reads
require the existing hospital session; raw create/write/unlink/reconciliation/undo
are blocked. Tester/Billing gates and expiry are unchanged. The archive includes
pre-existing clinical working-tree edits and precedes these final evidence notes.

Actual protected-browser bank search/state filtering, ledger viewing and candidate
search/pagination pass for synthetic entry #37 (INR 123.45). Independent HTTP/native
reads agree on the two liquidity/suspense rows, debit/credit totals and candidate
residuals. A subsequent independent read confirms unchanged financial/matching
state, protected records and financial/stock/mail/statement counts after the browser
reads. Only the explicitly labelled isolated synthetic fixture was created.

Full match/reconciliation writes, partial allocations, fees/write-offs, exact-request
recovery and safe undo are not yet implemented here and remain required. The native
undo method can delete generated payments, so it must not be exposed as a generic
harmless reversal. Bank operations and the wider Billing/clinical/external-module
goal remain incomplete. Production/public demo are unchanged. Older checkpoints
below are historical.

## Batch invoice PDF implementation checkpoint (10 October 2026)

Invoice-page selection and a native batch-report modal now generate one combined
PDF for up to 25 selected customer invoices/credit notes, with the shared 10 MB
download limit. Two named APIs validate distinct IDs, check every document's
native access rules, lock in stable order and reject unsaved/unbalanced adjustments
before calling Odoo's installed renderer. No posting/payment or caller-selected
template/context is introduced. The native report may archive posted PDFs.

All 347 installed native tests pass with zero failures/errors/skips. Home passes
381 tests/45 suites; types, touched-file lint, seven gateway/config checks and
direct development webpack pass. Installed hashes match. An actual HTTP download
produced a visually inspected two-page draft invoice/credit-note PDF, preserving
native ledger, totals, states, reconciliation and protected-record/count snapshots.
Selection resets on search/page/session/result changes; download is explicit.

Protected artifact `invoice-batch-20261010` passes access checks; all 83 JS/CSS
chunks and source/license archive match the packaged build. The browser downloaded
a visually inspected two-page PDF for a synthetic draft invoice and posted credit
note. Independent native reads retain their financial/ledger/reconciliation state,
protected records and financial/stock/mail counts. Existing gates and expiry are
unchanged. Published source includes pre-existing clinical working-tree edits and
predates final evidence notes, rather than being a clean commit-only release.
Larger/asynchronous batches, alternative hospital headers, archive
and mixed-currency configurations, and wider Billing/product parity remain open.
Production/public demo are unchanged. Older checkpoints below are historical.

## Reviewed monetary journal editor checkpoint (10 October 2026)

The React editor now uses native reviewed money APIs, including complete ledger
review, named choices and native analytic plans for saved/new rows. Draft removal
has undo. Pending save requests are stored before submission and recovered only
with the same reviewed payload; uncertain outcomes remain locked until resolved.
Storage failures do not silently discard the request or allow a new save.

All 341 installed native adapter tests pass with zero failures/errors/skips.
Home passes 374 tests in 45 suites; types, touched-file lint, seven gateway/config
tests and direct development webpack pass. The protected tester build saved a
synthetic draft monetary edit, then independently verified the entire native
review/saved ledger, balanced totals, unchanged unit price, one new receipt and
idempotent exact retry. The stale invoice-card snapshot found during browser QA
is fixed: returning from the journal clears the old card and reopening shows
the fresh native total. Protected records and financial/stock/mail counts remain
unchanged. Native mandatory analytics was restored and isolated Billing restarted.

Actual protected-browser draft add/remove and accepted-response-loss recovery
now pass. Native row defaults recalculated the fixture from 650 to 500; the full
review exposed that change before save. Independent native reads match the review,
with exactly one receipt for each change and idempotent retry after deletion.
The existing tester/hospital/Billing gates and expiry are unchanged. Full reload
while pending, multi-currency/tax, permissions/configuration and concurrency
acceptance remains; this scoped evidence is not proof of that full
browser matrix. This checkpoint does not complete monetary, wider Billing or
clinical/external-module parity. Production and the public demo are unchanged.
Existing upstream/report, Browserslist, bundle and Nx graph limitations remain.
Earlier checkpoints below are historical.

## Reviewed monetary journal API checkpoint (10 October 2026)

Five named native APIs now load, search, review, save and recover journal money
changes in isolated Billing. Strict field/row scopes, native ACLs/rules, source
and configuration locks and author-bound exact-request receipts remain enforced.
Review uses actual native writes inside rollback, not browser accounting or
misleading onchange totals. Ledger changes and their receipt use one native write:
tests caught that a second metadata write could recalculate and change the amount.
Unreviewed native outcomes and response-read failures roll back the entire save.

All 339 installed native tests pass with zero failures/errors/skips, including
13 new API tests. Home passes 359 tests in 44 suites, including eight client
contract tests. Type checking, touched-file lint, seven gateway/build-config
tests and direct development webpack build pass. Installed model, tests, init and
manifest hashes match. Existing upstream/report, Browserslist, development bundle
and normal Nx task-graph limitations remain. Independent native reads and exact
Cut-Off retry retain the protected records, original entries/receipt, balances,
matching and financial/stock/mail counts; staging is running again.

The client contract and source gateway allowlist are implemented, but a monetary
React editor, real browser save/read-back and protected-build publication are not
delivered by this checkpoint. The existing hosted artifact/gates/expiry and its
source archive are unchanged and predate this work. More permission/company,
analytic, currency/tax/onchange and concurrency acceptance remains, followed by
wider Billing and clinical/external-module parity. Production and the public
demo are unchanged. Earlier checkpoints below are historical.

## Native-faithful journal simulation checkpoint (10 October 2026)

A private native calculation helper now reproduces saved monetary rows and
totals by executing native invoice write/synchronisation inside an unconditionally
rolled-back savepoint. It retains native ACLs, balance/hash/fiscal restrictions,
suppresses standard tracking/notifications and isolates transaction callbacks.
Stable snapshots distinguish saved rows from newly generated rows without
depending on the new database IDs. This is not a purely virtual onchange:
temporary SQL writes occur and surrogate sequences can advance despite rollback.

All 326 installed native tests pass with zero failures/errors/skips, including
nine new tests comparing simulation with actual native save for invoice/credit,
draft/posted, company/foreign currency, tax/add/remove and installment cases.
Tests also verify record/count rollback on success and failure, preserved earlier
request writes, original callback queues and native permission/hash/fiscal guards.
Seven gateway/build-config tests pass. Installed model/test/init hashes match.
Billing restarted, the analytic setting is mandatory, and independent native
reads/exact Cut-Off retry retain the original entries/receipt, source/protected
records, balances, counts and matching. Existing upstream warnings remain.

This helper is private, not a browser-callable monetary editing API. Review-bound
payload validation, atomic save/status/retry, React row editing and real browser
acceptance remain unfinished. No frontend build is claimed for this backend-only
step; the existing protected artifact/archive is unchanged and predates it.
Additional native addons need a fresh synchronous-hook review before using this
calculation path. Wider Billing and clinical/external-module parity remain
incomplete. Production and the public demo are unchanged. Earlier checkpoints
below are historical.

## Native journal monetary contract checkpoint (10 October 2026)

Nine added installed-source tests establish native journal amount/credit
behaviour, desktop/mobile field differences, dynamic receivable updates,
draft/posted outcomes, deletion, balance/fiscal/reconciliation guards and
read-only onchange. Crucially, company-currency onchange totals can differ from
native write outcomes, and monetary ledger edits do not necessarily reprice the
product. The forthcoming monetary review must reproduce actual native saved
rows/totals and expose that difference, not accept a misleading onchange total.

All 317 installed native tests pass with zero failures/errors/skips; final test/
init hashes match. Seven existing gateway/build-config tests pass. Billing is
running again and the analytic setting is restored to mandatory. Independent
native reads and exact Cut-Off status/retry preserve the original two entries,
one receipt, source/protected records, financial/stock/mail counts and matching.
All synthetic monetary probes/tests rolled back. Upstream/report-renderer
warnings remain; this is not a warning-free environment claim.

This is tests-only progress. No new monetary API or UI is available, no frontend
build/browser acceptance is claimed for it, and the protected artifact/source
archive is unchanged and predates these tests. Faithful monetary preview,
review-bound atomic save/status/retry, broader row/tax/currency acceptance and
browser save/read-back remain required before monetary editing is accepted.
Full Billing and clinical/external-module parity remain incomplete. Production
and the shared public demo are unchanged. Older checkpoints below are historical.

## Reviewed Cut-Off integration checkpoint (10 October 2026)

Six scoped `account.move.qorlia_cutoff_*` methods and the redesigned journal
control now delegate recognition-period adjustments to the installed Odoo wizard.
Virtual onchange/preview is read-only. Review exposes generated entries,
company-default changes, future scheduling and native matching of the two new
accrual rows when both entries post and the account permits reconciliation.
Save locks source/configuration, verifies unchanged source financial/matching
data and records an atomic author/payload-bound UUID receipt. Exact retries return
the same entries, including when the source later becomes ineligible.

The 308 installed native tests pass with zero failures/errors/skips. Home has
351 passing tests/43 suites; type checking, touched-file lint and seven gateway/
build-config tests pass. Direct webpack builds successfully; the existing Nx
task-graph cycle, stale Browserslist and development bundle-size warnings remain.
Real local browser save on synthetic #24525/#63988 and independent native
read-back/status/retry verify two balanced INR 125 entries, one receipt, unchanged
source amounts/state/matching and protected records, no payment/stock/mail writes,
and a partial/full reconciliation confined to the two new accrual rows.

Protected artifact `reviewed-cutoff-20261010` is published with the same tester,
clinical and ERP gates, backends and expiry (15 October 2026, 18:29:59 UTC).
All 83 chunks and source/LICENSE/NOTICE match; the archive is secret-free.
Authenticated native load/choices/onchange/preview/status and denial checks pass.
Hosted browser review recalculated INR -125 to 25%, showed both balanced entries
and native defaults/matching effects, then discarded without saving. Subsequent
independent native read-back/status/exact retry retained exactly the original two
entries and one receipt, unchanged source/protected records and financial counts.
Published source precedes these final evidence notes and the corrected journal
copy assertion, and includes pre-existing clinical working-tree changes rather
than a clean commit-only release. This is selected Cut-Off integration evidence,
not full monetary journal or Billing acceptance. Wider
bank/provider, stock/POS/sync and clinical/external-module parity remain required.
Production and the public demo are unchanged. Earlier checkpoints are historical.

## Native Cut-Off contract checkpoint (10 October 2026)

Five installed-source contract tests prove read-only virtual preview, native
amount/currency rounding, amount onchange, generated recognition/adjusting
entries and company-default updates. They retain unchanged source invoice money,
check native percentage/date/source restrictions, and show future recognition
auto-post scheduling and duplicate execution without an exact-request guard.
All 294 native tests pass without failures/errors/skips; installed test/init
hashes match. Staging is running and the analytic setting was restored. Subsequent
native/hosted reads retain the posted synthetic label, one save receipt, protected
balances/counts and the existing artifact/access boundaries.

This is a tests-only prerequisite, not an available Cut-Off API or React screen.
The integration still needs reviewed generated entries and default-setting effects,
native ACLs/rules/locks and atomic exact-request save/status/retry. The published
`posted-journal-20261010` archive predates these five additional tests. Wider
monetary journal, bank/provider, stock/POS/sync and clinical/external-module parity
remain unfinished. Production and the shared public demo are unchanged.

## Posted journal metadata checkpoint (10 October 2026)

Draft and posted invoice/credit journal detail editing now delegates to native
Odoo under the caller's access rules. Locks, protected hashes and reconciliation
checks still apply. Save verifies unchanged document state/payment state, amounts,
monetary rows and partial/full reconciliation links, with exact-request recovery.
Existing deprecated accounts remain preservable; new selection is denied.
The response binds state and actual transaction currency; React rejects a review
that changes either and formats early-discount amounts in transaction currency.

The installed 289-test suite passes with zero failures/errors/skips; model/test/
manifest hashes match. The 334 Home tests/41 suites, type checks, touched-file lint
and development build pass. Native posted/credit, paid/reconciled, lock/hash,
cancelled and stale-state checks are covered. Existing upstream and build warnings
remain. Local browser label save/full reload on synthetic #24525/#63988 and
independent native reads prove one receipt and unchanged ledger, balances,
state, matching, protected records and financial/stock/mail counts.

Protected artifact `posted-journal-20261010` is published with unchanged gates,
expiry and backends. All 83 served chunks, source/licenses and secret-free archive
match. Native authenticated posted load/preview and session/route denials pass.
Hosted browser loaded the editor, reviewed a synthetic label change and discarded
it without saving. Subsequent independent native reads confirm the saved label,
one exact receipt and protected balances/counts remain unchanged. Published source
precedes this final evidence note and includes pre-existing clinical working-tree
changes, not a clean commit-only production release.
Raw monetary editing, journal row add/remove and Cut-Off remain unfinished,
alongside wider bank/provider, stock/POS/sync and clinical/external-module parity.
Production and the shared public demo are unchanged.

## Installment-credit reconciliation checkpoint (10 October 2026)

Installed Bahmni credit reconciliation assumes one payment-term line and fails
with an Expected singleton error for installment credits. The Qorlia-scoped
adapter now reconciles each unreconciled credit installment through native
Odoo `js_assign_outstanding_line`, keeping native oldest-first invoice selection.
Single-term credits and non-Qorlia contexts still delegate upstream unchanged.
No custom ledger calculation, financial sudo or new gateway method is added.

Three native reproductions failed before the fix and pass afterward. All 283
installed adapter tests pass with zero failures/errors/skips. Added coverage
includes multiple credits/invoices, preservation of an older independent
allocation, non-unit foreign-currency conversion, exact Confirm retries and
Reset reopening original balances. The oldest-first fixture sets explicit due
dates and checks their order. Installed model/test/manifest hashes match this
worktree, the analytic setting was restored and isolated Billing is running.
Protected artifact `installment-credit-20261010` is published with unchanged
access gates, expiry and backend mounts. All 83 served chunks, source and
LICENSE/NOTICE match; the source archive is secret-free and authenticated
native load/onchange/preview and session/mutation boundaries pass. Published
source precedes this final evidence note.

Hosted browser save/Confirm/Reset passed on synthetic payment #4500 (INR 100),
invoice #24525 (INR 500) and credit #24526 (INR 100), each document with two terms.
Confirm changed invoice/credit residuals to 300/0; Reset restored 500/100 and
Draft. Independent native reads verify one payment, exact post/reset receipts,
four document payment-term lines, balanced draft ledger and unchanged protected
documents/payments/ledger and reconciliation/stock/mail counts. No bank funds
were transferred. The browser fixture remains as labelled staging test data.
This backend-only change retains the existing frontend; it does not close wider
ledger, bank matching, stock/POS/sync or full clinical/external-module parity.
Production and the shared public demo are unchanged.

## Mixed-currency customer payment checkpoint (10 October 2026)

The native adapter now converts invoice/credit residuals into payment currency
using installed Odoo currency rates at the accounting date. Qorlia's server-owned
company context and native record rules still bound the readable documents.
Native readonly oldest-first allocation, payment numbering and reconciliation
are retained; no browser FX calculation or financial sudo is introduced.

Each allocation carries its original document currency. React shows original
open balances separately from allocated/remaining payment-currency amounts.
Actual currency/rate values bind exact draft-save and Confirm reviews. Sorted
currency/rate locks and cache invalidation precede reviewed financial writes.
A changed rate or allocation requires Edit Draft and a new native review.

All 279 installed native tests pass without failures/errors/skips, covering
non-unit rate conversion, local/foreign/third-currency documents, native
Confirm/reset, accepted duplicate recovery, changed-rate rejection, preservation
of saved allocation rows during onchange and limits in payment currency.
The analytic setting was restored and staging is running with adapter hashes
matching this worktree. All 331 Home tests in 41 suites, Home types, touched-file
lint, seven gateway/webpack checks and the development build pass. Existing
Browserslist, development bundle and upstream native metadata warnings remain.

Actual local browser review/save/finish/history passed on synthetic #4083,
INR 100 with USD 500 invoice #23052 and USD 100 credit #23053. Read-only native
verification confirms one new draft payment, one payment move and two seeded
document moves, balanced draft ledger, original residuals unchanged, protected
payments/documents/ledger unchanged and reconciliation/stock/mail counts intact.
Existing staging rates were used; native tests separately prove non-unit-rate
conversion. No browser posting or bank transaction occurred.

Protected artifact `payment-currency-20261010` is published with existing
gates/expiry/backends unchanged. All 83 hosted chunks, source and LICENSE/NOTICE
files match; the archive is secret-free. Actual hosted native load/onchange/preview,
required clinical session and raw/arbitrary mutation/database denial checks pass.
Hosted browser review shows USD document balances separately from INR allocation
and remaining values, with balanced draft journal lines. Independent native
readback after review confirms no further financial changes. Published source
precedes this final release-evidence note. Wider payment terms,
journal/writeoff variants, bank matching/providers, stock/POS, Clinical-to-ERP
sync and clinical/external-module parity remain open. Production/shared demo
unchanged. Earlier checkpoints below are historical, not current restrictions.

## Customer payment draft editor candidate (10 October 2026)

The signed-in React payment history now connects New, Edit Draft and independent
pending-save recovery to native load, choices, onchange, preview, save and status.
Native onchange computes new defaults and journal/direction/customer dependencies
on unattached records, preserving saved allocation rows. Accounting date and
previously posted journal restrictions remain server-enforced.

The editor uses existing Qorlia/Carbon components, reviews native readonly
allocations and prepared journal lines, and persists the exact UUID request
before saving. Uncertain results lock the form and allow explicit status checks
or identical retries, including recovery without loading an editable draft after
later posting/cancellation. Save does not post, reconcile or move funds.

All 273 installed native tests, 329 Home tests in 41 suites, seven gateway/webpack
checks, Home type checking, touched-file lint and the development distro build
pass. The Home suite uses the same preset/setup inline as described below. The
build retains the existing outdated Browserslist data and development bundle-size
warnings. The native analytic test setting is restored after the suite.

The candidate gateway permits only six named draft methods behind verified
clinical and ERP sessions. Tests reject anonymous calls, wrong models, arbitrary
arguments/context and raw financial mutation routes.

Actual local browser creation saved synthetic payment #3817 for INR 125; full
reload, exact status and finish succeeded. Browser editing changed it to INR 175.
CDP fault injection dropped the accepted edit's HTTP 200 reply after native save;
the form retained the request and blocked another payment. Full reload and
identical retry returned #3817, then finish/history showed INR 175 in Draft.
Network interception was cleared. Independent native reads verify one creation
receipt, one edit receipt, exactly one new payment/move, balanced INR 175 ledger,
unchanged protected documents/payments/ledger and reconciliation/stock/mail
counts. No posting, bank transaction or existing record mutation occurred.

Protected artifact `payment-draft-editor-20261010` is now published with unchanged
tester/clinical/ERP gates, expiry and backend mounts. All 83 hosted JS/CSS chunks,
source and LICENSE/NOTICE files match the local package. The archive contains no
tester code or QA password. Actual hosted checks verify session-required draft
methods, authenticated native load/onchange/preview, rejection of arbitrary
model/args/context and blocked raw financial/database routes. Published source
precedes this release-evidence note. Production and shared demo are unchanged.
Mixed-currency automatic allocation, wider ledger variants and remaining
Billing/clinical/external modules stay open.

## Customer payment draft save and recovery foundation (10 October 2026)

The isolated adapter now supports standalone customer draft creation/editing,
native dependent choices and date/journal/bank/currency restrictions. Saving
calls native create/write without posting, reconciliation or bank operations.
It writes only changed header fields because rewriting an unchanged delegated
company field can reset the journal during native method validation. Method-only
edits still trigger native ledger synchronization. Read-back must match the
reviewed details, allocation rows, totals and prepared native ledger; unexpected
changes roll back. Existing document balances must remain unchanged.

Creation UUIDs are unique. Author-bound creation/edit receipts commit with the
draft. Status and accepted retries return the payment's current state, including
later posting/cancellation, without restoring an old draft. Transaction locks,
native roles/record rules and stale payment/document/configuration checks apply.
Edit permission is checked before comparing the author-bound review version.

The installed 265-test suite passes with zero failures/errors/skips. The analytic
test plan is restored to mandatory and staging web service is running. Local and
installed adapter hashes match. Authenticated native HTTP created synthetic
payment #3433 for INR 100, edited it to INR 150 and verified exact save/status
recovery after later cancellation. A separate concurrent HTTP test submitted
two identical first-save requests and obtained matching accepted responses for
exactly one new payment (#3686, INR 125) and one move. Protected records, invoice
and credit balances, reconciliation/stock/outgoing-mail counts stayed unchanged.
No bank transaction was performed.

The React API service validates complete form payloads, readonly allocation and
ledger responses, native choice records, exact recovery request shapes and
current-state receipts. All 312 Home tests/40 suites pass, including 19 new
payment-draft service cases. Home typecheck and touched-service lint pass.
The Home suite was run with the existing Jest preset and setup via inline JSON:
direct TypeScript config loading hit compiler-option errors, while Nx hit an
existing circular task graph. No test assertions or source compiler settings
were bypassed or changed.

This remains a backend/API foundation, not an available payment editor. All five
candidate routes remain denied by the protected gateway. React form integration,
native dependent-field onchange fidelity, exact-request browser recovery and
protected publication are next. Mixed-currency automatic allocation and wider
monetary-journal/writeoff variants still require parity verification. Full Billing,
clinical and separate-product work remain in scope. Production/public demo and
the currently published protected frontend are unchanged.

## Customer payment draft preview foundation (10 October 2026)

Two staging-only native adapters load and preview standalone customer payment
drafts. Preview uses an unattached virtual payment, installed customer/amount
onchanges and the native journal/direction method and bank-account choices.
Saved allocation rows are never attached to the virtual record because the
installed partner onchange unlinks its rows. Tests verify existing rows survive
preview unchanged. Confirm remains the separate native payment lifecycle.

The installed Bahmni allocation tables are readonly, including selected and
allocated amount. Native onchange derives oldest-invoice-first rows, rather than
manual selection controls. Qorlia's server-owned customer context replaces the
upstream unscoped SQL credit/outstanding sums with matching ORM predicates,
payment-company scope and native record rules. Other native contexts are not
changed. No financial sudo, payment creation, posting or reconciliation occurs.

Validation covers exact draft fields, finite nonnegative amounts, canonical dates,
active companies, journal/method/bank membership, native access rights, draft
state and stale origin reviews. Reviews include actual document values, not just
timestamps that can remain equal within one transaction. Allocation snapshots
are bounded to 500 rows per table. Mixed-currency automatic allocation fails
closed pending verified native currency handling, rather than adding unlike
currencies as one balance.

Installed native suite: 251 tests, zero failures/errors/skips, including 13 new
preview tests. All 293 Home tests/39 suites and seven gateway/webpack tests pass.
The isolated analytic test setting was restored to mandatory and service restarted.
Native HTTP JSON load/repeated preview passed for the existing labelled synthetic
lifecycle fixture without creating another payment. An INR 500 invoice and INR
100 credit produce INR 400 current outstanding, INR 200 invoice allocation and
INR 300 preview remaining after an INR 100 payment. Caller allocation commands
are rejected. Independent before/after reads retain protected documents, ledger
values, payment/stock/mail counts and exactly three existing lifecycle receipts.

This is a backend foundation, not a released payment editor. The protected
gateway still denies these two candidate methods, with a regression check; its
UI/build/source artifact has not been replaced. Creation/edit save, native field
choices/date restrictions, exact-request recovery and React/browser acceptance
remain required. Production/shared demo are unchanged. Full Billing and wider
clinical/external-module parity remain incomplete.

## Customer payment history and native lifecycle checkpoint (10 October 2026)

The signed-in Billing workspace adds a customer-payment tab with native search,
state filters and 25-row pagination, including unallocated drafts and cancelled
records. Four fixed `qorlia_payment_state_*` methods load, preview, run and check
Confirm, Reset to Draft and Cancel. Only customer, non-internal payments in the
active companies are accepted. Posted payments must be reset before cancellation.
Native `action_post`, `action_draft` and `action_cancel` remain responsible for
numbering, accounting dates and Bahmni's selected-credit/receivable allocations.

Reviews bind connected documents, selection rows and accounting configuration.
Permissions, locks, ledger balance and financial invariants remain enforced.
The installed Bahmni context-sensitive auto-allocation compute lacks a context
cache dependency; the adapter refreshes it in the native customer action context
before review, with a regression test for a cache warmed in another context.
No posting simulation consumes cheque sequence numbers during preview.

Exact-author UUID receipts commit atomically with each transition. Duplicate
accepted requests return current state without repeating an old action. Pending
requests persist before write and recover through explicit status/identical retry
after reload, independently of whether a payment appears in invoice history.
No financial write is retried automatically. These are accounting state actions,
not bank stop-payment, fund transfer or bank clearance instructions.

Installed native suite: 238 tests, zero failures/errors/skips. Home: 293 tests
across 39 suites. Types, lint, seven gateway/webpack tests and the development
build pass. Native tests include selected-credit reopening, real auto-allocation,
PDC transitions, manual cheque sequence replay, readonly/record-rule denial,
stale reviews and rollback of unexpected financial changes. The isolated test
setting was restored and web service restarted.

Protected browser Confirm, Reset to Draft and Cancel passed for labelled synthetic
PDC payment #2720 (`PQLBR/2026/00001`). Confirm reduced invoice #18196 from INR 500
to INR 300 and selected credit #18197 from INR 100 to zero, with two native
allocations. Reset reopened both balances and removed those allocations. Cancel
retained the INR 100 payment in searchable cancelled history. Independent native
readback after each action and after recovery found exactly three author-bound
receipts, unchanged financial/old-ledger values, balanced entries and unchanged
protected records and payment/move/stock/mail counts. Native bank-matched state
remained unchanged; this is not evidence of a bank transaction or clearance.

Full-page reload recovery, read-only receipt checking and explicit finish passed
after Confirm and Cancel without duplicate writes. The verifier compares stable
move IDs rather than native state-dependent display labels; all ledger amounts
and other financial comparisons remain intact. The `payment-lifecycle-20261010`
protected artifact matches all 83 hosted chunks, source/LICENSE/NOTICE and a
secret-free archive. Tester gate, secure HttpOnly cookie, required clinical
session, robots exclusion and raw-mutation denial remain verified. The published
source archive precedes this final browser-evidence note. Production and the
public/shared demo remain unchanged.

Remaining parity includes editing and creating standalone payment selections,
batch printing, actual bank layouts, bank matching/provider collection, monetary
journal editing, stock/POS/Clinical-to-ERP sync and clinical/external modules.

## Native cheque void recovery checkpoint (10 October 2026)

Four fixed `account.payment.qorlia_cheque_void_*` actions load, preview, run and
check an exact request. The Qorlia review calls installed native `action_void_check`
for posted customer check-printing payments marked sent. It is not a PDC
cancellation, bank stop-payment instruction, refund or deletion. Native roles,
company scope, locks and connected reconciliation permissions remain enforced.
The connected review includes Bahmni's selected credit allocations, exchange and
cash-basis entries. Unexpected changes to financial fields or existing ledger
values roll back. Unreconciled selected drafts do not block native void and remain
unchanged. Reviews currently bound connected journal lines at 1,000.

Same-author exact receipts commit atomically with native cancellation. Duplicate
accepted requests do not repeat the native write. The modal persists the exact
request before sending, with explicit status/retry and no automatic write retry.
Recovery remains available after the cancelled payment disappears from native
reconciliation history. Document types and states have readable labels.

Installed native suite: 221 tests, zero failures/errors/skips, including actual
cash-basis reversal and selected foreign-credit cases. Home: 276 tests/37 suites;
types, lint, seven gateway/webpack checks and the development build pass.
Raw void/draft/cancel routes remain denied.

Protected browser save, full-page reload, pending-request recovery and explicit
status checking passed on clearly labelled synthetic payment #2436/refund #17084.
Independent native readback confirms exactly one accepted receipt, cancelled and
unsent payment, unchanged cheque number 004322 and financial/old-ledger values,
two removed allocations, reopened INR 500 refund, INR 500 selected invoice and
INR 100 selected credit, balanced entries and unchanged protected records/counts.
The fixture's native bank-matched flag remains unchanged; it does not evidence a
real bank transaction or clearance. In the label-polished protected build,
explicit status recovery again returned the accepted receipt. Finishing cleared
the recovery request; reopening payment review showed INR 500 and no pending
recovery button. A final independent readback still found exactly one receipt.

The first protected package briefly failed because its gateway was copied as raw
source. Replacing it with the required bundled gateway restored review service;
no production service changed. The first package's 83 hosted JS/CSS chunks,
source/LICENSE/NOTICE and access gates verified. Final `cheque-void-r2-20261010`
artifact verification also matches all 83 chunks, secret-free source and licences;
secure HttpOnly tester cookie, clinical session, robots and raw-route gates pass.
The source archive precedes this final browser-evidence note. Actual bank layouts,
batch printing, PDC cancellation, bank matching,
providers, remaining Billing/clinical/separate-product parity are still open.
Production and the shared public demo remain unchanged.

## Native cheque sent-status checkpoint (10 October 2026)

Posted cheque/PDC history opens a separate house sent-status review. Four named
`account.payment.qorlia_cheque_sent_*` actions load, preview, run and check the
exact request. They call installed native `mark_as_sent`/`unmark_as_sent`, not
printing, cancellation, clearance or manual financial changes. No bank layout
is required to update the sent flag. Native permissions, posted customer-payment
scope, company rules, locks and balanced-ledger checks remain enforced.

Review binds the current payment, number, sent flag and financial state. Native
number/reference/ledger/allocation changes roll back. Same-author exact receipts
commit atomically with the flag. Duplicate accepted requests return current state
without overwriting later authorised changes. Pending requests survive remounts;
status checking and identical retry are explicit, with no automatic write retry.
After acceptance, a fresh read is required before finishing and starting another
action. Unmarking warns that another print review becomes available.

Installed native suite: 210 tests, zero failures/errors/skips, including actual
PDC invoice allocations and native mark/unmark round trips. Home: 266 tests across
35 suites. Seven gateway/webpack tests, types, lint and development build passed
in this implementation pass.
The isolated web service was restarted and its analytic test setting restored.
Void, bank matching, batch printing, provider collection, monetary journal edits,
stock/POS/sync and remaining clinical/external-module parity remain open. The
actual cheque layout is still disabled. Production/shared demo are unchanged.

Protected browser acceptance: payment #2003 on invoice #14729 was marked sent,
the page was fully reloaded, the persisted exact request was checked without
another write, and the cheque was unmarked sent through a fresh review. Final
native readback confirms exactly two accepted receipts, restored unsent state,
unchanged INR 400 invoice residual, cheque number, references, ledger and
allocations, balanced journal entries, pending bank match and unchanged protected
invoices/record counts. All 83 hosted JS/CSS chunks and the secret-free source,
LICENSE and NOTICE archive match. Tester expiry, secure cookies, clinical-session
gate, robots exclusion and blocked raw mutation/report routes passed verification.
The deployed source archive precedes this final browser-evidence note.

## Native cheque printing candidate checkpoint (10 October 2026)

Posted cheque/PDC payments now open a Qorlia printing-review modal. Six named
`account.payment.qorlia_cheque_*` actions load native configuration, review the
number, generate the configured PDF, check an exact request and download again.
Native invoice/payment permissions, company scope, locks and ledger checks apply.
The installed extension's old `print_checks` entry point is avoided in favour of
its current native numbering wizard and renderer. No new payment is recorded.

Explicit printing requires a reviewed native layout and stationery number, or
the number already assigned by a manual-sequencing journal. A same-author exact
request receipt is stored atomically with the sent state; duplicate requests and
downloads do not assign another number. A failed PDF transaction rolls back.
Pending requests survive modal remounts, freeze new numbering and require explicit
status checking or identical retry. There is no automatic financial write retry.

The isolated native suite passes 202 tests, with zero failures/errors/skips,
including an actual QWeb/PDF render of a clearly labelled, transaction-rolled-back
synthetic layout. Home passes 255 tests across 33 suites. Types, lint, Python
compilation, seven gateway/webpack tests and the development build pass. The
native web service was restarted after the test suite; the temporary analytic
test setting was restored. These are candidate checks, not full bank acceptance.

The staging company's actual layout selection currently offers only `None`.
The UI must show printing unavailable rather than invent a bank-compatible
layout. A verified bank layout, stationery alignment and physical acceptance
are still required. PDF generation/marked-sent state do not establish physical
printing, deposit, future-date posting or bank clearance. Batch printing,
void/unmark-sent, bank matching, provider collection, remaining Billing and
clinical/separate-product parity remain open. Production/shared demo are unchanged.

Protected browser acceptance: opening payment #2003 from invoice #14729 and
reloading cheque status shows the native missing-layout reason, no number field
and no print action. The existing INR 100 payment, INR 400 invoice residual,
unassigned number, unsent state and pending bank match are unchanged on native
readback. The hosted source/LICENSE/NOTICE archive and all 83 JS/CSS chunks match;
tester expiry, secure cookies, clinical-session gate, robots exclusion and blocked
raw cheque/financial/mail/report routes remain intact. Source was packaged before
this final browser note. Successful configured-layout browser printing is still
unverified; the actual synthetic QWeb/PDF proof comes from the rolled-back native
suite, not a real bank layout installed into staging.

## Cheque and post-dated-cheque recording checkpoint (10 October 2026)

The signed-in payment modal now records native manual, cheque and PDC methods
using the installed `account.payment.register` wizard. Bank/cheque references
and the effective date are reviewed before explicit recording; PDC requires an
effective date. Invalid calendar dates, oversized text, foreign method lines,
stale invoice/configuration reviews and unsupported provider methods fail closed.
Native invoice/line locks, caller permissions and balanced-ledger checks remain
in place. There is no financial `sudo` or automatic write retry.

Installed native tests cover incoming PDCs, outgoing cheque/PDC refunds, cashier
permissions and changed payment-method definitions. The native suite passes 192
tests without failures/errors/skips; Home passes 243 tests across 31 suites.
Types, lint, compilation, seven gateway/webpack checks and development build pass.
The native suite runs with the isolated web service stopped and the browser-only
mandatory analytic fixture temporarily optional, restored afterwards.

Protected browser review/record, full-page reload/reopen and explicit status
reload preserve one INR 100 PDC on synthetic invoice #14729 (INR 500 total,
INR 400 remaining). Native readback independently confirms payment #2003,
both references, effective date 2026-11-10, balanced journal entries, pending bank
matching, exactly one new payment and unchanged stock/mail counts and protected
documents. No additional payment is created during reload verification.

The installed Odoo 16 path posts on payment date 2026-10-10, not the cheque
effective date. The UI explicitly explains that the effective date does not
schedule a deposit or confirm clearance. This preserves actual native behaviour,
not future-date posting. Check printing/sent-state, bank matching, providers and
remaining Billing/clinical/separate-product parity are still pending.

All 83 protected JS/CSS chunks and the secret-free source/LICENSE/NOTICE archive
match the tested cheque build. Tester code/expiry, secure cookies, clinical-session
gate, robots exclusion and blocked raw mutation/mail/report routes are unchanged.
Source was packaged before this final browser-acceptance note. Production and
the shared public demo remain unchanged; full goal completion is not established.

## Named journal analytic allocation checkpoint (10 October 2026)

The journal editor now uses native analytic plan/account labels instead of JSON.
One invoice/line/account-scoped read action derives company and business domain
from the authorised invoice and calls installed Odoo 16 `get_relevant_plans`.
Searches retain native ACLs, record rules, company boundaries and root-plan
filters. Missing or denied selected accounts fail closed without erasing data.
There is no caller context, raw model mutation or financial `sudo`.

Percentages, named additions/removals and separate per-plan totals use existing
Qorlia controls. Combined allocation keys remain intact; the UI creates only
individual account keys. Plan rules and account labels bind the explicit review
so changed applicability/names invalidate save. Draft allocation editing does
not bypass native posting validation or provide monetary journal editing.

Current checks: 240 Home tests, 186 installed native adapter tests, TypeScript,
lint, Python compilation, seven gateway/webpack tests and development build pass.
Protected browser review/save and full-page reload retain named outpatient 70%
and laboratory 30% allocations on synthetic draft #11275/item #29184. Independent
native readback confirms the INR 250 draft remains balanced, with unchanged
other items, financial counts and protected documents. Hosted source/LICENSE/
NOTICE and all 83 JS/CSS chunks match the initial analytic build; its tester,
clinical-session and raw-route gates remain unchanged. The final native rerun
passes with no failures/errors/skips. Tests run with the isolated web service stopped
while the browser-only mandatory plan fixture is temporarily optional; it is
restored afterwards. These checks do not prove all Billing or other modules
complete. Compound-key draft preservation does not establish Odoo 16 compound
posting compatibility. Production and the shared public demo remain unchanged.

## Draft journal details: protected save acceptance (10 October 2026)

Draft invoice journal rows now open the Qorlia detail editor with native account
choices, label, maturity date, tax grids, role-scoped analytic distribution and
early-payment discount date/amount. These are existing-item metadata edits, not
monetary entry editing, new/deleted rows, posting or bank matching. Generated
document discount/rounding rows remain controlled by the invoice editor.

Review performs no writes. Explicit save locks the invoice and its lines, checks
native ACLs/rules/company and draft state, revalidates the reviewed configuration,
and invokes native invoice write/synchronisation. Changes to monetary entries,
totals, other items or unreviewed metadata reject and roll back. Same-author exact
request receipts persist atomically on the invoice. An uncertain response freezes
the form for explicit receipt checking or identical retry. Missing receipts do not
prove the first request stopped. Unsaved-close confirmation and storage-failure
checks prevent silent discard or untracked saves. Analytic JSON entry still needs
a more accessible native-plan selector; posted and monetary journal parity remain
open.

The installed isolated native suite passes 180 tests with no failures/errors/skips;
Home passes 234 tests across 30 suites. Types, lint, seven gateway/webpack checks,
Python compilation and development build pass. Real HTTP concurrent exact saves
apply one metadata edit to draft #11275. Preview is read-only; exact retry/status
match; stale review and reused identity with changed values are rejected.

Protected browser review, Keep editing, explicit save and full reload preserve a
synthetic label, due date and early-discount metadata on item #29185. Independent
native reads verify the same values, unchanged other items/counts/protected
documents and the balanced INR 250 draft. Native keyboard date changes invalidate
the previous review. Automation date fill alone did not commit React state, so
browser acceptance uses keyboard-committed dates and checks the displayed review
before save. At a 693px viewport, journal columns scroll inside a keyboard-focusable
581px region without body overflow; ArrowRight moves the scroll position.

All 83 hosted JS/CSS chunks and the secret-free source/LICENSE/NOTICE archive match
the tested build. Tester code/expiry, clinical-session gate, secure cookies,
robots exclusion and blocked raw financial/mail/report routes are unchanged.
Source was packaged before this final acceptance note. Browser account/grid/
analytic edits and fault-injected uncertain-save recovery are not proven by this
populated check. Remaining Billing, clinical and separate-product parity remain
incomplete. Production and the shared public demo have not received the redesign.

## Invoice Journal Items: protected read acceptance (10 October 2026)

The signed-in Billing invoice details now open a house modal with native account,
partner, date, debit/credit, transaction-currency, residual, matching, tax and grid
entries. Authorised analytic users also receive native analytic distributions.
This is a read-only view, not journal editing, posting or bank reconciliation.
Full-journal totals are separate from the loaded 100-row pages. Snapshot-bound
cursors reject changed journals; failed reads hide previously loaded rows.

Native invoice and line ACLs, record rules and company scope apply. Native
one-to-many reads can silently filter denied lines, so the adapter first resolves
only IDs for the authorised invoice, then checks every line before reading values
or full totals. Denied lines fail the entire view. No elevated financial read or
write is introduced. The installed adapter suite passes 168 tests with zero
failures, errors or skips; Home passes 219 tests in 28 suites. Types, lint, seven
gateway/webpack checks, Python compilation and development build pass.

Actual HTTP comparison matches native rows and totals for two posted invoices
and one draft, with stable reloads and unchanged financial/protected records.
Protected browser opening and explicit reload of INV/2026/00039 show all three
native entries and balanced debit/credit totals of INR 500. All 83 hosted JS/CSS
chunks and the secret-free source/LICENSE/NOTICE archive match the tested build.
Tester code/expiry, clinical-session gate, secure cookies, robots exclusion and
blocked raw financial/mail/report routes remain unchanged. Source was packaged
before this acceptance note.

Narrow-screen table readability still needs polish. Journal editing, remaining
Billing workflows and full clinical/separate-product parity remain incomplete.
Production and the shared public demo have not received the redesign.

## Regular invoice advance deduction: protected acceptance (10 October 2026)

Protected browser saves explicitly exercise both native choices: INR 300 when
deducting an existing INR 200 advance from an INR 500 order, and INR 500 when the
user opts out. Full reload/reopen preserves both linked regular invoices and the
original advances. Independent native reads confirm exactly two linked invoices
per order, balanced entries, unpaid state, unchanged payment/stock counts and
unchanged protected financial documents. Reload verification performs no writes.

The 83 hosted JS/CSS chunks and secret-free source/LICENSE/NOTICE archive match
the accepted build. Existing tester link/code/expiry, clinical-session gate, secure
cookies, robots exclusion and blocked raw mutation/mail/report routes are unchanged.
Source was packaged before this final browser acceptance note. Home 206 tests and
native 157 tests cover this checkpoint; types, lint, gateway checks and build pass.

Fault-injected browser uncertain-save recovery, first-use advance account/tax
selection and attachment upload/save/reload remain separate pending proofs.
Complete Billing, clinical and separate-product parity are not established.
Production and the shared public demo remain untouched.

## Regular invoice advance deduction: native and HTTP acceptance (10 October 2026)

Order snapshots expose native down-payment presence and bind it into their status
version. The house action modal offers the native deduction checkbox, checked by
default, with a full-invoice warning when unchecked. Regular invoice calls send an
explicit boolean; omitted values preserve the native true default. Invalid coercions
are rejected before writes. Existing status locks, native ACLs and no-auto-retry
handling remain in place. Reloading current status resets the checked default.

The first actual HTTP test rolled back because the installed Bahmni copy of
`_create_invoices` tried to repost an existing posted advance. The adapter now skips
only that pinned copy, retains Odoo creation and Bahmni dynamic preparation hooks,
and posts newly returned draft moves under the original caller. Tests verify that
previous draft/posted advances remain unchanged. Upstream upgrades must revalidate
this targeted override, including the existing discount, rounding and stock tests.

Installed native code passes 157 tests without failures/errors/skips; Home passes
206 tests in 26 suites. Types, lint, seven gateway/webpack checks and development
build pass. Real HTTP regular invoices total INR 300 with deduction and INR 500
without, against synthetic INR 500 orders and INR 200 posted advances. Configured
automatic posting occurs, entries balance, stale replay and non-boolean inputs
are rejected, and payment/stock/protected financial records stay unchanged.
Protected build/browser acceptance remains pending. This is not full Billing or
whole-product parity, and production/public demo deployments remain untouched.

## Advance invoices: protected browser acceptance (10 October 2026)

The protected build shows percentage and fixed reviews in the house modal.
Forty percent of INR 500 calculates INR 200; the fixed INR 80 calculation also
matches native Billing. Changing type removes the earlier review. Unsaved close
warns and Keep editing preserves the entered percentage for a new review.

Explicit browser save created one INR 200 draft, retained after full reload and
reopening its confirmed order. An independent native read verifies exactly one
linked advance, balanced entries, not paid, unchanged protected financial records
and unchanged payment/stock counts. Hosted 83 JS/CSS chunks and the secret-free
source/LICENSE/NOTICE archive match the build. Source was packaged before this
acceptance note. Existing tester link/code/expiry, session requirement, secure
cookie boundary, robots exclusion and raw mutation/wizard denial are unchanged.

Fault-injected browser uncertain-save recovery and first-use account/tax selectors
still need populated browser testing; they have native/API and mocked UI coverage.
The optional regular-invoice advance deduction control and full Billing/product
parity remain open. Production and the shared public demo are untouched.

## Advance invoices: native and HTTP acceptance (10 October 2026)

Confirmed charge orders connect to a percentage/fixed advance editor through five
named order methods: load, choices, preview, save and status. Native Odoo computes
the deposit line, tax/fiscal mapping and journal; existing balanced Qorlia invoice
adjustments remain applied. Review is virtual and read-only. Save uses the native
down-payment wizard and produces one draft invoice, with no payment or delivery.
First use creates the native shared default product and down-payment section as
well as its deposit line. Serialised setup rejects stale reviews from other orders.

Native ACLs, order rules, company scope and invoice creation/write roles apply.
Only an accounting manager may choose the first-use income account. Reading the
three required automation settings uses narrowly scoped elevated reads; financial
actions never acquire those elevated permissions. Raw wizard/financial methods
and caller context are still blocked by the protected gateway.

Exact request identity binds the order, author, values and reviewed configuration.
Concurrent native HTTP saves returned one balanced INR 250 draft, and status/
exact retry read it back. A fixed INR 123.45 draft also persisted. Changed identity
was rejected. Preview did not change model counts. Payments, stock and three
protected financial documents stayed unchanged. The first HTTP verifier expected
only a deposit line; native Odoo also adds its section. That verifier was corrected
using a separate synthetic order, leaving the first successful draft intact.

Home has 203 passing tests/26 suites; installed native code has 154 passing tests
with no failures/errors/skips. Types, lint, seven gateway/webpack checks and the
development build pass. Uncertain UI saves remain frozen with their exact request
in same-tab session storage, including reconnect/reload. Recovery fails closed if
storage is unavailable. Only explicit status or identical retry can resolve them.
Native UserError/ValidationError rejects a transaction and enables fresh review.

Protected release and populated browser acceptance are not inferred from these
checks. The regular-invoice wizard deducts advances, but its optional deduction
selector is still missing. Bank/provider/check/PDC, POS, stock/batch, clinical/ERP
sync, wider products and complete parity remain unfinished. No production/shared
public-demo redesign deployment occurred.

## Invoice attachments: native acceptance and protected downloads (10 October 2026)

The conversation composer now supports local file selection/removal and
attachment-only internal notes. Up to five files totalling 10 MiB save atomically
through native Odoo message posting. Original image bytes are preserved by a
fixed native context. The request identity binds exact text, file names, order
and byte hashes; uncertain retries retain the same payload and key. Native
attachment creation permissions are checked before native posting. No arbitrary
attachment IDs, author, recipients, model, company or subtype can be supplied.

Named downloads recheck invoice, message, attachment membership, native file
permissions and invoice parent association. Binary content is bounded at 10 MiB
and delivered as a download, not an inline active-content preview. Native HTTP/
HTTPS URL attachments return a validated link without a server fetch. These
external destinations have independent access/privacy rules. Invalid/path/bidi
file names are rejected on upload or replaced on download. This does not scan
file contents for malware; production needs an agreed scanning/quarantine policy.

Home passes 189 tests across 24 suites; types, changed-source lint, seven gateway/
webpack checks and development build pass. The exact installed native adapter
passes 143 tests with zero failures/errors/skips. Actual concurrent HTTP testing
exposed unstable native attachment order; output is now explicitly ID-sorted.
Concurrent requests persist one message with one copy of each file, and status
read-back returns the same response. Native downloads preserve the original bytes.
Invoice/journal balances, payments and followers are unchanged, with no outbound
email queued for this synthetic fixture.

The protected tester build has matching 83 JS/CSS chunks and a credential-free
source/LICENSE/NOTICE archive. Gate, clinical-session requirement, isolated secure
cookies, robots exclusion and blocked raw mutation/file routes pass independently.
Browser clicks downloaded the 40,065-byte synthetic text file and zero-byte file;
both actual downloaded files match the native originals exactly. The browser
automation file-chooser event is unavailable, so browser selection/save/reload
acceptance remains pending. Local reading and uncertain file-save recovery have
mocked UI tests, not a substitute for that missing populated browser check.
Only the isolated backend was upgraded, with a database/adapter backup. Production
and the shared public demo are unchanged. Native staff notification behaviour
remains unchanged; no patient email is sent by this internal-note action.

Attachment deletion, files larger than the download bound, external email,
followers/activities, complete document reskin and remaining financial/inventory/
synchronisation workflows remain open. Earlier dated checkpoint descriptions
below describe their own release state, not the current attachment implementation.

## Invoice conversation: protected browser acceptance (10 October 2026)

The existing protected tester link now includes the conversation action inside
selected signed-in invoice details. The house note editor/save feedback precedes
the timeline so older history does not bury the composer. Browser save created
native internal message #21100 on synthetic invoice INV/2026/00032. Full-page
reload and reopening retained that message; back navigation retained the selected
invoice and INR 400 outstanding. Unsaved close warns; Keep editing preserves the
draft and explicit discard closes without posting it.

Independent native HTTP read confirms exactly one copy of that browser note and
unchanged invoice/journal, payment count, followers and attachments. No outbound
email was queued for this fixture. The 83 hosted JS/CSS chunks and secret-free
source/LICENSE/NOTICE archive match the release. Tester gate, clinical-session
requirement, Secure/HttpOnly cookie and robots exclusion remain verified. Raw
financial, mail mutation and arbitrary report routes are blocked. URL, access
code and expiry are unchanged. Native 135 tests and Home 180 tests remain the
accepted counts for this checkpoint, not a whole-product completion percentage.

Attachment delivery/upload, external email, follower/activity controls, full
document reskin and the remaining financial/inventory/synchronisation workflows
are not complete. No production/shared-public-demo redesign deployment occurred.

## Invoice conversation and internal notes: isolated acceptance (10 October 2026)

Signed-in selected invoices now have a Qorlia conversation modal backed by native
Odoo messages and tracked changes. Thirty-message cursor pages retain older
history. Native message formatting filters restricted tracked fields; monetary
changes include their currency. Plain text is rendered safely, long messages are
explicitly shortened, and attachment names remain visible without claiming that
attachment delivery is implemented.

Internal notes use native `mail.mt_note`, the authenticated author and native
invoice write/accounting roles. Company/record rules also apply to reads and
status checks. The fixed endpoint accepts no recipients, author, subtype or
attachments. Existing internal followers can receive native notifications;
external/portal followers cannot receive the internal note. Notifications are
queued, not immediately sent by this endpoint. Odoo requires an author email:
only the isolated synthetic QA user received an `.invalid` address for testing.

Canonical request keys bind the invoice, author and exact text. Identical retries
return one saved native message, including concurrent repeatable-read requests.
The UI performs no automatic write retry. Unconfirmed text stays frozen with its
original key even when a status check finds no message: absence in a transaction
snapshot does not disprove a delayed save. Explicit same-request retry or confirmed
native status resolves it. Closing/reconnecting warns before discarding text.

The exact installed adapter passes 135 native tests, zero failures/errors/skips.
Actual concurrent HTTP saves persisted one note, read back by status and history.
Changed text/recipient/author arguments were rejected. Financial invoice/journal
snapshots, payments, followers and attachments were unchanged; this fixture queued
no email. Native tests separately prove internal-follower queued notification,
portal/company/read-only denial and tracking field-group filtering. The tester
gateway, not Odoo's generic JSON-RPC dispatcher, rejects caller context overrides.
Home passes 180 tests/23 suites, types and changed-source lint; seven gateway/
webpack checks and the direct development build pass. Hosted browser acceptance
is a separate pending check. Existing pandas startup, bundle, stale browser data
and Nx-cycle limitations remain as recorded below.

This is internal-note/history progress, not full chatter parity. Attachment
download/upload, external email, follower management, activities, complete
document reskin and the remaining Billing/wider-product workflows remain open.
Production and the shared public demo are unchanged.

## Customer statement PDF: hosted and isolated acceptance (10 October 2026)

The signed-in statement modal now downloads the loaded accounting period using
one fixed native QWeb report. Edited but unsubmitted dates cannot change the PDF
request. The report rebuilds permitted posted receivables, preserves hospital
company layout, prints company-currency totals and original document amounts,
and does not cache an attachment or accept caller-supplied balances/context.
Read roles, company/record rules, strict dates and the 2,000-entry limit remain.

Actual HTTP generated four PDFs, including prior, one-day opening-balance and
empty periods. Their text and rendered pages match independently read native
journals: 0/500/100/400 for the full period, 500 closing before the receipt,
500 opening/100 credits/400 closing for the receipt day, and an empty zero
period. Financial snapshots, payment counts and invoice attachments are unchanged.
The independent native rerun passes 124 tests with zero failures/errors/skips.
Home passes 165 tests in 21 suites, types, changed-source lint, seven gateway/
webpack checks and the development build. The existing upstream startup attempts
to install pandas on the isolated network and warns when DNS is denied; this
does not establish that upstream reporting dependency as ready. Large development
bundles/stale browser data and the existing Nx-cycle workaround remain.

Protected browser clicks delivered the full-period PDF with INR 0/500/100/400.
Edited dates retained the previously loaded result until submission; the one-day
view and delivered one-day PDF showed INR 500 opening/100 credits/400 closing.
Back retained INV/2026/00032 and its INR 400 outstanding amount.
All 83 hosted JS/CSS chunks
and the credential-free source/LICENSE/NOTICE archive match. The access code,
expiry and tunnel URL are unchanged. Gate/session/secure-cookie, robots and
blocked raw mutation/report checks pass independently. Browser delivery is
verified from the actual downloaded file, not its success notice. Long-ledger
PDF pagination and other hospital header/logo configurations remain review gates.

No production/shared-demo deployment occurred. Full document reskin, email/
chatter, journal editing, bank/provider/check/PDC, down payments, POS, stock/batch,
Clinical-to-ERP synchronisation and wider-product parity remain incomplete.

## Customer account statements: hosted browser acceptance (10 October 2026)

The protected build's selected invoice INV/2026/00032 loads its real posted
receivable ledger: INR 0 opening, 500 debits, 100 credits and 400 closing.
Changing the accounting start date does not relabel old results until loading;
the one-day statement correctly shows opening 500, credits 100 and closing 400.
Manual reload works. Back retains the invoice and reopening requires an explicit
load. These actions do not post, pay, allocate or otherwise edit financial data.

Browser inspection caught missing table styles because the modal is portalled
outside the page. Shared house table styles now also apply inside scroll wrappers.
Amounts do not wrap and the ledger supports focused keyboard horizontal scrolling
at the narrow review viewport. All 83 hosted JS/CSS chunks and the credential-free
source/LICENSE/NOTICE archive match the release artifacts. Tester gate, hospital
session enforcement, Secure/HttpOnly cookie, robots exclusion and raw mutation/
report blocking remain verified. The URL, access code and expiry are unchanged.
Production/shared demo are unchanged; statement PDF and full parity remain open.

## Customer account statements: isolated backend verified (10 October 2026)

Selected signed-in invoices now offer an explicitly loaded customer statement
for a chosen accounting period. It uses native posted receivable journal lines
for the invoice's commercial customer and company, with opening balance,
period debits/credits, running balance and document-currency amounts. Paid
invoices, credit notes and unallocated receipts are included; drafts and future
entries are excluded. This is visible ledger history, not a current unpaid list
or bank-clearance assertion. No financial record is changed by loading it.

The named adapter preserves native read ACLs, record/company rules and requires
Odoo's accounting-read role. Strict dates, balanced related journals and a
2,000-entry fail-closed limit prevent invalid or silently truncated statements.
Native Billing Administrator does not imply Accounting Readonly in this pinned
invoicing-only image. The isolated QA administrator received that native read
role; write roles and production/shared-demo permissions remain unchanged.

The independent native suite passes 116 tests with zero failures/errors/skips.
Home passes 159 tests in 21 suites, Home types and seven gateway/webpack checks
pass. Actual HTTP read-back matches native entries for four date ranges:
INR 500 invoiced/100 credited/400 closing; a preceding period with 500 closing;
a one-day period with 500 opening/100 credited/400 closing; and an empty period.
Invalid dates are rejected. Invoice/journal snapshots and payment count remain
unchanged. Protected release and browser acceptance are separate checks.

Statement PDF printing, complete document reskin, email/chatter, arbitrary
journal editing, bank/provider/check/PDC, down payments, POS, stock/batch,
Clinical-to-ERP sync and full wider-product parity are still unfinished.

## Order and payment reports: hosted browser acceptance (10 October 2026)

The protected tester build now contains the order/payment report controls.
Actual browser clicks downloaded quotation S00147, its discount summary, and
detailed/summary receipts for payment PQR10/2026/00001. Delivered local PDFs,
not the success notice alone, confirmed the saved INR 920 quotation and the
receipt's INR 500 billed, INR 100 allocated and INR 400 remaining. Returning
from either report preserved the selected order/payment; no payment was
recorded or order confirmed by these actions.

The hosted source/license archive and all 83 frontend JS/CSS chunks match the
review artifacts. The archive contains no tester code or QA password. Tester
access, hospital-session enforcement, Secure/HttpOnly gate cookie, robots
exclusion and raw mutation/renderer blocking pass independent release checks.
The existing access code, expiry and tunnel URL are unchanged. Only isolated
Billing staging and the protected tester artifacts changed. Native PDF company
layout remains; this is not complete Billing or whole-product acceptance.

## Order and payment reports: code and isolated backend verified (10 October 2026)

The React Billing code now connects saved orders to the native quotation,
permitted pro-forma and discount-summary reports. Posted customer payments and
refunds expose native Payment Receipt, detailed Receipt and Receipt Summary.
Named adapter routes enforce saved-record/report ACLs, company boundaries,
fixed templates and balanced journals; no raw renderer or caller context is
exposed. The report modal reuses the Qorlia controls, with explicit downloads,
bounded PDF validation, session recovery and preserved parent selection.

Actual PDF inspection exposed two upstream mismatches, corrected in the adapter:
sale tax totals omitted Bahmni document discounts, while the hospital receipts
selected the latest same-day invoice and unset outstanding-balance fields.
Quotation/pro-forma now print saved order totals with discount and rounding while
retaining native line/tax/terms rendering. Hospital receipts use only reconciled
invoice/credit records, native partial allocations in each document's currency,
actual item/batch references and current residuals. They do not invent a prior
customer balance. Detailed and summary variants remain distinct. Versioned,
reconciliation-sensitive archive names preserve old files without reusing a
pre-fix or financially outdated PDF.

All 110 native tests pass with zero failures/errors/skips, including actual HTML
rendering, discounts/chargeable overrides/rounding, partial/multi-invoice/refund
and foreign-currency allocations. Actual HTTP downloaded ten PDFs: two saved
orders and two payments across their permitted variants. Text and visual checks
verify order INR 920, receipt INR 500 billed/100 allocated/400 remaining and
refund INR 475 credited/100 allocated/375 remaining. Financial records, journal
lines and payment counts remained unchanged. QA's native role does not permit
pro-forma downloads; actual template tests use an authorised test environment.
Home has 149 passing tests; seven gateway/webpack checks and Home types pass.

These changes are verified in isolated synthetic Billing staging. The protected
frontend release/browser acceptance is recorded separately when completed.
Production/shared demo remain unchanged. This is not complete Billing: customer
statements, full document styling, email/chatter, journal editing, bank/provider/
check/PDC, down payments, POS, stock/batch fulfilment and Clinical-to-ERP sync,
plus the remaining separate products and full clinical parity, are still open.

## Customer invoice PDF reports hosted and browser verified (10 October 2026)

Signed-in invoice details now offer Invoice PDF reports, with the two installed
native customer-report variants: invoices with payment details and invoices
without payment details. Credit notes use the same native reporting engine.
The named report-list/download adapter routes enforce invoice and report read
ACLs, company rules, fixed report/template keys, balanced journals and applied
document adjustments. No arbitrary template, report ID or caller context is
accepted. Raw report/render routes remain unavailable at the review gateway.

The React modal loads only the permitted menu until an explicit download click.
It blocks duplicate downloads and closing during generation, validates bounded
PDF bytes and safe filenames, preserves failures without automatic retries and
provides session-expiry recovery. Printing does not post, pay or allocate; the
native engine may retain a PDF attachment. Unsaved edits are not printed.

Actual native HTTP downloaded both variants for draft #4038, posted invoice
INV/2026/00022 and draft credit #1808. Invoice/journal state and payment count
were unchanged. Hosted browser clicks downloaded the draft and both posted
variants into Downloads. Text and visual checks confirmed the draft's INR 1,150
total, and the posted payment report's INR 500 total, INR 100 paid and INR 400 due.
The alternative report correctly omits payment details. The browser download
event hook timed out despite successful file delivery; actual downloaded files,
not the UI notice alone, provide the acceptance evidence.

Staging report.url now points to the native container's loopback HTTP service,
so wkhtmltopdf can load report styling independently of the QA-login host.
Only isolated synthetic Billing staging and protected review artifacts changed.
The tester gate, expiry, tunnel URL and production/shared demo are unchanged.
All 98 native adapter tests pass with zero failures/errors/skips; frontend,
gateway and source-release checks are recorded in the corresponding parity
checkpoint. Invoice PDFs retain the native layout; complete document-layout
reskin, quotation/receipt/statement reports, email/chatter, journal-item editing,
bank/provider/check/PDC, down payments, POS, stock/batch and Clinical-to-ERP
synchronization remain unfinished or unverified. This is not complete Billing
or whole-product acceptance.

## Standalone invoice creation hosted and browser verified (9 October 2026)

Signed-in Billing now creates standalone customer invoice drafts through the
same Qorlia editor and native load/preview/save/choice routes. Native defaults,
customer/product onchanges, taxes, terms and discount/rounding calculations are
retained. An incomplete new form returns a warning without a save token. Native
create ACLs, company rules and reviewed calculations remain enforced.

Creation uses a per-request UUID, transaction lock and database uniqueness.
Identical retries return the same invoice; changed payloads cannot reuse that
identifier. The native request retry handles repeatable-read concurrency with
a fresh transaction. After an unconfirmed browser save, entries are frozen and
only an explicit identical retry is offered. Closing warns that an invoice may
already exist. Save creates a draft, not a posting, payment or stock action.

Actual simultaneous HTTP saves returned one draft #4005 at INR 1,150. Preview
changed no persisted records, the journal balanced, and payment/protected bill
checks passed. Hosted browser creation and full reload persisted #4038 with
quantity 2, unit price INR 500, reference and note, tax INR 150 and total INR
1,150. Independent native reads verified draft state, a balanced journal, no
attached payment and unchanged protected amounts. This staging tax is a test
fixture, not an approved Indian healthcare tax treatment.

Verification: 92 successful native adapter tests, Home 132 tests/16 suites,
seven gateway/webpack checks, types, changed-source lint, formatting and build.
Hosted gate, hospital-session requirement, blocked raw mutation routes and
matching secret-free source/licenses pass. The development build still has
bundle/browser-data warnings; the existing Nx dependency cycle requires the
direct distro build with its normal target environment.

Only isolated synthetic Billing staging and the protected tester review changed.
Production/shared demo, tester access code/expiry and tunnel URL are unchanged.
Journal-item editing, print/email/chatter, statements, provider/check/PDC,
down payments, POS, stock/batch and Clinical-to-ERP synchronization remain
unfinished or unverified. This is not whole Billing or product acceptance.

## Existing invoice draft UI hosted and browser verified (9 October 2026)

The protected signed-in tester build now contains the React invoice/credit draft
editor and four named native routes. It reuses the Qorlia design system and
native calculation engine, with validated complete snapshots, reviewed-save
tokens, dirty-entry recovery and no raw financial writes exposed at the gateway.
The earlier backend-only checkpoint below is historical, not current UI status.

Hosted browser save/reload persisted draft #2735 at INR 750 (quantity 1.5,
reference and note) and draft credit #1808 at INR 250 (quantity 0.5). Independent
native read-back confirms unposted state, balanced journals, unchanged payments,
original/source records and unrelated INV/2026/00022 at INR 400 open.
An expired-session settings request no longer reloads the login route forever;
actual native sign-in and location selection work on the new release.

Verification: Home 126 tests/16 suites, API/authentication 52 tests, seven gateway/
webpack checks, types/lint/format/diff and build. Native adapter coverage remains
86 successful tests from the backend checkpoint. Hosted access gate, session
requirement, robots exclusion and matching secret-free source/licenses pass.
Only the protected review container was replaced. Production/shared demo and
the existing tunnel URL are unchanged. This does not establish whole Billing
acceptance or clinical-to-ERP synchronization.

## Existing invoice and credit-draft adapter verified (9 October 2026)

Native draft load/preview/save/choices now support existing invoices, partial
editable credits and replacement drafts. The pinned Odoo form/onchange and tax
engine calculates previews without persisting records. Native posting and draft
preview share adjustment values. Saves preserve unchanged manual taxes, validate
reviewed financial results and keep the journal balanced. Source/configuration
versions and invoice/line locks reject stale and simultaneous duplicate edits.
Native permissions, company/line ownership, field validation and generated-row
protection remain enforced without caller fields for state/company/type.

All 86 native adapter tests pass (zero failures/errors/skips), including all 73
previous tests. Seven gateway/webpack checks pass. Actual isolated native HTTP
verified an untouched preview, one success/one rejection under concurrent saves,
an INR 250 partial credit with its original INR 1,000 source still open, no new
payment, balanced ledgers and unrelated INV/2026/00022 unchanged at INR 400.

Only isolated Billing staging was restarted; production/shared demo and protected
review frontend are unchanged. The React draft editor, review-gateway allowlist
and browser acceptance remain pending, so this is not a released UI capability.
New methods remain unavailable through the current protected review gateway.
This does not prove direct invoice creation, journal editing, printing/email,
bank/provider/stock/feed acceptance or whole-product parity.

## Latest reviewed credit-note creation/reversal verification (9 October 2026)

Named adapter load/preview/run methods now delegate to the pinned native
`account.move.reversal` wizard. Editable draft credits, immediate full reversal,
replacement drafts and future scheduled posting preserve native accounting
behavior. Fully allocated invoices retain editable credit creation only.
ACLs/rules, current versions, connected move/line/partial locks, period/journal
rules and balanced-ledger checks remain enforced without `sudo` or caller context.
Existing credit history is versioned so even draft-credit creation invalidates
the previous review. Preview creates no persistent wizard or financial record.

React uses the existing design system, separate preview/confirmation, edit
invalidation, duplicate-click protection and read-only recovery after ambiguous
responses. Date consequences are explicit, and unissued native `/` names are
replaced with distinct draft record-ID labels across Billing. No cash refund,
stock return or sales-order cancellation is implied by a reversal.

All 73 native adapter tests pass without failures/errors/skips, Home 113 tests
in 14 suites and gateway/webpack seven checks. Types/lint/formatting/diff and
development build pass with existing bundle/browser-data warnings. Native HTTP
concurrent credit creation produced one success and one rejection. Full and
scheduled modes read back correctly, with balanced journals and no new payments.
Hosted browser INV/2026/00030 future preview/close changed no document/wizard;
immediate full reversal then created posted RINV/2026/00014 and INR 500 replacement
draft 1819. Independent reads verified original/credit residuals at zero, balanced
journals, no new payments and unrelated INV/2026/00022 still INR 400. Full reload
retained native history, action restrictions and draft identity.

The existing protected tester gate, expiry and native session boundaries remain.
Raw wizard/reversal/create/write/delete methods stay blocked. The review source
archive matches and retains license/notice files without tester credentials.
Production and the shared demo are unchanged. Editable draft corrections,
statements, provider/check/PDC payments, printing, down payments, POS, stock/batch
acceptance and Clinical-to-ERP synchronization remain separate unfinished gates.

## Latest reviewed invoice correction verification (9 October 2026)

The React Billing workspace now uses named review/run adapter methods for
native invoice/credit-note reset and draft cancellation. Native accounting
permissions, protected journals and period locks still apply. Connected move,
line and reconciliation locks plus fresh versions reject concurrent/stale
requests; balances are checked before and after. Separate review/confirmation
and read-only recovery prevent an uncertain reply becoming an automatic retry.
No receipt deletion, refund, bank transfer, stock return or sales-order
cancellation is implied. Credit-note creation/reversal remains separate work.

All 63 native adapter tests pass with zero failures/errors/skips, Home 101 tests
in 12 suites, gateway/webpack seven checks, types/lint/formatting/diff and
development build. Actual native HTTP concurrent resets yielded one success and
one rejection. Hosted browser INV/2026/00025 was reviewed/closed without change,
reset, cancelled, restored and reposted through the React controls. Independent
reads verified retained posted INR 100 receipt 219, no extra payments, balanced
journals and unrelated INV/2026/00022 unchanged at INR 400. Full browser reload
shows INR 500 open and its released credit, not automatic reallocation.

The protected tester build retains the existing access code, expiry and native
session boundaries. Raw reset/cancel/write/delete routes stay blocked and the
matching source archive includes the LGPL adapter and license/notice files.
Production and the shared demo are unchanged. Remaining Billing gates include
credit-note creation/edit/reversal, statements, provider/check/PDC, printing,
down payments, POS, stock/batch acceptance and Clinical-to-ERP synchronization.

## Latest reviewed reconciliation removal verification (9 October 2026)

The credit dialog now exposes a separate review of one reconciled allocation
and a named native removal action. Native Odoo determines residuals and handles
exchange/cash-basis reversal, while the adapter preserves native permissions,
record rules, deterministic graph locks, stale-version rejection and balanced
journal checks. The UI requires explicit review and never retries an uncertain
write. This is allocation removal, not receipt deletion, refund or bank transfer.

All 54 native adapter tests pass with zero failures/errors/skips; Home passes
92 tests in 11 suites, gateway/webpack seven checks, types/lint/formatting/diff
and development build pass. Existing native HTTP evidence proves concurrent
duplicate rejection and reallocation. Hosted browser INV/2026/00023 retained
INR 400 when review was closed, then reopened to INR 500 after one explicit
removal. Independent native reads confirmed RINV/2026/00011 reopened to INR 100,
no partial reconciliation, balanced ledgers and no payment record. Full browser
reload retained that state. Separate INV/2026/00022 remains INR 400 allocated.

The protected review source archive and license files match the updated build;
raw financial mutation remains blocked. Gate code, access expiry and session
boundaries are unchanged. Production and the shared demo were not deployed.
Still needed: remaining correction/refund controls, statements, provider/check/
PDC, printing, down payments, POS, stock/batch acceptance and clinical feed sync.
This checkpoint supersedes the reconciliation-removal gap below, not those gates.

## Latest native credit allocation verification (9 October 2026)

The reviewed existing-credit workflow delegates to the pinned Odoo native
outstanding widget and `js_assign_outstanding_line`, not a custom allocation
formula. Native currency, partial/full residuals and reconciliation history are
retained. It creates no new payment and does not collect or transfer real funds.
Native permissions, record rules, ledger balance and account eligibility apply.
Both target/source moves and their journal lines are locked in deterministic
order; current versions include source balances and accounting configuration.
Raw native allocation/removal methods and caller context remain blocked by the
tester gateway. React requires explicit review, prevents duplicate writes and
uses read-only recovery after ambiguous failures or session expiry.

The first actual HTTP pass caught direct compute calls updating `write_date`
and invalidating every review. The fix reads the native widgets through Odoo's
compute protection. Cache-reset native testing and repeated HTTP reads now prove
stable versions and unchanged invoice timestamps. This is why the native
transaction suite alone was not sufficient acceptance.

All 46 native adapter tests pass without failures/errors/skips, including excess
receipt credit, foreign currency and ordinary cashier permissions. Home passes
87 tests in 11 suites; seven gateway/webpack checks, types, targeted lint,
formatting, diff and development build pass. Real native HTTP INV/2026/00019
received INR 100 then INR 400 credit allocation, leaving INR 400 then zero.
Concurrent identical requests yielded one allocation and one rejection. The
larger credit note retained INR 200; unrelated INV/2026/00020 stayed INR 500 open.
Independent journal/history reads passed and no payment record was created.
Hosted browser INV/2026/00021 was reviewed and closed first with unchanged INR
500 balance and no history. One explicit INR 100 allocation from RINV/2026/00009
left INR 400 and native partial status. Reopening shows the saved history with
no available credit or repeat action. Independent reads verify one partial
reconciliation linking only the two assigned documents, zero remaining source
credit, balanced ledgers and no payments. Hosted gate/session/blocked-route and
source/license checks pass. The shared code and access expiry are unchanged.

Only isolated synthetic ERP and the protected review are in scope. Statement
matching, reconciliation removal, correction UI, printouts, provider/check/PDC
payments, down payments, POS, stock/batch acceptance and Clinical-to-ERP sync
remain incomplete. This is not production accounting or full Billing parity.

## Latest Billing discount and rounding counterpart verification (9 October 2026)

The earlier balance guard remains active, but discount/rounding posting is now
corrected for the tested customer-invoice flows. The LGPL adapter replaces the
pinned Bahmni receivable rewrite with explicit tax-free adjustment lines on
configured accounts, then uses native Odoo posting, currency conversion and
payment-term calculation. It does not assign the whole invoice value to each
installment. The company rounding account is explicit, not guessed. Original
item taxes are retained, matching Bahmni's after-tax document discount semantics.
This is not approval of a deployment's tax treatment or chart of accounts.

`qorlia_item_subtotal` keeps the original item subtotal visible. Adjustment rows
are accounted for exactly once in `invoice_total` and excluded from the React
product table because they appear in the document-level breakdown. Native journal
views retain the rows. Posting/reversal/reset tests do not imply corresponding
correction or refund controls have been added to the React UI. The pinned-image
inheritance and rollback requirements are in `runtime/billing/README.md`.

All 24 native adapter tests pass without failures, errors or skips. Added coverage
includes fixed/percentage discounts, credit notes, positive/negative rounding,
installments, foreign currency, reversal through native `_post`, reset/repost,
onchange calculation, invalid/deprecated/cross-company accounts, and rejection
of already unbalanced history. The first seven new regressions failed against
the old implementation before the fix. Nine Home suites pass 66 tests; seven
gateway/webpack checks, types, targeted lint and the development build pass.

Real native HTTP requests posted INV/2026/00006 for INR 919.75 and RINV/2026/00002
for INR 919.25. Independent journal reads confirmed zero debit-credit differences,
two adjustment rows, preserved INR 45 tax, unpaid residuals, and no reconciliation.
A discounted service order S00146 created one INV/2026/00007 for INR 920.
An old-version repeat was rejected. Historical invalid INV/2026/00002 and
INV/2026/00003 remain unchanged as failure fixtures, not repaired acceptance data.

In the updated protected hosted browser, opening/closing invoice 106's review
left it draft, verified by an independent HTTP read. One explicit post created
INV/2026/00008. The UI showed original items INR 900, tax INR 45, document discount
INR 25.50, rounding INR 0.25 and final/open INR 919.75. Independent reads confirmed
one matching invoice, five unreconciled journal lines and zero imbalance. A second
review offered no posting action. Browser error logs were empty. The tester gate,
credentials, expiry and blocked raw financial routes are unchanged.

Remaining Billing work includes payments and reconciliation, refund disbursement,
React cancellation/reset/reversal, partial/down-payment discount allocation, POS,
stock/batch delivery and returns, full role/company acceptance, printouts and
Clinical-to-ERP synchronization. The development bundle is still large. Only
isolated synthetic staging and the protected review frontend changed; production
and the existing public demo did not. No real funds were moved.

## Latest Billing ledger guard and invoice posting verification (9 October 2026)

Historical checkpoint. Its discount/rounding blocker is superseded by the tested
counterpart implementation above; its invalid historical fixtures remain invalid.

**Accounting correction:** the earlier INR 920 order/invoice checks below
verified API totals and visible status, not balanced journal entries. A later
independent ledger read found debits minus credits of INR -25 on synthetic
INV/2026/00002 and INV/2026/00003. The installed Bahmni discount override computes
unbalanced moves but omits Odoo's rejection. Those earlier posted fixtures are
not valid accounting acceptance and must not be used for payment testing.
They remain unchanged as failure fixtures. No production ledger was inspected
or changed by this isolated test.

The original LGPL adapter's `models/account_move.py` restores the native Odoo
balance invariant using its own currency-rounded journal check and recursion
handling. It rejects unequal entries and rolls back the transaction. It does not
invent a discount-accounting formula. Document-discount and rounding posting
remain blocked until their missing native accounting counterparts are corrected.
Draft quotation editing remains available. A real HTTP confirmation of synthetic
S00093 with an INR 25 document discount returned the balance error; a fresh read
confirmed draft state and zero invoices after rollback.

Named invoice load/post methods read a fresh bounded snapshot, enforce native
ACLs/record rules, lock the invoice and lines, and reject stale versions. Posting
delegates to native `action_post` with analytic validation. Versions include
semantic invoice and line values, not only timestamps. The tester gateway allows
these methods but blocks raw posting, reset, cancellation and write calls, as
well as browser context overrides. The React design-system dialog shows the
customer, company, journal, native final total and eligibility before an explicit
action. Unbalanced existing records display a payment warning. Uncertain replies
require an explicit status read and are never automatically replayed.

Actual native HTTP testing posted synthetic invoice 23, INV/2026/00004, with a
10% line discount and arithmetic 5% tax: INR 472.50. Independent journal-line
reads confirmed a zero debit-credit difference, unreconciled entries, INR 472.50
open amount and `not_paid`. Reusing the pre-post version was rejected. This
proves invoice posting, not payment receipt or Indian healthcare tax validity.

Nine Home suites pass 65 tests; seven gateway/webpack checks and 12 native adapter
tests pass. Native tests include document-discount/rounding rollback, balanced
standalone posting, stale semantic edits and permission denial. Home types,
targeted lint, diff checks and the development build pass.

The protected hosted browser opened and closed invoice 25's review first; an
independent HTTP read confirmed it was still draft. A single explicit Post invoice
then created INV/2026/00005. The UI showed posted status, INR 472.50 still open and
no payment recorded. Its subsequent review no longer offered posting. Independent
native reads confirmed one matching invoice, three unreconciled journal lines,
zero debit-credit difference, INR 22.50 tax and `not_paid`. The hosted review of
legacy INV/2026/00003 displayed the unbalanced-entry/payment warning with no
posting action. Browser error logs were empty for these flows. Review, result,
posted-status and warning screenshots are retained privately. The shared tester
code, hospital/ERP sign-ins and 15 October expiry are unchanged.

Remaining: correct discount/rounding accounting, payment registration and
reconciliation, refunds, cancellation/reset, down payments, POS, stock/batch
delivery and returns, full role/company checks, printouts and Clinical-to-ERP
synchronization. Billing is still incomplete. Only isolated synthetic staging
and the protected development tester release are in scope; production and the
public demo are unchanged.

## Latest Billing order workflow verification (9 October 2026)

Historical API/display checkpoint. Its INR 920 examples failed the later ledger
acceptance above. Do not interpret this section as successful accounting posting.

The original LGPL-3.0 adapter in
`runtime/billing/qorlia_billing_ui/models/order_workflow.py` provides a bounded
native workflow snapshot and two reviewed actions: quotation confirmation and
regular invoice creation. Confirmation uses Bahmni/Odoo `action_confirm` with
native analytic validation. Regular invoices use the native
`sale.advance.payment.inv` wizard with down-payment deduction, matching
[Odoo 16 invoicing](https://www.odoo.com/documentation/16.0/applications/sales/sales/invoicing/down_payment.html).
The adapter does not replace native stock, accounting, tax or rounding logic.

The isolated ERP's automatic delivery and invoicing settings are enabled.
Therefore confirming an eligible order can perform stock delivery and create
and post its invoices. The React review dialog displays those actual settings
before the action. A posted invoice is not a payment. No payment request is
issued by this workflow. Draft save is still draft-only.

Native ACLs and record rules apply at the adapter boundary. Order and line locks
plus a current version reject stale or repeated actions. Automation settings,
linked invoices/deliveries and native invoicing quantities participate in the
version. Only named adapter methods are exposed through the tester gateway,
behind the tester gate, hospital session, same-origin checks and native ERP
authentication. Raw financial methods and browser-supplied adapter context
overrides remain blocked. Row locks serialize this adapter's callers; they are
not a claim of universal race prevention across every native client.

Actual HTTP testing confirmed synthetic order 54, S00054, and created posted
invoice 5, INV/2026/00002. The hosted React browser confirmed order 55, S00055,
after reviewing the consequences, and linked posted invoice 6, INV/2026/00003.
Independent native reads verify INR 45 tax, INR 920 invoice total, INR 920 residual
and `not_paid`. Both orders used two service units at INR 500, a 10% line
discount and INR 25 document discount. Each has exactly one invoice and zero
stock pickings. Reusing S00054's old confirmation version was rejected without
another invoice. The browser linked-invoice view shows the actual posted status,
discount, tax and outstanding amount. No browser error logs were captured for
that verified flow.

Eight Home suites pass 57 tests; gateway/webpack guards pass seven tests; eight
native adapter tests pass without failures/errors/skips. Native tests also cover
regular invoicing with automation disabled, stale configuration/order versions
and access denial without Billing permissions. Home library types, targeted lint,
diff checks and the development webpack build pass. Screenshots and the private
tester guide are retained in the staging evidence directory.

Remaining: payments/reconciliation, refunds, standalone posting/cancellation,
down-payment creation, POS, real stock/batch delivery and returns, full role/company
checks, printouts and Clinical-to-ERP synchronization. Clinical and ERP use
separate synthetic datasets. The ERP remains internal-only with outbound access
disabled. Its test chart/tax is not Indian healthcare accounting acceptance.
The updated protected tester build is a development release, not a production
release or performance sign-off. Production and the public demo are unchanged.

## Latest visit creation and recovery verification (7 October 2026)

The entry flow retains the existing native FHIR Encounter creation API. It now
requires a current patient/location-scoped active-visit read, valid native
visit-location resolution, and an immediate preflight before writing. This
matches the location-sensitive existence check in the pinned native
[visit service](https://github.com/Bahmni/openmrs-module-bahmniapps/blob/f9bc64c407f7b1bebd0d8aa2158f0e989ed5e310/ui/app/common/domain/services/visitService.js).
An already-created visit is reused. StrictMode effect replay cannot send a second
POST from the same container. A successful HTTP status alone is insufficient:
the returned Encounter must match the intended patient/location/type, native
visit tag, ID and start timestamp. Native status `unknown` is accepted.

Paginated search validates every Bundle envelope. Non-Encounter visit entries
and malformed visit-location results reject; they cannot masquerade as an empty
visit list. An uncertain POST exposes Check visit status in the existing Qorlia
action area. Recovery is GET-only. A successful empty read permits only an
explicit new Start visit action. Failed reads cannot authorize a write.
Metadata-read errors have their own reload. Pending unmounted work cannot reset
the next patient's consultation state.

The isolated browser registered synthetic ABC200001, UUID
`8b8c8fc5-8d66-404f-98bd-5469eb324767`, named QorliaQA VisitRecovery. Response-stage
interception dropped only its visit POST reply after the server returned 201.
The server's Encounter ID was `02c2098f-c43a-4dfe-853a-ad0d8af6d595`, subject and
location matched, and status was `unknown`. The UI showed an uncertain-status
panel. Check visit status issued native GETs returning 200 and opened the saved
visit, without a second POST. Complete captures were not truncated. Independent
REST reads after cancellation confirm one active OPD visit and zero clinical
encounters. Patient audit contains registration and dashboard events (160, 161),
not an invented OPEN_VISIT for a write the browser never acknowledged. This audit
gap is recorded explicitly, not repaired by fabricating history. Screenshots
`visit-lost-reply-20261007.png` and `visit-recovered-20261007.png` are in the private
staging evidence directory. Temporary interception was cleared and the QA tab
closed; the user's local home tab remains open.

All 65 services suites pass 1,682 tests; all 110 Clinical suites pass 2,716 tests
and 36 snapshots in both Asia/Kolkata and America/Los_Angeles. Three focused
Clinical suites pass 67 tests/one snapshot in both zones. Library type checks,
services/Clinical builds and changed-source lint pass, with one pre-existing
ConsultationPage hook warning. Test-project type checks are not newly claimed
green. Large bundles and the form2-controls eval warning remain release concerns.

Remaining: server-atomic prevention of cross-client creation races, actual
single-type/limited-role browser checks, multi-location consultation selection,
full clinical workflow parity and the separate products. No backend API,
production/shared-demo deployment or staff permission was changed.

## Latest native audit-writer verification (7 October 2026)

The shared writer follows the pinned native [logging service](https://github.com/Bahmni/openmrs-module-bahmniapps/blob/f9bc64c407f7b1bebd0d8aa2158f0e989ed5e310/ui/app/common/logging/services/auditLogService.js):
persist a message key plus optional JSON parameters, translate when reading.
Clinical visit creation now uses the native [OPEN_VISIT definition](https://github.com/Bahmni/openmrs-module-bahmniapps/blob/f9bc64c407f7b1bebd0d8aa2158f0e989ed5e310/ui/app/common/models/auditLogEventDetails.js),
with `OPEN_VISIT_MESSAGE~{"visitType":"OPD"}`. Neither the backend contract nor
existing audit history was changed. Reports listener initialization now returns
effect cleanup, verified through StrictMode replay and unmount.

Local browser verification created synthetic patient ABC200000, UUID
`67258453-d605-41b1-ae7e-3a3e520a8556`, named QorliaQA AuditFixture. One explicit
Start visit action produced one FHIR Encounter POST returning 201 and one
OPEN_VISIT audit POST returning 200. Complete network captures were not
truncated. Independent native reads confirm one active OPD visit,
`f769b1e9-b6a4-4da6-907f-89da6c9a6e83`, with zero clinical encounters. Patient
creation, dashboard access and visit open persisted as audit IDs 155, 156 and
157. The redesigned audit filter displays all three messages translated with
their actual patient ID, user and visit type. Screenshot:
`audit-native-writer-20261007.png` in the private staging evidence directory.
The empty consultation was cancelled, not saved as clinical content.

The full services suite passes 1,658 tests. Five focused audit/visit suites pass
48 tests in US Pacific time. Reports passes 57 tests in both tested time zones;
the consultation-container suite passes 19 tests in India and US Pacific time.
Library type checks, changed-source lint and services/Clinical/Reports builds
pass. Reports test-project types pass; services and Clinical test-project types
retain unrelated existing errors and are not green acceptance gates. Large
bundles and the upstream form2-controls eval warning remain.

Remaining: complete event coverage, write-failure reporting, automatic visit
creation under effect replay and live limited-role checks. This is not complete
React or separate-product acceptance. No production or shared-demo change.

## Latest audit-log verification (7 October 2026)

The reader was compared with the pinned native [controller](https://github.com/Bahmni/openmrs-module-bahmniapps/blob/f9bc64c407f7b1bebd0d8aa2158f0e989ed5e310/ui/app/admin/controllers/auditLogController.js),
[view](https://github.com/Bahmni/openmrs-module-bahmniapps/blob/f9bc64c407f7b1bebd0d8aa2158f0e989ed5e310/ui/app/admin/views/auditLog.html)
and [service](https://github.com/Bahmni/openmrs-module-bahmniapps/blob/f9bc64c407f7b1bebd0d8aa2158f0e989ed5e310/ui/app/common/logging/services/auditLogService.js).
The native [REST controller](https://github.com/Bahmni/audit-log/blob/47b98a828a0f8e1f660832d1e9f0eafcec1b7a4b/omod/src/main/java/org/openmrs/module/auditlog/web/controller/AuditLogController.java)
and [DAO](https://github.com/Bahmni/audit-log/blob/47b98a828a0f8e1f660832d1e9f0eafcec1b7a4b/api/src/main/java/org/openmrs/module/auditlog/dao/impl/AuditLogDaoImpl.java)
define authentication, app:admin access, date filters, cursor directions and the
50-record limit. No backend privilege or API contract was changed.

Browser filtering at local September 2 midnight sent UTC September 1 18:30,
username superman and patient QST910001. Native reads and the rendered table
agree on the first 50 IDs (1 through 147 with gaps). Next cursor 147 returned
148 through 153; Previous cursor 148 restored the first page. Empty filtering
followed by Previous requested defaultView=true without identity filters and
rendered the latest 50 events (104 through 153). Dates display local seconds,
configured messages and modules translate, and malformed responses reject.

The read-failure browser test retained 50 rows while the configured three GET
attempts were blocked. Explicit retry sent one matching GET returning 200;
its empty response retained the page with No more events found. Clearing every
native date segment then sent username/patientId without startFrom and returned
50 records. Complete network
captures contain no POST/PUT/PATCH/DELETE, and temporary blocking was cleared.
The screenshot is audit-native-recovery-20261007.png in the private staging
evidence directory. Anonymous native GET returns HTTP 200 containing the error
object User is not logged in, not event rows. The reader explicitly rejects this
envelope; checking the status code alone would be insufficient. Nine Admin suites
pass 61 tests in both tested time zones,
including date omission, DST rejection, message parameters, cache re-entry,
malformed responses and GET-only recovery. Lint/type checking/build pass.

Remaining: actual limited-role checks and complete event emission coverage.
Existing START_VISIT_MESSAGE entries expose a React emission mismatch, not a
reader translation failure; stored history is unchanged. Separate products,
other React workflows and full acceptance remain open. No production deployment
or shared-demo change occurred.

## Latest native CSV verification (7 October 2026)

The React importer follows the pinned native [upload controller](https://github.com/Bahmni/openmrs-module-bahmniapps/blob/f9bc64c407f7b1bebd0d8aa2158f0e989ed5e310/ui/app/admin/controllers/csvUploadController.js)
and [import service](https://github.com/Bahmni/openmrs-module-bahmniapps/blob/f9bc64c407f7b1bebd0d8aa2158f0e989ed5e310/ui/app/admin/services/adminImportService.js).
It reads the native extension's import map/algorithm, uses native multipart APIs,
requires a Boolean acknowledgment, and retains submission acknowledgment if the
following status GET fails. Missing or external configuration fails closed.

The already approved isolated staging browser submitted two clearly labelled
concept fixtures. Independent native status reads returned:

| Import ID | Native status | Successful rows | Failed rows |
| --- | --- | --- | --- |
| 1 | COMPLETED | 1 | 0 |
| 2 | COMPLETED_WITH_ERRORS | 0 | 1 |

The valid concept UUID is `e775e6d0-7b5f-4d70-a286-eb0b383f2e73`, named
`QorliaQA CSV Concept 20261007`. Native search for the invalid fixture returns
no results. Neither import was replayed after acknowledgment.

The private proxy lacked the native `/uploaded-files/mrs/` error route. Its new
relative 302 reaches the existing authenticated file service. This is necessary
because the session cookie is scoped to `/openmrs`. The adapter requires the
native CSV import privilege, or the authenticated System Developer role, for
this prefix. OpenMRS's [2.6.15 User privilege logic](https://github.com/openmrs/openmrs-core/blob/2.6.15/api/src/main/java/org/openmrs/User.java)
and [role constant](https://github.com/openmrs/openmrs-core/blob/2.6.15/api/src/main/java/org/openmrs/util/RoleConstants.java)
define this implicit superuser behavior. No user role was changed. Existing
patient-document access checks remain in place. Anonymous error-file requests
return 403; runnable adapter checks reject clinical-only CSV access, malformed
paths and forged unauthenticated superuser responses. Live limited-role and
inherited-role behavior still requires verification.

The browser error download has the native `.val.err.csv` name and contains
`Concept Class not specified`. Its SHA-256 is
`051cd99a56e82fa04fbd04ca46913e2db039ba5bb66af7a06da2da96a85d32bc`.
Exact concept selection followed by Enter produced the native ZIP. Its two
members are `concepts.csv` and `concept_sets.csv`; archive inspection confirms
the imported UUID and name in `concept_sets.csv`. ZIP SHA-256:
`a7cb520ce5ae59c6fe9738732c0ffbc6fb53587b008bc464f73eb3928f633d63`.
The download watcher on the opener timed out because the native export opens
a separate context, but the saved archive's timestamp and contents were checked.
No export mutation was replayed.

Nine Admin suites pass 51 tests in both Asia/Kolkata and America/Los_Angeles.
Changed-source lint, type checking, adapter checks and package build pass. The
first build exposed an ES-target mismatch for `Object.hasOwn`; using the existing
target's `hasOwnProperty.call` fixes it without changing the target. The large
Admin bundle remains a release concern.

Remaining: native saves for the other import types and matching algorithms,
cancellation/large-file boundaries, actual limited-role enforcement and full
React acceptance. No public/shared-demo deployment, new purchase or exposure
occurred. The CSV routing/adapter update was reloaded only in private staging.
Separate-product redesign remains unfinished.

## Latest order-set lifecycle verification

The local order-set editor retains Bahmni's native full-read, create/update,
serialized-template and non-purge retirement APIs. Saving now reloads native
detail, preserves drafts on failed writes/required reads, and cannot navigate an
old editor back over a new URL. List/detail mount reads override the Admin app's
cache default so saved records appear when returning to the list. The shared
Qorlia retirement modal replaces the browser-native prompt, blocks repeat or
dismissal during the pending request, restores row focus on cancellation and
focuses Create order set after confirmed retirement.

Nine Admin suites pass 44 tests in India and US Pacific time, including 15
order-set checks using the actual app query defaults. Type checking, source lint,
formatting and package build pass; the existing large bundle is unchanged in
scope. Actual isolated browser creation returned POST 201/full GET 200, and
populated edit/read-recovery checks preserved native member templates and UUIDs.
Returning from the editor now performs a fresh list GET 200. Cancel and Escape
send no mutation. A blocked retirement stays in the modal with an error and an
independent read confirms the record is still active. Clearing the fault and
explicitly confirming sends one DELETE 204 followed by list GET 200, without
automatic replay. Keyboard confirmation of a second disposable fixture returns
focus to Create order set. Both fixtures are retired, readable and not purged.

The independent clinical snapshot still matches the after-visit baseline (seven
encounters, four visits, pulse 81). This closes these tested lifecycle paths, not
all order types, dosing rules, member removal, malformed templates, concurrency
or limited-role checks. Other Admin/operator workflows, full React parity and
OpenELIS/Odoo/radiology/analytics/outreach remain unfinished. No public/shared-demo
deployment, purchase, exposure or existing staff privilege change occurred.

## Latest confirmed form-pin preference verification

The selector and native-form editor now share user-keyed preferences through the
existing query cache. Confirmed saves update pins; failed or uncertain saves do
not publish optimistic success or replay POSTs. Retry reads the native preference
without resetting the draft. Same-client concurrent writes are guarded, late
old-user responses remain isolated and hidden-catalogue pins are preserved.
Malformed top-level payloads/non-string values reject rather than looking empty.

Six focused suites pass 248 tests/five snapshots in India and US Pacific time.
The full clinical suite passes 2,706 tests/36 snapshots in both India and US
Pacific time. One stale header snapshot needed only four generated CSS class
names refreshed. Five OT fixtures now encode the selected browser-local time,
matching the original Bahmni calendar; an added regression preserves explicit
API timestamp offsets. Application date handling was unchanged. Type checks,
source lint, formatting and build pass with existing warnings. Real isolated
browser read/write faults preserve unsaved input, expose retry and keep clinical
form actions usable. Complete retry captures contain one GET 200 and no POST.
Successful keyboard pin/unpin POSTs return 200 and independent native reads
confirm both persistence and restoration of the original empty preference.
Discard/Cancel leaves full clinical records unchanged after the earlier synthetic
visit initialization (seven encounters, four visits, pulse 81).

This is not full clinical acceptance. Cross-browser preference concurrency,
broader malformed/configured forms, privilege recovery, other workflow/role
boundaries, operator tools and separate products still need work. Public/shared
demo routes, deployments and existing staff permissions are unchanged.

## Latest form-pin keyboard verification

The observation header now uses the existing shared native IconButton with a
translated name, pressed state and design-system focus/selection styling.
Keyboard Enter/Space toggles are covered by two regressions that failed before
correction; five suites pass 204 tests/four snapshots in India and US Pacific
time. Type checking, lint, formatting and clinical build pass with existing
warnings. Actual staging Enter pinning returned POST 200 and independent native
read-back confirmed it. Space unpinning restored the original empty preference.
The temporary tab is closed; no form was saved and full clinical records remain
unchanged after today's synthetic visit initialization. Pin failure, ordering,
context transitions and wider React/separate-product acceptance remain open.
There was no public/shared-demo deployment or staff privilege change.

## Latest metadata and patient-read recovery verification

The observation editor now retries failed/missing metadata and patient queries
without resetting a loaded renderer or draft. Save and validation override are
blocked while required reads are pending, fetching or failed. Four regressions
and two real-query hook checks cover the guarded paths; five clinical suites
pass 202 tests/four snapshots in India and US Pacific time, with type checks,
source lint and build passing under the existing upstream build warnings.

Real isolated browser request blocking verifies initial metadata failure plus
background metadata and patient failures with typed unsaved text. Retry restores
HTTP 200 reads and the same draft. Complete non-truncated GET-only recovery
captures confirm that patient retry does not refetch valid metadata. Faults were
removed, query devtools closed, the form discarded and consultation cancelled.
This does not prove every form configuration, permission transition or save path.

The old native baseline is preserved; OpenMRS's daemon closed its old visit after
the earlier QA. Today's comparison baseline was taken after one approved
synthetic OPD visit initialization. Full native records are unchanged afterward
(seven encounters, four visits, pulse 81), with no observation submission,
staff privilege change or public/shared-demo deployment. Broader workflow and
separate-product acceptance remain open.

## Latest native-form layout verification

The clipped History and Examination duration label is corrected with a scoped
CSS container query based on form width, without changing native schemas,
validation or API payloads. Rendered labels/control wrappers/numeric wrappers
pass boundary checks at 320px and 437px viewports; the 859px pad at a 1440px
viewport retains its row layout and passes. The 1000px full-width pad also passes.
Viewport overrides were reset. This is one configured fixture, not complete
responsive acceptance. The narrow chart header, action-area height and other
form/control configurations remain to be checked.

The container suite passes 46 tests/two snapshots; clinical build and formatting
pass with existing upstream warnings. Discard/Cancel and an independent full
native snapshot confirm unchanged records (seven encounters, three visits,
pulse 81). No save, public deployment or privilege change occurred.

## Latest form-catalogue recovery verification

The existing React catalogue query now supplies a retry action and guards manual,
direct and saved-form initialization against failed or unavailable catalogue
data. Unresolved privileges/background reads stay pending. Five regressions
failed before the correction; four clinical suites pass 169 checks and four
snapshots in India and US Pacific time. Clinical type checking, source lint and
build pass with existing upstream warnings.

The isolated browser's blocked catalogue displayed an error and disabled Done.
Removing the temporary block and retrying returned native catalogue/schema data
and opened the configured History and Examination controls. The fresh complete
capture contains GET requests only, with 200 responses. Discard/Cancel returned
to the chart; independent full native records are unchanged. No clinical save,
public/shared-demo deployment or privilege change occurred. A narrow-screen field
label remains clipped. Malformed payloads, translated form identity, other
recovery/configuration paths and broader workflow acceptance remain open.

## Latest chart-note rendering verification

The radiology/procedure paragraph-nesting issue recorded below is corrected in
the existing row containers, without changing the shared Carbon tooltip or APIs.
Both regressions failed before correction; 91 widget tests pass in India and US
Pacific time, alongside widget type checks, changed-source lint and build checks.
A fresh populated staging chart opens both notes and dismisses them with Escape,
with no newly captured reload console errors. No clinical records or production
routes changed. Broader responsive/accessibility and workflow acceptance remain.

## Latest submitted-form history and edit-recovery verification

The observation editor now distinguishes unavailable/pending history from an
empty resolved encounter. It uses the pad's actual encounter context, blocks
selection/submission while required history is unresolved and preserves drafts
on failed refresh. Failed saved-form observation/metadata/version reads display
an error and retry, not a blank replacement. Late replaced-session reads are
discarded; catalogue refresh cannot reinitialize an already loaded edit draft.
Reset-context and repeat-initialization regressions failed before correction.

Actual isolated browser read blocking showed the saved-form error and disabled
Done. Removing the fault and retrying restored pulse 81 and its synthetic note;
Cancel returned to the chart. A complete GET-only recovery capture and independent
full native comparison show unchanged records. The native observation response
is one complete page; operation pagination is controlled-test evidence, while
actual-source Encounter pagination independently passes two real one-entry pages.

Focused checks pass 131 clinical tests/two snapshots, 83 sibling widget tests/three
snapshots and 46 service tests in India and US Pacific time. Service/clinical type
checks and builds pass. Lint has zero errors and one existing pad effect warning;
existing mock/eval/bundle warnings remain. A later chart reload exposed paragraph
nesting errors in radiology/procedure note toggletips, pending a separate markup
correction. No temporary request blocking remains.

This is not catalogue recovery, full form/configuration/role/concurrency acceptance
or complete React/separate-product parity. No public/shared-demo deployment or
existing staff privilege change occurred. See the newest parity checkpoint.

## Latest encounter-request lifecycle verification

The header encounter hook now gives its initial lookup and retries one lifecycle
and newest-request guard. Late success/failure cannot overwrite a newer request
or another patient/provider/type context. Replaced context is hidden during render,
before the next lookup finishes; old callbacks and unmounted completions are inert.
Pending shared-store loading clears previous encounter eligibility, preserving the
existing header skeleton rather than exposing an old consultation action.

Eleven initial hook regressions and one store regression failed before correction.
Focused checks pass 168 clinical tests and one snapshot, plus 181 service tests,
in India and US Pacific time. Real hook/store integration with deferred responses
covers context changes; additional checks cover retry ordering, A-to-B-to-A,
missing context and unmount. Type checks, changed-source lint and builds pass,
retaining existing test/build warnings. No dependency or cancellation layer was
added: obsolete network requests may finish but cannot publish results.

The actual-source native read-only verifier still preserves full records and
passes selection, saved-ID/index-lag and read-failure checks. These native reads
are not browser response-order proof. No clinical record, role or public deployment
changed. Other request races, submitted-form failures, draft/permission handling,
concurrency and broader React/separate-product acceptance remain open.

## Latest session-duration boundary verification

The shared session-window constructor now rejects non-finite, non-positive and
unrepresentable explicit durations before encounter search. The configuration
reader rejects coerced boolean/array values and retains the official defaults:
60 minutes for missing/invalid values, 30 for failed lookup. Fractional positive
minutes remain supported. Source:
[Bahmni observation-form guide](https://bahmni.atlassian.net/wiki/spaces/BAH/pages/5644877826/Edit%2BObservation%2BForms%2BIG).

Eighteen added regressions failed before the correction. Focused service suites
pass 165 tests; clinical suites pass 105 tests and one snapshot in India and US
Pacific time. Type checks, changed-source lint and the service build pass, with
existing duplicate-mock/CDSS test warnings. The actual-source read-only native
verifier preserves full records. Browser reload rendered the chart without
captured console errors, and the Qorlia link reached the branded React home.
No hospital global property, staff privilege or production deployment changed.

This is a parsing/boundary checkpoint, not complete session-context, concurrency
or clinical parity. The remaining React and separate-product gates still apply.

## Latest saved-encounter handoff verification

The saved encounter in frontend state is now an ID hint, not trusted current
clinical data. Both header and pad use a native read with typed patient, visit,
provider, type/tag, status and timestamp checks before considering reuse. Actual
read failures propagate; missing/invalid hints cannot resurrect stale indexed
records. Session expiry, newest selection and episode membership remain.

Focused verification passes 131 service tests and 105 clinical tests with one
snapshot in India and US Pacific time, plus type checks, lint and library/app
builds. Existing duplicate-mock, effect-dependency, eval and bundle warnings
remain. The actual-source read-only staging verifier preserves full native
records and covers expired hints, clock-controlled index lag, same header/pad
selection, provider/type rejection, episode membership and failures. Its clock
control is not a live browser-session save proof.

After a targeted pad encounter-search fault was cleared, the real browser
loaded the configured editor for the same synthetic patient. Empty Done stayed
disabled; Cancel restored the chart. The complete, non-truncated recovery
capture contains only GETs with no failed requests or clinical mutation. The
local server remains running; browser-style requests return 200. A prior generic
curl 404 lacked the dev server's required HTML Accept header.

This closes these handoff/recovery paths only. Duration parsing, context races,
submitted-form failures, remaining condition/draft/permission behavior,
concurrency and wider workflow acceptance remain. No production/shared-demo
deployment, new clinical record or staff privilege change occurred.

## Latest paginated encounter selection and recovery verification

Visit/session searches collect all native FHIR pages, including the pinned
HAPI server's FHIR-root search cursor, through the local API. Incomplete/cyclic
pages and later-page failures reject the lookup. Typed reference variants and
newest encounter selection are covered without mutating the caller's array.
Lookup errors no longer mean that a new consultation is known to be safe.

The actual source-service read-only verifier forces two one-entry staging pages,
matches both native REST encounter IDs, chooses the newest from reversed input,
retains the fixture's SESSION_EXPIRED decision and propagates injected page
failure. Native before/after records are identical. Browser request blocking
produces a disabled Consultation unavailable action and retry alert; restoring
reads and Try again returns Continue Consultation for the existing synthetic
patient. The final non-truncated capture has only reads and the normal view
audit POST, not a clinical mutation. Blocking is removed and no error overlay
remains. The earlier truncated capture is not treated as complete evidence.

Focused service/clinical checks pass 200/121 tests and one clinical snapshot in
India/US Pacific time. Type checks, changed-source lint and dependency-first
builds pass. A check initially ran during declaration-output replacement; its
sequential rerun passed without changing source. Existing upstream mock/eval
and bundle warnings remain. No production/shared-demo deployment, clinical save
or existing staff-role change occurred. Snapshot context/age, duration failure
policy, broader encounter/clinical and separate-product gates remain open.

## Latest encounter-scoped diagnosis and refresh verification

Consultation duplicate checks now target the saved encounter, retaining earlier
diagnoses without allowing a repeat in the current encounter. The pinned backend
rejects its encounter search filter; the compatible query keeps the diagnosis
category, reads all pages and filters locally. Missing/failed encounter context
blocks input and Done rather than silently creating a new encounter.

Actual isolated React save/read-back retains the same confirmed concept in two
distinct encounters. Current-encounter duplicate selection was blocked with no
clinical write in the non-truncated capture. A separate new consultation saved
once with 201 and retained one encounter/diagnosis after full reload and native
read-back. Reopening fetched observations for its real saved encounter with 200;
no undefined-encounter request or new reload console error was captured.

The submitted-form callback and shared reader reject missing encounter identifiers
without a network request; the new-to-matched query transition remains supported.
Focused service/clinical checks pass 100/289 tests and seven clinical snapshots in
India/US Pacific time, with type checks and dependency-first builds. Existing lint,
mock, eval/import and bundle warnings remain. Encounter pagination/selection,
submitted-form failure states and other clinical/separate-product gates remain
open. No production/shared-demo deployment or staff privilege change occurred.

## Latest diagnosis-to-condition verification

React now adds a condition only from a confirmed diagnosis and retains the
original diagnosis, matching the pinned legacy controller. Shared store, visible
action and parent-handler checks preserve existing permission/history/duplicate
guards without new dependencies or mirrored state.

Actual isolated browser testing rejected unset/provisional conversion and missing
duration/unit submission without a transaction or clinical entry. One valid save
returned 201. Full reload displays both the confirmed type-2 diabetes diagnosis
and active matching condition with a two-day duration. Independent native REST
and exact FHIR reads retain distinct resource IDs, matching coded concepts,
correct patient/visit association and exactly one encounter shared by both.
Read-back verification does not replay successful saves. No console errors were
captured after reload.

Six focused suites pass 352 tests and nine reviewed snapshots in India/US Pacific
time, with clinical type checking, changed-source lint and build. Existing build
warnings remain. This does not establish all condition onset/status/notes,
noncoded or duplicate-entry rules, retained-draft permission transitions,
concurrency or broader clinical/separate-product acceptance. No public/shared-demo
deployment or staff privilege change occurred. See the newest parity checkpoint.

## Latest saved-diagnosis verification

The chart can edit native saved diagnosis certainty/rank and void a selected
diagnosis with its reason. Exact native reads retain patient/encounter identity,
coded or noncoded values, condition links and form references. A fresh read guards
observed stale edits; incomplete acknowledgements block retry until reopening.
There is no verified native conditional-write guarantee against a later race.

Isolated native checks require Edit Diagnoses for both update and void. The UI
also respects each configured action independently, explicit empty/unknown
configurations, action permission loss and patient switches. It does not expand
staff privileges. Saved noncoded FHIR records now render their official extension
label rather than failing when the code element is absent.

One React edit and one removal persisted across full reloads. Independent native
read-back retains confirmed/secondary values, original creation/form fields,
the removal audit and earlier coded history, with one original active encounter
and zero active FHIR diagnoses for that synthetic fixture. Repeat verification
does not submit writes. A separate coded record's unchanged editor and Cancel
issued only its native GET, restored focus and left the record untouched.

Focused checks pass 70 service and 106 widget tests in India and US Pacific time,
with type checking, changed-source lint and library builds. Existing warnings
remain. This supersedes only saved certainty/order editing and voiding gaps,
not noncoded entry, configured notes/status, all roles, concurrency or complete
clinical acceptance. See the newest parity checkpoint. No production/shared-demo
deployment or existing staff-role change occurred.

## Latest native chart and landing read-permission verification

The condition-only chart now excludes unrelated denied widgets and their empty
navigation sections using native read requirements in the existing registry/filter.
Those requirements are additional to configured hospital restrictions, not an
authorization bypass. Native isolated checks explicitly denied the matching FHIR
allergy, appointment, diagnosis, order/medication and immunization resources while
the seed reads succeeded. Observation reads succeeded without Get Observations;
the frontend does not invent that restriction for this installed backend.

The clinical landing uses the distinct legacy appointment search gate:
View Appointments or Manage Appointments. It neither fetches nor renders that data
without permission, including previously cached names/counts after role loss.
Get Appointments alone does not authorize this legacy query. Patient search works.

Actual restricted-role full reloads retained the saved active condition and onset,
with no unauthorized widget requests or failed reads in the non-truncated chart
capture. The landing issued no appointment search and opened the same synthetic
patient through search. No clinical data was changed. The temporary user/provider
were retired with native read-back and the normal local review session restored.

Focused clinical checks pass 93 tests and one snapshot in India/US Pacific time;
registry checks pass 36 tests. Type checking, lint and dependency-first builds pass
with the existing import/eval/mock/bundle warnings. This is not complete role,
clinical or separate-product acceptance. Remaining permission/draft transitions,
editing, concurrency and broader release gates are recorded in the newest parity
checkpoint. No public/shared-demo deployment or existing staff-role change occurred.

## Latest condition-only restricted-role verification

Direct coded-condition entry now works independently of diagnosis access. The
actual isolated browser account had Edit Conditions and encounter writes, but no
Get/Add/Edit Diagnoses. Native condition reads were 200 and diagnosis reads 403.
The editor avoids diagnosis queries in that mode, requires condition history and
disables saved/draft duplicates while preserving the hospital's explicit input-
control configuration policy.

Missing duration/unit blocked React submission; independent native reads retained
zero conditions, diagnoses and encounters. One valid save and full reload retained
an active Essential hypertension condition with two-day onset, the correct patient,
visit and temporary provider, and exactly one encounter with zero diagnoses.
Reopening search disabled the saved condition; Cancel left native counts unchanged.
The temporary account/provider were retired and the isolated input-control config
restored to its exact pre-test hash. Existing staff roles were not expanded.

Seven focused suites pass 383 tests and nine snapshots in India/US Pacific time,
plus clinical type checking, lint and build. Native serializer/permission checks
also pass without replaying successful writes. Existing upstream build warnings
remain. Unrelated chart widgets still show denied/error states for this limited
role; full role-specific layout, retained-draft permission transitions, other
condition/diagnosis workflows and concurrency are not accepted. No public or
shared-demo change occurred. See the newest parity checkpoint.

## Latest diagnosis and condition input-boundary verification

Exact duration parsing no longer truncates fractions. The existing positive
form range is exposed through native numeric attributes; draft validation and
resource serialization reject unsupported certainty, units, invalid dates and
unsafe/unrepresentable durations. Shared zero-duration serialization remains
compatible. The existing local-calendar onset helper was not changed.

The rebuilt synthetic browser draft exercised fractional rejection, retained
valid integer input and missing-field Done rejection, then Cancel discarded it.
Independent native reads still find exactly the original encounter, diagnosis
and condition. This is invalid-input/cancellation proof, not another valid save.
Seven focused suites pass 379 tests and nine snapshots in India/US Pacific time,
with clinical type checking, source lint and build. A pre-existing timezone test
assumption was corrected to explicit local calendar dates. Native isolated
permission/rollback verification also passes without replaying saved creations;
temporary accounts are retired. Existing build warnings and wider workflow,
role, concurrency and separate-product gates remain. See the newest parity
checkpoint. No production/shared-demo deployment occurred.

## Latest diagnosis and condition creation verification

The isolated pinned backend now has source-serializer and actual React creation
proof. Native tests establish Add Diagnoses or Edit Diagnoses for diagnosis
creation, and the separate Edit Conditions requirement for condition creation.
Denied transactions roll back the encounter and clinical entries; transient test
accounts are retired and original seed/staff roles remain unchanged.

The component reflects those distinct gates, but preserves the explicit
input-control configuration policy. Isolated staging alone now permits either
diagnosis privilege in that control after a configuration backup. This does not
override an Add-only hospital policy or alias privileges globally.

Missing certainty/duration blocked browser saves and native reads confirmed no
clinical records. One valid React save created a confirmed diagnosis and active
condition in exactly one encounter. Full reload and independent exact FHIR/native
REST reads retain concept, onset, patient and visit associations. The verifier's
native Condition shape was corrected without replaying the successful write.
Six focused suites pass 232 tests and nine snapshots in India/US Pacific time,
plus clinical type checking, source lint and the native integration check.

Condition-only roles, diagnosis editing, duration/serializer boundaries,
concurrency and remaining clinical/separate-product acceptance are still open.
See the latest feature-ledger checkpoint. No shared-demo/production deployment
or existing user permission change occurred.

## Latest clinical patient-transition and confirmation verification

Conditions, diagnoses and program summary tables no longer retain another
patient's placeholder rows while the next chart loads. Same-patient pagination
still uses the existing query placeholder mechanism. Three populated pending-read
regressions failed before this correction and pass afterward.

Condition confirmations now identify the selected condition. Confirmation and
submission are disabled when action permission is lost, actions are disabled or
the current patient differs from the captured selection. All three eligibility
regressions failed before the guard. This does not establish concurrent-edit or
mid-request permission-loss acceptance; native backend authorization remains
required.

Actual narrow/desktop browser checks named both synthetic conditions and focused
No initially. No/Escape returned focus to the opening action; full reload and
independent native reads retained both active conditions and the single encounter.
These are cancellation checks, not another condition save. The condition table
also now uses automatic column sizing and a named, keyboard-focusable horizontal
viewport instead of breaking clinical names into compressed fixed-width cells.
Eight focused suites passed 166 tests and one snapshot in India and US Pacific time. Widget type
checking, changed-source lint (zero errors, four existing warnings) and library
build passed. Existing mock/act and import/bundle warnings remain. No public demo
or production change occurred. Broader clinical and separate-product gates remain.

## Latest React condition inactivation verification

Actual dashboard inactivation now has browser save, full-reload and independent
native REST/FHIR proof for a dedicated isolated synthetic fixture. No/Escape
preserved its two active conditions and single encounter; the first confirmed
action created one new encounter and the second reused it. Both inactive records
retain that encounter and the correct patient/visit links. Exactly two encounters
remain. This is not condition-create or diagnosis-save proof.

The shared confirmation now explicitly starts on its secondary action regardless
of danger styling, using Carbon's native selector. Ordinary-dialog initial focus
failed before the fix; all 48 real-modal cases pass after it, plus 95 focused
widget/condition tests, widget type checking and build. Existing lint/test/build
warnings remain. Narrow condition-name wrapping still needs design refinement.
Other condition/diagnosis, permission and clinical release gates remain open.

## Latest native condition transaction verification

The actual source service now has isolated native proof for new-encounter and
matched-encounter condition inactivation, saved patient/visit/encounter references
and rejected-update rollback. Exact-ID REST read-back avoids the collection's
active-only default; successful writes were not replayed to repair that verifier.

A temporary synthetic role with encounter writes and required native reads, but
no Add/Edit Conditions, reached the real condition update gate: direct PUT was
403 and the bundle was 400 explicitly requiring Edit Conditions at its Condition
entry. Anonymous PUT was 401. Native records and the two encounter IDs remained
unchanged after denial. Earlier read-prerequisite denials are not counted as that
proof. Test accounts were retired and existing staff roles were unchanged.

This supersedes only the candidate's native update/reference/rollback gap below.
Browser lifecycle, condition-create/diagnosis authorization semantics and broader
clinical acceptance remain open. No public/shared-demo deployment occurred.

## Latest condition-inactivation candidate

New encounter creation and condition inactivation now share one EncounterBundle
transaction, matching the additional FHIR extension's bundle-local Condition
reference handling and returned-resource contract. The existing matched encounter
path remains one transaction. Missing condition IDs are rejected before writing;
unexpected acknowledgements never trigger a standalone create or automatic retry.
Service/bundle tests passed 46 checks in India and US Pacific time, plus lint,
service TypeScript checking and library build. Native condition create/inactivate,
permission boundaries and rollback remain unverified; this is not full clinical
save parity. See the latest feature-ledger checkpoint.

Local HTML navigation to login/home returns 200. A generic Accept-header HTTP
probe receives 404 intentionally and must not be treated as browser failure.
The signed-in React home was also verified in the actual review browser.

## Latest diagnosis-history failure verification

The diagnosis editor now distinguishes failed history reads from no matching
concepts, blocks additions until both histories are available, and preserves
retained drafts without crashing on missing condition data. Condition conversion
is disabled while that history is unavailable without claiming a known duplicate.
The existing component suites passed 71 tests and nine snapshots in India and US
Pacific time, plus lint, clinical type checking and the clinical library build.
The build retains existing upstream eval/large-bundle warnings. These are
component checks, not a native diagnosis-save or condition-lifecycle proof.
The isolated seed's missing V2 add privileges were not aliased or expanded.

## Latest wide report layout verification

The native converter now applies derived padding/font styles to explicit native
columns as well as default columns. Automatic static-title widths follow heading
word metrics; configured widths, character counts, dynamic headings, value
formatting and explicit report/template split policies remain unchanged. Default
printable bands prevent ordinary row splits. Native checks passed 46 controller
and 49 upload assertions plus six formats, byte-identical CSV and retained XLS
template contents. A 65-row, three-page fixture was inspected on every page after
a failing row-boundary regression exposed and corrected a split patient row.

The React direct HTML result appeared after the earlier browser observation,
with updated padding/9-point dense-table typography, full headings and the
synthetic visit/date range. No duplicate request or Run now control change was
made. One new queued PDF was downloaded and rendered; its SHA-256 matched native
stored bytes. Independent SQL retains nine Completed reports and sixteen audit
attempts. No report deletion, clinical write or public deployment occurred.

This proves the observed wide Visit Report and native fixture, not every report,
font, crosstab, paper size or recovery case. Confirmed React deletion and broader
workflow parity remain open. See the newest feature-ledger checkpoint.

## Latest native report design verification

The isolated Reports converter now derives Qorlia header/table styles without
mutating native shared templates or changing SQL, calculations, CSV data structure
or supplied XLS sheets. It can read the same operator-mounted branding JSON as
the frontend (name/primary only), with validation and safe defaults. Native checks
passed 46 controller and 49 upload assertions plus all six formats, including
two-row colors, literal HTML escaping and retained spreadsheet values/types and
template styling. Only private Reports restarted after a rollback snapshot.

Actual React populated HTML generation visibly retained synthetic visit data and
the configured date range with green/white headings and sage row styling. One
queued PDF completed and downloaded with a native-storage SHA-256 match. Independent
SQL retained all seven earlier reports plus this PDF and fourteen RUN_REPORT audits.
PDF extraction/rendering retained data and credit, but several wide-table header
words still split and body cells remain tightly spaced. Layout acceptance,
crosstabs, other definitions and Unicode/font embedding are not complete. No
clinical/shared-demo/production deployment or report deletion occurred. See the
newest checkpoint in FEATURE_PARITY.md; older output-branding gaps are superseded
only for the styles verified here.

Updated 5 October 2026. The local review at `http://localhost:3002/bahmni-v2/login` uses the isolated synthetic staging backend. The earlier port 3000 review uses the existing synthetic demo backend at `demo-bahmni.qorlia.com`. No redesigned frontend or backend upgrade has been deployed there. This is development evidence, not a production release gate.

## Latest native exporter and browser Custom Excel verification

The previously broken custom XLS exporter now passes with a checksum-pinned
DynamicReports 6.12.1 / JasperReports 6.21.5 / POI 5.4.1 dependency set in private
Java 11 staging. The source manifest and install/fetch scripts are public; JARs,
private configuration and report fixtures are not committed. Original libraries
remain recoverable. This compatibility result does not establish production
dependency security or every hospital template's compatibility.

Native checks passed 46 authorization/controller assertions, 49 upload assertions
and all six export formats. Actual direct and queued custom XLS retain the test
template sheet, formula and populated synthetic visit. A native check also retains
a named range and a non-executable OLE marker, not a verified real VBA project.
All six queued formats have correct MIME/bytes and 206 range responses. The queue
remains JSON after XML template libraries are added. Served files match native
storage hashes; session/ownership denials still pass.

Actual React template upload, one Custom Excel schedule and its My Reports
download passed. Independent POI inspection confirms the downloaded template
label/formula, generated Report sheet and synthetic patient identifier. SQL
retains the five original reports and two custom test reports, with eleven audit
events. Only private Reports restarted after its rollback backup. No clinical
service recreation, shared-demo change or public exposure occurred.

Reports confirmations identify request time, format and filename so identical
report names are distinguishable. Cancel retained seven rows and eleven audit
events and restored focus; narrow and desktop rendering passed. Confirmed React
deletion is still pending. Reports checks passed 56 tests in both India and US
Pacific time. Translation/client checks passed 49 tests: only a missing optional
override is quiet, not required-file/authentication/server failures. The actual
browser reload kept bundled labels and the queue without captured console errors.
Changed-source lint, both type checks and dependency-first builds passed.
Existing duplicate-mock and large-bundle warnings remain release work.

React confirmed deletion, configured templates/real macros, other definitions,
failure/concurrency/restart recovery, output design and CSRF/method migration
remain open. See the newest feature-ledger checkpoint rather than treating the
older broken-exporter observations below as current.

## 5 October direct Reports and authorization checkpoint

### Later native lifecycle and XLS upload verification

Native limited-role/per-report verification passed 27 checks, including
revocation, fail-closed invalid configuration, permission restoration and actual
synthetic row/file deletion. Independent SQL retained the five original reports
and ten audit events; the test user was retired and the original catalogue was
restored exactly. These checks supersede the native lifecycle gaps below, not
React browser deletion proof.

The reviewed native upload controller now validates XLS content, safe filenames
and confined unique writes, preserves original bytes and returns UTF-8 filenames.
It passed 49 native checks alongside the 33 existing authorization checks. Six
actual HTTP upload assertions passed, including Hindi and invalid-file/session
boundaries. The upload fix runs only in isolated staging after a Reports-only
backup/restart. Existing multipart limits and global authentication remain.

Actual direct Custom Excel generation returned 500 because JasperReports 6.0.0
requires HSSFColor$WHITE, absent from the pinned POI 5.2.1 library. No scheduled
record was added. This runtime compatibility issue, native template/formula and
macro preservation, browser template upload/deletion, and scheduled Custom Excel
remain open. Do not label this format working on the strength of upload tests.

### Later native authorization correction

The Reports controller correction is now running only in isolated staging.
Authenticated owner checks cover queue, schedule, download and deletion;
configured report privilege checks cover schedule/direct/download/deletion;
authorization errors fail closed. The direct-denial continuation and queued
duplicate-extension defects are corrected. Global session validation remains
enabled. Native controller checks passed (33); actual HTTP checks passed (16),
including a Reports-only synthetic user's denied cross-user access. The check
account was retired, not left active. Independent SQL retained the original
five Completed report rows and ten report-run audits. A Reports-only rollback
backup preceded recreation; no clinical container, public route or production
service changed. Source and reproduction notes are in `runtime/reports`.

This supersedes the explicit ownership implementation gap below. Live restricted
report definitions, actual deletion, templates, concurrency/recovery and output
design remain unverified. Controller tests do not establish those live paths.

The populated Visit Report now has actual React Run now proof for HTML and native CSV/PDF/Excel/OpenDocument downloads. HTML and CSV retain the synthetic visit; the other files' native signatures were checked, not their complete direct-path document layout. Independent SQL shows five new audit attempts and no new scheduled records. Direct filenames have a single extension. The detailed [parity ledger](FEATURE_PARITY.md) records the evidence and its limits.

Inspection of the pinned Reports application's compiled controller and interceptor identified missing explicit owner checks in queue/download/deletion methods, no per-report schedule check, a fail-open queue predicate on authorization exceptions, and generation continuing after direct privilege denial. Session/global reporting privilege checks remain intact, but are insufficient proof of those narrower boundaries. Cross-user/limited-role runtime probes and server-side corrections are the next priority; do not release Reports on the strength of its UI filters.

The local app was not down: login/home HTML navigation returns 200. Non-HTML probes are deliberately not rewritten by the development history fallback. A regression now covers this distinction; no restart or authentication relaxation was needed.

## 5 October native export-format readiness checkpoint

The actual React Visit Report queue now generated PDF, Excel and OpenDocument in addition to HTML/CSV. Browser downloads retained the app route; native SQL confirmed Completed state and filenames. Read-only PDF extraction/rendering, Excel workbook import and ODS MIME/XML checks retained the expected synthetic visit. All three downloads matched native storage hashes. Native audit records contain all five request attempts. The separate HTML tab displays its populated output.

This proves those formats for this synthetic report, not every report definition, custom templates or role-specific download ownership. Native templates remain unbranded, some labels wrap poorly and download filenames repeat the extension. Direct Run now, custom XLS, deletion, failed-job/restart behavior and separate OpenELIS/Odoo datasets remain pending. Reports tests passed again (50) in India/US Pacific and its type check passed. No production/shared-demo changes occurred.

## 5 October native Reports readiness checkpoint

Native Reports is now running privately in the existing isolated staging network. The clinical backup `openmrs-before-reports-20261004T191744Z.sql` was saved before the image's two migrations; its SHA-256 is `de0cdcfae55ef590c169a478af94e3355fb247076f5894c7ff835e04269adebf`. The separate `bahmni_reports` schema and persistent generated-output volume belong only to staging. The existing proxy was reloaded after its syntax check, preserving its private review address. No production or shared-demo container was changed.

The public AGPL-covered startup adapter disables shell tracing/debugging and uses the original bundled changelogs and application. The reporting-session bridge preserves session validation and HttpOnly/Secure/same-site cookies. Anonymous and invalid-session queue requests redirect to login. These checks do not establish limited-role or report-owner authorization.

Authenticated React scheduling produced Completed HTML/CSV Visit Reports with the expected synthetic QA visit. Independent database records, native audit entries and the downloaded CSV/storage hash match passed. Both test reports remain after browser cancellation of removal. Frontend checks passed (50 tests in India/US Pacific, type check and build). Native PDF/Excel/ODS/templates/deletion, direct Run now, failure/restart recovery and server-side ownership are still open. OpenELIS and Odoo report sources are deliberately unavailable in this staging backend. This supersedes the missing-service gap below, not complete reporting or clinical readiness.

## 5 October Reports readiness checkpoint

Report-name requests, configured formats/date ranges, multipart XLS-template controls, timestamp/date grouping, stale/processing deletion guards and shared report-run audit logging now have frontend regression coverage. The full Reports suite passed 49 tests in India and US Pacific; shared audit-service checks passed 8. Reports/service type checks and dependency-first builds passed. Native browser review loaded the real 13-report catalogue and selected the correct previous-month dates. This is not generation or queue-write proof.

The private staging Compose project still has no Reports service. Its native queue is unavailable and the React page reports that failure explicitly. Inspection of cached official `bahmni/reports:1.1.0`, digest `sha256:3af8e248ae7603126fecb1efacb583e8b6b2bd4e9df0254fc198e8e4a2d63877`, confirmed two requirements before startup:

- The image runs Liquibase migrations on both clinical and report schemas. Back up isolated staging and review migration/schema permissions first. The upstream migration script uses shell tracing with database arguments; do not expose its credential-bearing logs in review output.
- Its registered authentication interceptor requires `reporting_session`, verifies that session through OpenMRS and checks reporting privilege. The [official proxy](https://github.com/Bahmni/bahmni-proxy/blob/main/resources/bahmni-proxy.conf) issues that HttpOnly cookie from the OpenMRS session. The private staging proxy has not yet implemented this bridge. Do not copy session tokens through frontend JavaScript or disable the interceptor.

Next native checks: private service startup, anonymous and limited-role denial, report privilege/queue ownership enforcement, synthetic generation, scheduling/read-back, completed-file contents, XLS upload and deletion. Other-schema OpenELIS/Odoo reports cannot be claimed working against OpenMRS-only staging. No Reports runtime, database or public route was changed during this checkpoint.

## 5 October confirmation focus checkpoint

The shared modal preserves Carbon's safe initial focus and restores its opening button or link on dismissal, including callers that unmount it and StrictMode replay. Populated Programs and Patient Documents browser checks verified Cancel/Stay, Escape, Close and keyboard reopening. No write requests occurred; the synthetic document remained a local pending file and was discarded without saving. Regression coverage uses the real shared/Carbon dialog, not a component mock.

Focused widget/conditions tests passed (57), Programs/result-editor tests passed (56), and document-section tests passed (30). Widget, clinical and document type checks and dependency-first builds passed. This supersedes the focus gap below, not full accessibility, Programs parity or release readiness. Other configured workflows, role/error checks and separate products remain unfinished. Production and the shared demo are unchanged.

## 5 October Programs browser checkpoint

Browser attribute saves now have full reload and independent native REST proof: concept changes, Boolean false/true, retrospective date creation and clearing retained unrelated attribute IDs/values and voided-date history. A backdated state save returned 200; confirmed current-state removal returned 204, reopened the prior state and retained removed-state history. Cancel sent no DELETE and Escape dismissed the in-page dialog.

A separate synthetic browser enrollment returned 201, completion returned 200, and full reload showed the configured outcome and retrospective completion in Past programs. A too-early date disabled submission without a write. Confirmed enrollment removal returned 204; direct native REST retained original attribute/state IDs and values as voided history with dates, outcome and reason, while leaving the patient active. Native search omits voided enrollments, so the verifier reads the independently recorded UUID without repeating writes. Enrollment defaults also respect the legacy `defaultProgram` configuration without clobbering explicit choices; this configuration variant has automated, not native staging-fixture, evidence.

Page/service tests passed (108) in India and US Pacific time, sibling widget tests passed (60, two snapshots), all three type checks passed, and service/widget/clinical builds passed. Existing eval/import/mock/bundle warnings remain. Remaining gates include other datatypes, configured defaults/multi-workflow, concurrent edits and limited-role backend enforcement. Browser dialog dismissal currently loses focus instead of restoring its trigger; this accessibility correction is still pending. No production/shared-demo changes occurred.

## 4 October Programs attribute checkpoint

Concept prefill and unchanged-value detection now cover all three supported concept datatypes and their UUID/label/object response forms. Missing configured answers block the edit rather than clearing existing data; invalid selections cause no POST. The legacy hydrated-object serializer and modern UUID serializer remain distinct.

Isolated staging returns primitive Boolean attributes. The model, editor and both shared summary consumers now retain booleans and numeric zero, exclude voided values and avoid rewriting unchanged scalars. Actual shared-service edits saved a new concept selection, true and a date, then cleared only the date. Independent native REST with `includeAll=true` retained the date's voided history and all four other attribute UUIDs/values. The corrected private read-back assertion did not replay successful writes.

Page/service checks passed in India and US Pacific time (100), sibling Programs widget checks passed (60, two snapshots), and clinical/service/widget type checks and library builds passed. Existing eval/import/mock/bundle warnings remain. The exact local login API returns 200 and authenticates the staging seed, but browser focus commands still time out. Populated browser edits, remaining datatypes, multi-workflow, concurrency and limited-role enforcement are still release gates. No production/shared-demo changes occurred.

## 4 October retrospective Programs date checkpoint

The state and completion controls now accept local calendar dates between the latest non-voided state and today. Shared preflight re-reads the enrollment and rejects invalid or out-of-range dates before posting; existing sibling state actions retain their today default.

An actual-service isolated integration check saved September 25 state progression and September 26 completion for a synthetic September 24 enrollment. Independent REST read-back preserved both state boundaries, the configured outcome and all three attribute UUIDs/values. Earlier invalid dates produced no POST. This is service/API proof; populated browser date saves remain pending because review-tab focus commands time out.

Page/service tests passed in Asia/Kolkata and America/Los_Angeles. Clinical/service type checks and library builds passed; existing eval/bundle warnings remain. The fixture's initial legacy hydrated-object payload was rejected without creating an enrollment. Using the modern ConceptDatatype UUID value corrected the fixture, not application code or staging metadata. No production/shared-demo changes occurred.

## 4 October Programs lifecycle checkpoint

React browser TB enrollment and state update returned HTTP 200 and persisted after reload. Isolated staging returns `allowedStates`; the missing metadata described below applies to the older shared demo. Native REST independently retained the synthetic patient/enrollment link, enrollment date, configured attributes and state history.

Direct API current-state removal returned 204 and completion with Cured returned 200. Read-back preserved attribute IDs/values and voided state history; a React reload showed the completed record in Past programs. These are not browser removal/completion proofs. No enrollment void write was performed.

Removal now uses the existing in-page Qorlia confirmation modal. Shared service preflight rejects stale, completed or voided enrollments/states and next states absent from current server metadata. Page/service/widget checks passed (83 tests); page/service checks also passed in America/Los_Angeles. Clinical type checking and clinical/service builds passed. A stale native popup prevented further browser input; modal UI save checks remain pending, together with retrospective dates, multi-workflow and limited-role enforcement. The server's numeric Program ID rule was not changed.

## 4 October attachment-format checkpoint

Synthetic PDF/JPEG/GIF uploads and a Radiology Order result save returned HTTP 200. Full reload and independent native REST reads retained those files, the existing PNG and original note with correct patient/order links. Authenticated responses matched storage hashes and MIME types; anonymous reads returned 403. JPEG/GIF rendered, and the PDF's original bytes were preserved. The in-app browser's native PDF viewer is blank, so a Download PDF link now provides a verified byte-identical native download. This supersedes the pending PDF/JPEG/GIF checks below, not all media or workflows.

WebP is rejected before upload in the shared processor and is no longer offered by the result editor. The isolated backend probe returned 400; Bahmni's [ImageIO implementation](https://github.com/Bahmni/bahmni-core/blob/master/bahmnicore-api/src/main/java/org/bahmni/module/bahmnicore/service/impl/PatientDocumentServiceImpl.java) names PNG/JPEG/GIF as supported images. No silent clinical-image conversion was added. Both upload screens now accept an unset size setting without returning undefined query data or treating the missing limit as zero. Focused editor/API/page tests passed (60), upload-service tests passed (11) and document-widget tests passed (37). Real backend size limits, populated limited-role checks, specialized forms and broader workflow parity remain pending.

Clinical/widget type checks and clinical/service/widget library builds passed, with existing eval/import/bundle warnings still outstanding. A watched dependency rebuild briefly removed generated CSS; dependency-first rebuilding restored it. A fresh local login entry reached location selection and React home with no console errors. The private backend still responds normally.

## 4 October protected attachment checkpoint

Radiology text/PNG browser create, a second attachment save and removal of one saved attachment now pass real HTTP 200 saves plus reload/native REST checks. The note and retained image keep their observation IDs; the removed image retains voided history. This supersedes the radiology text/image gaps recorded in the earlier checkpoints, not the remaining forms/formats or workflows.

Isolated staging was missing the separate patient-documents service. Its existing pinned upstream image is now used privately with read-only staging document volumes. The `/openmrs/auth` route follows the [official Bahmni proxy](https://github.com/Bahmni/bahmni-proxy/blob/main/resources/bahmni-proxy.conf), retaining session and clinical/document-app privilege checks. The MPL adapter in `runtime/patient-documents/njs.js` adds path validation and closed failure handling. Native checks, the actual image's Nginx check, authenticated file hash/dimension reads, anonymous denial (403), blocked direct/internal paths (404) and traversal rejection (400) passed. File responses are private/no-store and nosniff. No public exposure, shared-demo change or production deployment occurred.

The 57 focused Orders/editor/API tests passed in India and US Pacific time zones. Partial upload failure preserves successful uploads; attachment removal and restoration preserve unrelated values/history. PDF/other formats, real size-limit/error responses, limited-role verification and specialized forms remain pending. Full React workflow parity is still unfinished.

## 4 October isolated browser checkpoint

- Actual browser sign-in, login-location selection and React home navigation passed. A dropped private development connection caused the reported sign-in availability failure; restoring that connection restored authentication. The private review connection now retries after a disconnect, with a forced-disconnect recovery check passing. Staging remains internal-only.
- The development proxy removes the Basic authentication challenge header only from OpenMRS REST/FHIR HTTP 401 responses. The status still reaches the React login handler; this prevents a second native browser login prompt without disabling authentication or changing other services' challenges. A regression test covers that boundary.
- For `QorliaQA StageClinical Synthetic` (`QST910001`), the React Vitals form and Done action saved pulse 78, oxygen saturation 98 and respiratory rate 16 through an HTTP 201 `EncounterBundle` transaction. The saved observations and form history persisted after a full browser reload.
- History and Examination opened, its conditional custom-complaint field appeared after selecting Other generic, and its save event rejected missing required data. After completing the fields, Save Form and Done submitted an HTTP 201 transaction. History, complaint text, duration and units persisted after reload. Editing the saved history submitted another HTTP 201 transaction retaining the same consultation UUID and preserving the other form fields; the edited text was re-read.
- Allergy creation and severity/note editing returned HTTP 201 transactions and persisted after full reloads. Removing one reaction used the existing void-and-replace transaction because the backend appends reaction entries on ordinary updates; only the retained reaction was re-read. Missing severity/reactions and duplicate allergen selection were blocked before a write. The shared formatter now displays coding-only allergen/reaction names and deduplicates them, with a regression test that failed before the fix.
- Synthetic medication creation, editing and stopping returned HTTP 201 transactions and persisted after full reloads. The create retained its drug, dose, frequency, duration, route, instructions, calculated quantity and note. Editing created a linked prescription revision, updating duration and recalculating quantity. Stopping removed the current order from Active & Scheduled while retaining its stop date, reason and note in All history. Missing dosing fields or stop reason were blocked before a write. Other prescribing modes still require verification.
- Browser investigation ordering returned HTTP 201 for consultation `52ccef4c-4c98-4548-8621-f5ff9368cb21`. Independent REST reads returned HTTP 200 for CBC `f2ab6bbf-9d97-4384-a94c-1fcd8078ef69` (Lab Order, STAT), chest X-ray `f0e8bdae-7751-4563-a756-87959b51016e` (Radiology Order, ROUTINE) and dressing `10eabb61-63a7-4d8d-b476-31500bc44a5b` (Procedure Order, ROUTINE). All retain their explicit synthetic notes and the same consultation link.
- Standard's Orders entry uses `app:orders`; correcting the React gate does not add any user privilege. The urgency control now reflects stored draft priority, and order timestamps use the shared formatter. The result-save path uses the existing in-page confirmation modal, with automated cancel, save-failure, lost-permission and successful-write/failed-refresh checks. The old native prompt is gone; its stale draft is rejected by the concurrency guard. The synthetic Procedure browser check below passed Keep editing and confirmed create/edit saves. Direct API radiology-result create/edit persisted an explicit synthetic note, with independent REST checks of its patient/order link and voided original note history. Radiology text and attachment browser saves still require proof. Focused tests passed (160 tests, two snapshots), clinical type checking passed, and the clinical library built with the existing upstream form-renderer eval warning and large bundles.
- The shared metadata reader now converts legacy plain-text event scripts to UTF-8 base64 for the installed form renderer while preserving already encoded scripts. This applies to nested control events and all callers, with a regression check for Unicode, encoded events and non-event fields. No script is executed during normalization.
- Numeric, coded, Date, Datetime and Boolean order-result controls now use existing concept metadata and shared helpers. Configured coded multi-select members store each answer as a separate observation, preserving saved IDs/history through removal and unsaved restoration. Required validation checks the active selection group rather than each placeholder. Automated checks cover zero/false, numeric ranges, answer UUIDs, 255-character notes, required fields, future-date rules, valid calendar dates, nonexistent local times, clearing saved values, read-only permissions and unsupported-rule gates. The 56 editor/API/Orders page tests passed in Asia/Kolkata and America/Los_Angeles; clinical type checking and build passed. Specialized/conditional/computed/repeated/autocomplete rules and root multi-selects remain read-only. The local session API authenticates the seed account through port 3002; login/home HTML also returns HTTP 200.
- Staging lacked a Procedure fulfillment form, so seven clearly labelled QA concepts were created there only, leaving existing forms unchanged. Synthetic Date/Datetime/Boolean/Numeric/Coded result creation and editing returned HTTP 200. Independent Bahmni/native REST reads confirmed the edited time, true answer, numeric 12, configured Yes answer UUID and correct patient/order association. The cleared Date is inactive, and original Date/Datetime observations remain voided with their original values. Native REST expresses Boolean results as configured True/False concepts; Bahmni returns actual booleans. The test adapter was corrected after successful writes without replaying them.
- Real API testing rejected ISO Datetime with HTTP 500; a read confirmed no Procedure result had persisted before retry. The shared result serializer now follows [OpenMRS 2.6.15](https://github.com/openmrs/openmrs-core/blob/2.6.15/api/src/main/java/org/openmrs/Obs.java) and the [legacy datetime control](https://github.com/Bahmni/openmrs-module-bahmniapps/blob/f9bc64c407f7b1bebd0d8aa2158f0e989ed5e310/ui/app/common/ui-helper/directives/datetimepicker.js): calendar Date as `yyyy-MM-dd`, local minute-precision Datetime as `yyyy-MM-dd HH:mm`. This does not claim UTC-instant or second-precision support. Direct API writes/read-back are verified; browser result saves and attachments remain unverified.
- The later synthetic Procedure browser check saved Date `2026-10-03`, Datetime `2026-10-03 15:27`, false, zero and two coded selections with HTTP 200, then removed one selection with another HTTP 200. Full reloads and independent Bahmni/native REST reads confirmed persistence, patient/order association, unchanged UUIDs/values for retained fields and voided history for the removed answer. This verifies this QA form's browser result-save path, superseding that part of the previous bullet, not attachment handling or all form configurations. Multi-select metadata was enabled only for the QA field after an exact-file backup; existing clinical fields and production metadata were not changed.
- Orders configuration was coming from the browser's old HTTP disk cache. The development proxy now sends `Cache-Control: no-store` for backend configuration, not unrelated API responses. Both proxy boundary tests pass. A temporary cache bypass was used once and reset; normal reloads then loaded the current controls. Local home and results rendered without captured console errors after the restart.
- Staging's duplicated legacy/CIEL diagnosis mappings caused flowsheet HTTP 500 responses. Only the nine exact conflicting reference mappings were removed after a recoverable backup, preserving concepts and records. Restarting only isolated OpenMRS cleared its mapping cache. The real flowsheet API now returns 200 and displays the saved pulse and respiratory rate. Other initializer metadata errors still need targeted verification.
- Narrow-screen form cards and action controls no longer overflow their container or put the save footer outside the viewport. This is a shared layout correction, not evidence that every form control has completed visual and accessibility review.
- The shared header now uses Carbon's explicit mobile menu rather than a hover rail. Browser checks confirmed section selection, overlay click and Escape dismiss it; clinical content uses the full narrow-screen width. Navigation text inherits the branded foreground color. A separate desktop-sized tab confirmed the expanded 256-pixel sidebar, hidden mobile button and readable prescription history. Header/layout checks passed (58 tests), including a mobile regression that failed before the fix and retained desktop-rail coverage.

These are populated browser proofs for two observation forms, allergy creation/editing/reaction removal, medication creation/editing/stopping and investigation-order creation, not full consultation parity. Other prescribing modes, diagnosis, order changes/results, attachments, permissions and failure-path verification remain.

## 1 October shared-demo synthetic workflows

Signed-in browser testing exercised the React screens, checked their API responses, and re-read saved data. The clearly labelled test patient is `QorliaQA OctTwo Synthetic` (`ABC200013`).

| Workflow                              | Backend evidence                                                                                     | Result                                                                                                                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Patient registration and profile edit | OpenMRS patient REST write: 200; visit creation: 201; registration encounter: 200                    | Patient ID, demographic/contact fields and visit persisted. Profile reads and writes now share the legacy REST representation instead of losing phone details through FHIR. |
| Patient documents                     | Document upload and visit-document write: 200; subsequent reads: 200                                 | A synthetic screenshot, note and document type persisted after reload. Saved edit/deletion and other media formats remain unverified.                                       |
| Appointments                          | Conflict check: 204; create/edit/status writes: 200                                                  | Service, location, date/time and notes persisted. The test booking was cancelled. Provider editing, check-in and recurring workflows still need verification.               |
| TB program                            | Enrollment: 201; attribute edit: 200; subsequent native full-representation reads: 200               | Numeric test program ID and doctor-in-charge attribute persisted. The server's separate program-ID rule is still numeric.                                                   |
| Inpatient stay                        | Admission, bed assignment, transfer and discharge: 200                                               | Transfer persisted after reload. Discharge released both test beds. The IPD visit remains active, matching the legacy discharge flow.                                       |
| Operation theatre                     | Create: 201; edit, actual-time record/clear, single-surgery cancellation and block cancellation: 200 | The edited note and recorded times were re-read. The test surgery is cancelled and its block is voided, releasing the theatre reservation.                                  |

## Backend compatibility gaps

- The shared demo serves legacy Standard configuration. The local proxy supplies the official Standard V2 files pinned to `f39d186eb9e610d5f219d44ecc5e14b3e615c0db`. It is a review candidate, not evidence that every concept, form or privilege matches. Fallbacks apply only to missing configuration, not authentication or server errors.
- The isolated seed's `superman` roles lack the V2 `Add Diagnoses` and `Add Conditions` privileges. Its existing `Edit Diagnoses`/`Edit Conditions` privileges do not establish equivalent authorization. The React diagnosis entry gate remains intact; matching role metadata and role-specific API enforcement must be verified before diagnosis save testing. No blanket privilege alias or client-side bypass was added.
- Clinical consultation saving calls `/openmrs/ws/fhir2/R4/EncounterBundle`. The shared backend returns 404 (unknown resource). Its installed `fhir2` version is 2.1.0; `fhir2Extensions` is not the additional module implementing this resource. The official [Bahmni additional FHIR extension](https://github.com/Bahmni/bahmni-module-fhir2-addl-extension) must be evaluated with matching dependency versions in an isolated staging backend. Installing its newer dependency set into the shared demo is not an approved or verified upgrade. Do not replace the transaction with independent browser writes that can leave a half-saved consultation.
- FHIR `DocumentReference`, `Appointment` and `ImagingStudy` are unavailable on this backend. Documents and appointments use their existing Bahmni APIs; some legacy medication reads are read-only. Missing imaging enrichment is not proof of a PACS failure.
- TB's `ID Number` attribute metadata still uses `[0-9]*`. `ABC200013` is not accepted as its program ID. This needs an approved metadata change, not a global frontend override. The older shared-demo enrollment responses omit `allowedStates`; the UI reports that next-state selection is unavailable rather than inventing a transition. Isolated staging returns the metadata and passed the state-save checks above.
- OT write payloads must exclude GET-only bed, observation and resource metadata fields. This is covered by a regression test for active and retained cancelled appointments. One rejected HTTP 400 edit nevertheless persisted its note on the older module. Re-read after ambiguous failures before retrying. Supported writable fields are documented in the official [surgical appointment resource](https://github.com/Bahmni/openmrs-module-operationtheater/blob/master/omod/src/main/java/org/openmrs/module/operationtheater/web/resource/SurgicalAppointmentResource.java) and [attribute resource](https://github.com/Bahmni/openmrs-module-operationtheater/blob/master/omod/src/main/java/org/openmrs/module/operationtheater/web/resource/SurgicalAppointmentAttributeResource.java).

## Release boundary

An isolated staging backend uses the official public demo seed, separate database/file volumes, an internal-only network and resource caps. It does not copy the shared demo or hospital data. Its frontend uses a separate loopback hostname/session. The pinned image contains FHIR2 2.5.1 and the additional extension 1.0.0; its bundled core is a snapshot, so staging instead mounts the checksum-verified OpenMRS 2.6.15 WAR specified by the official [Bahmni 1.2.0 release definition](https://github.com/Bahmni/openmrs-distro-bahmni/blob/1.2.0/distro/pom.xml).

### Isolated staging API checkpoint

- OpenMRS session and FHIR capability APIs return 200. FHIR2 and its additional extension report `started: true` through the module API.
- A direct API `EncounterBundle` transaction saved one consultation and a synthetic weight observation for `QorliaQA StageClinical Synthetic`. Subsequent FHIR and REST reads returned the weight and its consultation/visit association.
- A second transaction containing an invalid observation returned 400. Re-reading the test patient's encounters and observations confirmed unchanged counts, with no orphan encounter left behind.
- These direct API checks were not browser save proof. The 4 October checkpoint above adds populated observation, allergy and medication browser save/read-back evidence; it does not establish complete clinical parity.
- Metadata initialization completed but logged concept-import and location-attribute errors. Startup success does not establish that every Standard form, concept or workflow is available; those mappings still need targeted checks.

The production frontend build and local login tests pass. Bundles and service-worker precaching remain large (40.4 MB across 113 precached URLs); build success is not a performance release gate.

`/bahmni-v2/login` and `/bahmni-v2/home/` are the local review entry points. The local legacy home URL redirects there. Implemented module tiles stay within React; full legacy tools remain available where parity is incomplete. Check the detailed [feature parity ledger](FEATURE_PARITY.md) before switching production defaults.

Still needed: the remaining consultation transaction components on staging, specialized order-result forms and upload boundaries, remaining program lifecycle browser writes/retrospective dates, reports generation/download/deletion, administrative imports and order-set writes, remaining advanced OT/IPD/appointment actions, and role-specific permission/error checks.

OpenELIS laboratory, Odoo billing, DCM4CHEE radiology and the external analytics/outreach applications remain separate products. Reskinning this React repository does not redesign them. They are the next phase after React workflow parity.
