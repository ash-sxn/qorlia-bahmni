# Qorlia Billing adapter

Original LGPL-3.0-or-later integration code, with native Bahmni/Odoo permissions.
This is not an Indian chart of accounts or healthcare tax configuration.

Latest checkpoint: native bank/cash history, complete versioned ledger and possible
matching items are integrated as three permission-scoped read APIs in signed-in
Billing. All 359 installed native tests and 396 Home tests/47 suites pass, along with
types/lint, seven gateway/config checks and direct development webpack. Protected
artifact `bank-read-20261010` matches all 83 chunks and packaged source/license
archive, with unchanged gates/expiry and blocked raw bank mutations. Native and
protected-browser reads verify synthetic entry #37 (INR 123.45), balanced
liquidity/suspense rows, candidate search/pagination and unchanged accounting/
protected-record/count snapshots. Mandatory analytic configuration is restored.
Complete totals fail on inaccessible ledger rows rather than silently omit them.
Company, journal and foreign values remain separate; stale cursor/version reads fail.
The archive includes pre-existing clinical edits and precedes final evidence notes.
Matching writes, partial allocation, fees/write-offs, recovery and safe undo remain
required. This read workspace does not complete bank matching or broader Billing.
Production/public demo are unchanged. Existing upstream/build limitations remain.

Earlier batch-report checkpoint: 347 installed native tests, 381 Home tests in 45 suites and
seven gateway/build-config tests pass, with types/lint and direct webpack.
Batch invoice PDFs use two scoped APIs and the installed native renderer, checking
every selected invoice/credit note before rendering. The UI supports one current
page (up to 25 documents), one combined PDF and a 10 MB limit. Real HTTP PDF and
financial/protected-state read-back pass. Protected artifact `invoice-batch-20261010`
passes access checks and matches all 83 chunks and packaged source/license archive.
The browser downloaded a visually checked two-page synthetic draft invoice/posted
credit-note PDF with unchanged native financial/ledger/reconciliation state,
protected records and financial/stock/mail counts. Gates/expiry are unchanged.
Packaged source includes pre-existing clinical working-tree edits and predates
final evidence notes, not a clean commit-only release.
Larger asynchronous batches and header/archive/currency variants
remain separate acceptance work.
The monetary editor is implemented and protected-browser draft save, add/remove
and accepted-response-loss recovery pass with independent native read-back.
Full pending reload and broader monetary/configuration/concurrency parity remain.
Financial rows and exact receipt share one native write; unexpected outcomes
roll back. Native simulation temporarily writes/rolls back SQL and consumes IDs.
New addons need fresh hook review. Existing upstream/build warnings remain.
Reviewed Cut-Off load/onchange/preview/save/status and exact-retry recovery are
integrated. Local browser save/read-back proves two balanced INR 125 entries,
unchanged source matching and one native match between the new accrual rows.
Protected artifact `reviewed-cutoff-20261010` passes hosted native API/access
checks and browser recalculation/review/guarded discard. All 83 chunks and source/
license notices match; gates, backends and expiry are unchanged. Independent
native reads after discard retain exactly two entries and one receipt, unchanged
source/protected records and financial counts. Published source precedes final
evidence notes and the journal-copy assertion fix, and includes pre-existing
clinical working-tree edits rather than a clean commit-only release.
Native cheque numbering/PDF/recovery is implemented below, but the
actual staging company has no bank-compatible cheque layout. The prior protected
browser save/reload and independent native readback confirm
one INR 100 synthetic PDC, INR 400 remaining, persisted references/effective date,
balanced entries and unchanged protected records. Native cheque void now has
protected browser save/full-reload/recovery/finish acceptance and independent
native readback with one exact receipt, unchanged financial/old-ledger values
and number, reopened refund/invoice/credit allocations and balanced entries.
The label-polished hosted build verifies all 83 chunks, source/licenses and
unchanged access gates. See the readiness/parity ledgers
for dated evidence and remaining gates. Older counts below describe earlier
checkpoints, not current total coverage or a product completion percentage.

## Customer payment history and state controls

Installment-credit checkpoint: the Qorlia-scoped adapter fixes the upstream
single-payment-term assumption by calling native reconciliation for each open
credit installment. Single-term and non-Qorlia behavior remains upstream.
All 283 native tests pass, including preservation of older independent
allocations, native non-unit exchange, exact retry and Reset. Three original
failure reproductions pass after the fix. Protected artifact
`installment-credit-20261010` is published with all 83 chunks, source/licenses
and native access boundaries verified; gates/expiry/backends are unchanged.
Hosted browser save/Confirm/Reset passed on synthetic #4500: invoice/credit
residuals 500/100 become 300/0 then return to 500/100. Independent native reads
verify one payment, exact post/reset receipts, four document terms, balanced
ledger and unchanged protected financial records and reconciliation/stock/mail
counts. No bank transfer occurred. Published source precedes this final evidence
note; no frontend or gateway API changes. Wider accounting/module parity remains.

Mixed-currency customer drafts now use installed Odoo conversion at the native
accounting date. Original document balances retain their currency; readonly
allocated/remaining amounts use payment currency. Native oldest-first allocation
and reconciliation remain. Rate/configuration-bound reviews and sorted locks
reject changed rates before Save or Confirm. No frontend FX or financial sudo.
Native non-unit-rate, third-currency, Confirm/reset, duplicate recovery and amount
limit tests pass. Local browser saved synthetic INR 100 draft #4083 against
USD 500 invoice/USD 100 credit. Readback verifies balanced ledger, exactly one
payment and unchanged document/protected balances and reconciliation/stock/mail
counts. Existing staging rates were used. Protected artifact
`payment-currency-20261010` is published with unchanged gates/expiry/backends.
All 83 chunks, source/licenses, secret-free archive and actual session/route
checks pass. Hosted browser review shows original USD balances beside INR
allocation and remaining amounts and balanced draft journal lines. Independent
native readback confirms no further financial changes. Published source precedes
this final evidence note; wider ledger/payment-term and cross-module acceptance
remains required. Production and shared demo are unchanged.

The local React candidate now connects New/Edit Draft and pending-save recovery
to six fixed native methods, including computed default/dependent-field onchange.
Unattached onchange avoids unlinking saved allocation rows. The house editor
shows native allocation/ledger review, readonly accounting-date/journal flags,
and exact persisted request recovery. Saving remains a draft operation, not
posting, reconciliation or a bank transfer. 273 native tests, 329 Home tests in
41 suites, seven gateway/webpack checks, types, lint and development build pass.
Candidate gateway methods are session-gated and narrowly allowed. Local browser
create/edit and lost-accepted-response/full-reload/identical-retry recovery passed
on synthetic #3817 (INR 125 then INR 175). Independent readback verifies exactly
one new payment/move and creation/edit receipts, balanced ledger and unchanged
protected balances/records and reconciliation/stock/mail counts. Network fault
injection was cleared. Protected artifact `payment-draft-editor-20261010` is
published with unchanged gates/expiry/backends. All 83 chunks, source/licenses,
secret-free archive and actual session/route boundaries verified. Published
source precedes this evidence note. Production and shared demo are unchanged;
mixed-currency allocation and wider parity remain
required. The following sections preserve earlier checkpoint evidence.

The standalone draft backend now adds create/edit, native dependent choices,
date/journal/bank/currency restrictions and exact author-bound save/status
receipts. Unique creation UUIDs and transaction locks prevent duplicate first
saves. Accepted retries return current state after later actions. Saving keeps
the payment in draft, its ledger balanced and existing document balances
unchanged, without posting or reconciling. Changed-only native writes avoid an
unchanged delegated company field resetting the selected journal. Read-back
must match reviewed fields/allocations/totals/native ledger, or it rolls back.
Edit roles/rules are checked before author-bound version comparisons.

Installed native suite: 265 tests, zero failures/errors/skips; mandatory analytic
plan restored and web restarted. Native HTTP #3433 create/edit/receipt recovery
and #3686 concurrent identical first-save checks pass. Two concurrent accepted
responses produce exactly one payment/move and no changes to protected balances
or reconciliation/stock/mail counts. React service validation has 19 new tests;
all 312 Home tests/40 suites, Home typecheck and touched-service lint pass.
No React payment editor or protected publication in this checkpoint. All five
candidate methods remain gateway-denied. Native dependent-field onchange,
browser editor/recovery, mixed-currency allocation and wider ledger parity remain
required. Production/public demo are unchanged.

Earlier preview-only checkpoint follows:

The next editor's backend load/preview foundation is installed only in isolated
staging. Virtual payment onchange generates native readonly invoice/credit rows;
saved rows are not attached or unlinked. Qorlia's server-owned payment context
uses company-scoped ORM balance sums with record rules instead of upstream
unscoped SQL. Native contexts outside that adapter path are unchanged.
Thirteen new installed tests cover native allocations, no writes, saved-row
preservation, company/record boundaries, draft versions, method validity,
permissions, invalid values and mixed-currency denial. HTTP preview/readback
retains the existing synthetic ledger, documents, counts and three receipts.
The protected gateway still denies candidate load/preview routes. Draft save,
native choices/date rules, React editor and exact-request/browser recovery remain
pending; this checkpoint does not publish those capabilities. Allocation rows
are capped at 500 per table, and mixed-currency automatic allocation requires
native review until verified. Production/public demo are unchanged.

The signed-in house Billing UI lists native customer payments with search,
draft/posted/cancelled filters and 25-row pagination. Unallocated payments are
included. Four `account.payment.qorlia_payment_state_*` methods load, preview,
run and check an exact action; `qorlia_payment_history` supplies the list.
Confirm, Reset to Draft and Cancel call the installed native methods without
financial `sudo`, raw browser mutation routes or automatic write retry. Posted
payments must be reset before cancellation. PDC uses this generic native
lifecycle, not the check-printing-only void action.

Active-company and native role/record rules, connected allocation review, locks
and ledger/financial checks apply. Native customer action context preserves
Bahmni's selected-credit auto-allocation. A context-cache refresh compensates for
the upstream computed flag's missing context dependency. Preview does not invoke
posting or consume native cheque numbers; actual native numbering/date decisions
are displayed after acceptance.

Author-bound exact UUID receipts commit with the action, prevent duplicate writes
and return current state after later transitions. The frontend persists uncertain
requests before submission, offers recovery independently of invoice allocation
history and requires explicit status checking/identical retry. Finishing requires
a fresh accepted status. These controls change accounting state, not funds, bank
stop-payment or clearance. Protected browser Confirm, Reset to Draft and Cancel
passed on synthetic PDC payment #2720. Independent native readback found exactly
three receipts, balanced entries, unchanged financial/old-ledger values and
protected records/counts. Confirm allocated the selected INR 100 credit and
payment against an INR 500 invoice, leaving INR 300 open; reset reopened the
invoice and credit to INR 500/INR 100, then cancellation retained payment history.
Full reload/status/finish recovery passed after confirmation and cancellation
without duplicate writes. All 83 hosted chunks, source/licenses and unchanged
access gates verified; published source precedes the final evidence note.
Standalone payment editing/selection, bank matching, providers and wider parity
remain open. Production/public demo are unchanged.

## Native cheque printing

Cheque void uses four separate `qorlia_cheque_void_*` methods: load, preview, run
and status. They call installed native `action_void_check` only for posted sent
customer check-printing bank payments. PDC cancellation is a different workflow.
Native read/write rules, company scope, connected reconciliation locks and
balanced-ledger checks apply without financial `sudo`. Review binds payment,
selected credit allocations, exchange/cash-basis entries and configuration;
the connected graph is capped at 1,000 journal lines. Unreconciled selected drafts
are reviewed but do not block void or change their state.

Atomic author-bound UUID receipts preserve exact-request recovery and prevent
repeated native cancellation. Existing cheque number, financial fields and
old-ledger values must remain unchanged. Pending requests persist before write
and recover even after cancelled payments leave reconciliation history. Status
checking/identical retry are explicit. Accepted requests require fresh status
before finishing and reloading the invoice. Void does not send a bank
stop-payment instruction, refund money or delete payment history. Installed tests
include actual native cash-basis reversal and selected-credit reopening. Protected
browser save/reload/recovery/finish and independent native readback passed.
The final label-polished package verifies all 83 chunks and access gates; its
source archive precedes the final browser-evidence documentation note.

Sent-state actions are separate: `qorlia_cheque_sent_load`, `preview`, `run` and
`status` call native `mark_as_sent`/`unmark_as_sent` for posted customer cheque/PDC
bank payments. Current review, permissions, company scope and balance checks
apply even when no printing layout exists. Exact author-bound UUID receipts
make retries idempotent; old accepted requests never overwrite a later status.
The financial snapshot and cheque number must remain unchanged. The Qorlia modal
persists uncertain requests before sending and requires explicit check/retry,
then fresh read before finishing. Sent is not printed, delivered or bank-cleared.
Unmark warns about eligibility for another print review. Native cheque void is
described above; generic PDC accounting cancellation is covered by the payment
lifecycle checkpoint, not bank stop-payment or clearance.

Six named `account.payment.qorlia_cheque_*` actions provide `load`, `preview`,
`print`, `status`, `download` and `download_current`. Only posted customer
cheque/PDC bank payments are accepted, with native read/write rules, company scope,
balanced-ledger checks and payment/journal/company locks. Layouts must resolve
from the native company selection to an authorised account-payment QWeb report.
No arbitrary report, caller context or elevated financial mutation is accepted.

The native manual-sequencing journal preserves its already assigned number.
Preprinted stationery requires a reviewed numeric number and uses the installed
prenumbered-cheque wizard. The old extension's incompatible `print_checks`
entry point is not called. Native numbering, sent state, financial-state equality,
valid PDF and an exact author-bound UUID receipt commit atomically or roll back.
Duplicate writes and accepted/current downloads never re-number the payment.
The UI stores the exact request before writing and offers explicit status checking
or identical retry after response loss, never an automatic write retry.

The native 202-test suite includes actual synthetic QWeb/PDF generation. That
fixture is labelled NOT A BANK CHEQUE and rolls back; it does not install a real
bank layout. Staging currently offers only the disabled layout, so operational
printing remains unavailable until an administrator verifies the appropriate
bank report and stationery. PDF generation and marked-sent state do not establish
physical printing, deposit or clearance. Batch, PDC cancellation, bank matching,
payment providers and remaining financial parity still require implementation.

## Cut-Off integration and native contract

Six named `account.move.qorlia_cutoff_*` methods expose load, choices, onchange,
preview, save and status with fixed company/source context. The React journal
offers the action only on native-eligible posted revenue/expense items. The
house-design modal requires review of both entries and default-setting effects
before Save. A reconcilable accrual account may match the two new posted accrual
rows to each other; this effect is disclosed and does not match the source invoice.
Server-owned review/configuration locks and author/payload-bound UUID receipts
provide exact status/retry recovery without duplicating the native execution.

The 14 integration cases cover permissions/company/source identity, stale review,
native amount onchange, field/date/percentage validation, fiscal locks, credit
signs, source invariants and rollback, exact retries, future scheduling and
reconciliation confined to generated accrual rows. The full suite passes all
308 tests with zero failures/errors/skips. Local synthetic browser save and
independent read-back/status/retry confirm two balanced INR 125 entries, one
receipt, unchanged source amounts/state/matching and protected records, and no
payment/stock/mail changes. The selected accrual account is a staging fixture,
not a recommended Indian production chart of accounts. Hosted native API/session/
route checks and browser recalculation/review/discard pass on the protected
`reviewed-cutoff-20261010` artifact. Native read-back/status/exact retry after
discard confirms no extra entries or changed source/protected records and counts.
No production/public-demo change was made. Wider journal/Billing/module parity
is still required.

The installed native invoice journal view exposes `action_automatic_entry` on
posted income/expense items with `default_action=change_period`. It opens
`account.automatic.entry.wizard`; this is revenue/expense recognition, not a
change to the invoice due date or payment collection. The wizard requires posted,
unreconciled source items from one company, validates percentages and lock dates,
and supplies its own onchange and generated-move data.

Native virtual-record preview rounds the adjusting amount in company currency
and each generated transaction amount in its own currency. It creates no saved
wizard or entries and does not change company defaults. Native execution creates
the recognition entry plus the original-date adjusting entry, retains the source
invoice's monetary rows and balances, and posts or schedules entries using native
date rules. Creating the saved wizard updates the company's default automatic-entry
journal and the selected accrual account through native inverse methods. Those
configuration effects must be shown and permission-scoped, not hidden behind a
button. The native action itself has no identical-request duplicate protection.

Five `NativeCutoffContractTest` cases pin those behaviors against the installed
Odoo source, including amount onchange, foreign-currency rounding, locked dates,
draft/reconciled rejection, future-date scheduling and repeated execution. Their
full isolated suite passes all 294 tests with no failures, errors or skips.
Installed test/init hashes match the worktree. The staging service is running
again, the analytic setting was restored, and independent native/hosted reads
retain the synthetic saved label, exact receipt and protected balances/counts.
Those 294-test results describe the earlier contract-only checkpoint. The
subsequent integration described above binds source, entries and defaults to a
server-owned review, native ACLs/rules/locks and atomic exact-request recovery.

Inspected source: `account/wizard/account_automatic_entry_wizard.py`, its view,
`account/models/account_move_line.py::action_automatic_entry` and
`account/views/account_move_views.xml` in the isolated Billing image
`bahmni/odoo-16@sha256:b3afea0fd5c6b8a6e3f7e70d01306d456c2c9cd1bcf03c17fda9cb52f47e2de8`.
Wizard source SHA-256:
`88295cb24991045fe5332f6a5165e3b9303a3d29aa27e0b5b89eb6ba293d213d`.
No production or shared-demo configuration was changed.

## Invoice journal details

Six named `account.move.qorlia_journal_edit_*` methods provide `load`, `choices`,
`analytics`, `preview`, `save` and `status` for an existing customer invoice/credit journal
item. Editing requires draft or posted state, native invoice/line write rules and the
invoicing group. No financial `sudo` is used. The exact editable fields are
`name`, `account_id`, `date_maturity`, `tax_tag_ids`, `analytic_distribution`,
`discount_date` and `discount_amount_currency`. No caller context or arbitrary
line command is accepted. Generated adjustments remain in the invoice editor.

Account choices preserve native receivable/non-receivable category and company;
grids preserve the invoice tax country. Analytic visibility/editing requires the
native analytic accounting group; existing hidden distributions are preserved.
The `analytics` action uses installed native root-plan applicability, invoice
company/business domain and the selected financial account. Only selected native
account IDs and bounded searches are accepted. Missing, denied or foreign
accounts never cause an allocation to be silently removed. The UI uses named
plan/account choices, percentages and per-plan totals rather than JSON. Existing
combined keys are preserved; new UI selections use individual account keys.
Review binds plan rules and account labels as well as the selected records.
Dates, percentages and selected native records are validated. Reviews bind the
invoice/lines and selected accounting configuration without writing records.

Explicit save locks the invoice/lines, rechecks the review and calls native
invoice write. Posting/payment state, monetary totals/entries, partial/full
reconciliation links, all other lines and unreviewed detail
changes must remain unchanged or the transaction rolls back. Canonical UUID,
exact payload and author bind an atomic invoice receipt. Status and identical
retry return current native detail values when that receipt exists, including
after a later authorised posting. They do not restore an old version or post.
A missing receipt never proves a delayed save stopped. The UI stores the exact
request before sending, freezes uncertain saves and offers explicit checking or
same-request retry. There is no automatic financial write retry.

The posted-metadata checkpoint has 289 native tests and 334 Home tests passing.
Native tests retain fiscal locks, protected hashes and paid/reconciled history.
Local browser label save/full reload on synthetic invoice #24525/item #63988
and independent native reads verify one receipt, balanced entries and unchanged
state, amounts, matching, protected records and counts. Discount amounts use
the actual transaction currency. Protected artifact `posted-journal-20261010`
is published with unchanged gates, expiry and backends. All 83 chunks,
source/licenses and secret-free source archive match; native load/preview and
session/route denials pass. Hosted browser loaded the posted editor, reviewed
and discarded a label change without saving. Independent native reads confirm
unchanged balances, state, matching, protected records/counts and one exact receipt.
Published source precedes this final evidence note and contains pre-existing
clinical working-tree changes, not a clean commit-only production release.

Earlier draft/analytic checkpoint: 186 passing native tests with no failures/errors/skips. Home:
240 passing tests. The prior HTTP concurrent/save/status and protected browser review/save/
reload acceptance preserve a balanced INR 250 synthetic draft, all other items,
payment/stock counts and protected invoices. Protected browser review/save/full
reload now retain named outpatient 70% and laboratory 30% allocations on the
synthetic draft, with independent native readback confirming unchanged money,
other items/counts and protected documents. Initial hosted source/license and
83 chunks match. Fault-injected response-loss browser tests remain pending.
Compound draft preservation does
not establish Odoo 16 compound posting compatibility. Monetary journal edits, adding/removing rows,
and cut-off actions remain separate parity work. Posted metadata editing is
covered above; this is not full monetary journal parity.

## Invoice Journal Items

The 10 October monetary contract suite adds nine native tests, bringing the
installed adapter suite to 317 passing tests without failures/errors/skips.
Installed desktop/mobile views and native monetary writes are inspected directly.
Company-currency onchange totals can differ from the actual saved total, while
ledger changes can preserve the product price. Read-only onchange alone is not
a trustworthy financial review. These tests pin the behaviour before monetary
API/UI implementation; they do not add monetary editing, row creation/removal or
claim full journal acceptance. The protected build/source archive is unchanged.

`account.move.qorlia_invoice_journal` reads an authorised customer invoice or
credit note's native financial journal items. It accepts only `invoice_id`, an
optional native line-ID cursor and a snapshot version. Ordered pages contain up
to 100 rows; company-currency totals cover all authorised financial entries.
Changed snapshots and foreign cursors require a fresh reload. Sections and notes
are excluded, while legacy false display types remain valid financial rows.

Internal Billing access, native invoice/line ACLs, record rules and company scope
are required. A scoped ID-only SQL query prevents a native one-to-many read from
silently filtering denied lines; every resolved line is checked before field or
total reads. Tax/grid reads retain their native checks. Analytic distribution is
returned only to the native analytic accounting group. There is no financial
`sudo`, journal mutation, posting or reconciliation method in this view.

Installed native suite: 168 passing tests, no failures/errors/skips. Home: 219
passing tests. Native/HTTP checks cover paging, stale versions, access denial,
foreign currency, drafts and credits, actual ledger equality and no financial
writes. Protected browser open/reload and matching source/build verification are
recorded in the readiness ledger. The later checkpoint adds narrow-screen
keyboard scrolling and draft detail editing above. This read-only method itself
still performs no mutation; full native journal editing is not completed parity.

## Invoice conversation and internal notes

`account.move.qorlia_invoice_messages` returns native invoice messages/change
history in descending 30-row cursor pages. Reads require an internal account,
native invoice/message permissions and company/record rules. Native formatting
filters restricted tracked fields. Returned message bodies are plain text, with
explicit shortening above 20,000 characters. Attachments have named download
controls which recheck invoice/message/file membership, parent association and
native attachment permissions. Binary content is downloaded as octet-stream,
never previewed inline, up to 10 MiB; larger files require native Billing for now.
Validated native HTTP/HTTPS URL attachments open externally, without server fetch.

`qorlia_invoice_note` posts a fixed internal `mail.mt_note` using the authenticated
author and native invoicing write rights. Notes accept up to 5,000 plain-text
characters, a canonical UUID key and optional `uploads` entries containing only
`name` and canonical base64 `content`. Require text or at least one file. Up to five
files/10 MiB total are checked and saved atomically using native posting, with
original image bytes preserved. Native attachment create rights and invoice write
rules are checked first. No author, recipients, existing attachment IDs, resource
binding or subtype override is accepted. Native internal followers may receive queued notifications, but
external/portal followers do not. A real deployment must configure authorised
authors' native email addresses. The isolated QA address is deliberately `.invalid`.

Identical keys/text/files/invoice/author return the same message. Names, order,
byte count and SHA256 content digests bind uploads; old text-only hashes remain
compatible. Native attachment metadata is ID-sorted for stable retry replies.
PostgreSQL uniqueness
and native serialization retry protect concurrent saves. `qorlia_invoice_note_status`
returns a matching saved note when visible. A negative status is not proof that
a delayed save cannot finish, so React keeps the original key/text frozen and
offers explicit same-request retry rather than generating a replacement request.
No automatic write retry, silent draft discard or accounting mutation occurs.

Home passes 189 tests. The exact installed native attachment suite passes 143
tests with zero failures/errors/skips. Concurrent HTTP save/status returns the
same ID-sorted message/files without duplicate persistence or financial changes. Native
tests cover atomic rollback, exact retry, original binary/empty files, unsafe
links/names/base64, company/read-only denial and scope checks. The review gateway
blocks raw mail/file methods and context overrides. Note/status requests alone
have a 15 MiB JSON bound, after authentication; other calls retain 32 KiB.
Protected browser downloads match the actual 40,065-byte and zero-byte native
originals. Browser upload/save/reload acceptance remains pending because automation
cannot complete the file chooser. The readiness ledger distinguishes this missing
populated check from the passing mocked upload/recovery tests.
Attachment deletion/large-file delivery, malware scanning, external email,
followers/activities and full chatter/Billing parity remain pending.

## Customer account statement

`account.move.qorlia_customer_statement` accepts only a saved customer invoice
ID and exact ISO accounting dates. The invoice fixes the commercial customer
and company; no caller context, partner or company override is accepted.
Native posted receivable journal lines supply dated opening, debit, credit and
running/closing balances. Original document-currency amounts are retained
beside company-currency totals. Drafts/future entries are excluded; paid bills,
credits and unallocated receipts remain visible. This is not bank reconciliation.

Native Accounting Readonly access, read ACLs and company/record rules apply.
Billing Administrator in the pinned invoicing-only image does not imply that
read role. Deployment operators must assign it deliberately to authorised
accounting users, not weaken the endpoint. Related unbalanced journals and
histories above 2,000 entries fail explicitly. There is no silent truncation or
write. The React modal loads only on request and keeps submitted period labels
separate from subsequent, not-yet-loaded date edits.

`account.move.qorlia_customer_statement_download` adds a fixed, non-cached QWeb
PDF for the explicitly loaded period. The template rechecks ledger permissions
and scope, prints company-currency totals and original document amounts, and
retains the native hospital header/footer. Caller rows, balances, report names
and context are not accepted. PDF bytes are bounded at 10 MiB and validated.

Native suite: 124 tests with zero failures/errors/skips. Home: 165 tests.
Actual HTTP/text/visual checks verify four PDF periods against
journal entries, including opening 500, credit 100 and closing 400, without
changing financial snapshots/payment count or caching an invoice attachment.
Protected browser delivery and artifact/security checks are recorded in the
readiness ledger. Long-ledger pagination, other hospital layouts, complete
report-layout reskin and wider Billing parity remain open.

## Standalone customer invoice creation

The signed-in Invoices panel's New invoice action uses the same editor and four
named native methods below with `invoice_id: false`. The native form determines
defaults and product/customer onchanges. Incomplete previews return a warning
without a reviewed-save token. Valid saves create an unposted customer invoice,
subject to native create ACLs and company rules, reviewed totals and balance.

New saves require a canonical UUID `request_key`. Its locked request digest and
database uniqueness make identical retries return the same draft. Reusing a key
for changed values, another user or company is rejected. PostgreSQL serialization
retry through native Odoo requests resolves concurrent repeatable-read snapshots.
The UI never automatically retries a write: an unconfirmed creation freezes
entries and provides an explicit identical retry. Closing/reconnecting warns to
check existing invoices before starting another creation.

All 92 native tests and 132 Home tests pass, alongside seven gateway/webpack
checks. Actual concurrent HTTP saves created one draft #4005. Browser creation
and full reload verified #4038 at INR 1,150 with quantity 2, native unit price
INR 500, reference and note. Independent reads confirm a balanced draft journal,
no attached payment and retained protected bill amounts. Staging's 15% tax is
synthetic configuration, not an approved Indian healthcare tax rule. Production
and the shared demo remain unchanged.

## Existing invoice and credit-note draft editing

`account.move.qorlia_invoice_draft_load`, `preview`, `save` and `choices` are
verified backend methods for existing customer invoice and credit drafts,
including credits and replacement invoices produced by the reversal workflow.
Their React editor and named review-gateway exposure are now released to the
protected tester build, not production. Select an existing draft invoice or
credit in signed-in Billing, then use its Edit draft action. The editor reuses
Qorlia controls and displays native preview totals before enabling save.

Hosted save/reload verified synthetic draft #2735 at INR 750 with reference/note
and draft credit #1808 at INR 250. Native read-back confirms both remain drafts
with balanced journals, no new payments and unchanged original/unrelated bills.
That earlier checkpoint had 126 Home tests, 52 shared API/authentication tests,
seven gateway/webpack checks and 86 native adapter tests. The creation checkpoint
above records the latest expanded Home/native test suites.

The adapter uses native onchanges and the pinned Odoo tax-total form widget for
virtual preview. A virtual invoice's old journal lines must not supply its
preview total: changing quantity otherwise displays an obsolete grand total.
Native included/global tax rounding, cash rounding, early discounts, currency,
payment terms and account mapping remain Odoo responsibilities. The preview
does not persist drafts, journal lines or wizards. The saved native totals are
checked against the reviewed preview and balanced-ledger invariants.

Generated discount/rounding rows are excluded from caller-editable lines and
rebuilt through shared adjustment values. Editable manual service lines are
allowed without inventing a product, matching the native invoice form. Writes
send changed fields only so metadata edits do not reset manual taxes or prices.
Company/type cannot be changed; a previously posted draft retains its journal.
The native `round_off_amount` remains inherited and read-only in this editor.

Native groups, ACLs/rules, source ownership, payload limits, source/configuration
versions and move/line locks protect saves. Choice searches use the invoice
company and native field domains. A used source version must be reloaded;
uncertain replies must not automatically retry a save. More than 500 editable
lines or 1,000 journal lines requires native Billing review, not truncation.
Saving a draft does not post it, issue a refund, create a payment or return stock.
Native scheduled posting settings remain explicit document fields, not a promise
that a save immediately affects a posted customer balance.

Arbitrary journal editing and native print/email/chatter remain parity work.

## Discount and rounding accounting

The pinned Bahmni Odoo 16 image rewrites the full customer receivable for discount
and rounding in `bahmni_account.action_post` without counterpart entries. Its
`_check_balanced` also omits the native rejection. This adapter restores the
currency-rounded balance check and replaces that specific receivable rewrite.
The subsequent Sale and Odoo posting hooks remain active. Recheck the model
inheritance chain and these tests when upgrading the underlying image.

Before native `_post`, draft customer invoices and credit notes receive explicit
tax-free product adjustment lines, marked by `qorlia_adjustment_kind`:

- Discount: negative unit price, on the selected native `disc_acc_id`.
- Rounding: signed unit price, on company `qorlia_rounding_account_id`.

Odoo calculates payment terms, currency conversion, residuals and journal entries
from these lines. Every installment is calculated by the native payment-term
engine, rather than assigned the whole invoice value. Tax is retained on the
original items, matching Bahmni's after-tax document discount. The accounting
treatment and accounts must be reviewed by the deployment's accountant.

`invoice_total` accounts for applied lines exactly once. `qorlia_item_subtotal`
exposes the original item subtotal for the Qorlia details view. Adjustment rows
are excluded from its product-item table because they already appear in the
document discount and rounding breakdown. Native journal views still show them.

The adapter rejects invalid, deprecated and cross-company adjustment accounts,
discounts above the gross total, and simultaneous Bahmni/manual and native cash
rounding. A company rounding account must be configured explicitly by an
authorized operator. No suspense account or automatic account selection is used.
An existing unbalanced invoice is rejected, not silently repaired. Reversal
copies the line markers; draft reset/reposting replaces adjustment rows rather
than duplicating them. Historical posted records are not migrated.

Upgrade the addon with Odoo's module upgrade process before serving the updated
frontend. This creates the company account and invoice-line marker fields.
Keep a database and addon backup. If rolling back the frontend, retain the
accounting adapter on databases containing posted adjustment lines: reverting
the old invoice-total formula would subtract those discounts twice.

## Saved order and posted payment PDF reports

`sale.order.qorlia_order_report_list/download` expose the installed quotation,
pro-forma and discount-summary variants, subject to their native report groups.
`account.payment.qorlia_payment_report_list/download` expose Payment Receipt,
Receipt and Receipt Summary for posted customer payments/refunds only. Fixed
report/template maps, record ACLs/company rules, balanced journals, applied
invoice adjustments, safe filenames and a 10 MiB PDF bound remain enforced.
No arbitrary report IDs, raw financial mutations or caller context are accepted.

The adapter inherits native sale tax totals to include saved Bahmni document
discount/chargeable overrides and rounding in quotation/pro-forma totals. It
replaces the hospital receipts' unrelated latest-invoice/unset-balance lookup
with actual reconciled invoices/credits and native per-invoice-currency partial
amounts. Detailed receipts retain item/batch/expiry/quantity/price/discount/tax
information; summaries identify recorded services without pretending that every
generic care category was billed. Company layout and native report actions are
retained. Remaining balances are current document residuals, not a reconstructed
historical customer statement or bank-clearance assertion.

Hospital receipt archives retain native reuse with versioned snapshot filenames
that change when payment/document/reconciliation metadata changes. Pre-fix and
earlier balance snapshots are preserved but not reused for current reports.
Printing may create a PDF attachment but must not confirm/post/pay/move stock.
This module explicitly depends on the installed reconciliation add-on and loads
its inherited report views via the normal native module upgrade.

Verification on 10 October: 110 independent native tests with zero errors,
failures or skips, actual HTML templates and ten HTTP PDFs with saved totals and
residual checks. Order INR 920, receipt INR 500/100/400 and refund INR 475/100/375
match native records; financial snapshots/payment counts unchanged. React Home
149 tests and seven gateway/webpack checks pass. This does not establish full
print-layout reskin, statements, bank matching, stock/feed or whole Billing
acceptance. Production/shared demo are unchanged.

## Reviewed payment registration

The three named `account.move.qorlia_payment_*` actions load, preview and record
the native `account.payment.register` wizard. They keep its computed journal,
method, date, currency, recipient bank, difference settlement and early-discount
behavior. Load/preview do not persist a wizard or payment. Recording locks the
invoice and receivable lines, rejects a stale invoice/configuration snapshot,
uses native creation/posting/reconciliation and checks the payment ledger.
Native access controls remain in force, without `sudo` or caller accounting
context. Simultaneous duplicate requests cannot create a second payment against
the same reviewed balance. The React form never automatically retries a write.

Manual full/partial receipts, credit-note disbursement and difference-account
settlement are supported. Excess stays as unapplied payment credit, not an
automatic allocation to another invoice. Native invoice status is not bank
clearance: Community Odoo can report `paid` with an unmatched bank payment.
History exposes native `is_matched` separately for bank journals.

Native cheque (`check_printing`) and post-dated-cheque (`pdc`) recording also
use the installed wizard. Bank/cheque references and an optional effective date
are editable; PDC requires that date. Dates and bounded text are server-validated.
Native method definitions bind review so a changed method code rejects recording.
The adapter explicitly depends on the installed `base_accounting_kit` extension
for these fields and wizard hooks; it does not copy or replace its accounting.

Installed Odoo 16 posts the journal on the payment date, not the effective date.
The effective date is metadata here, not scheduled posting, deposit or clearance.
The UI explains this and displays native method/references/effective date and
pending bank matching in saved history. Printing/sent-state and bank-statement
matching still need their separate native workflow integration. Provider
transactions are unavailable. Recording does not charge a card, transfer bank
funds or print a cheque.

## Reviewed outstanding credit allocation

The named `qorlia_credit_load` and `qorlia_credit_apply` actions use Odoo's native
outstanding-credit/debit widgets and `js_assign_outstanding_line` reconciliation.
The React dialog requires an explicit source review and shows native reconciled
history. Applying an existing receipt or credit note does not create another
payment or move real money. Remaining amounts stay open under native accounting.

Native ACLs and record rules apply without `sudo`. Both documents and journal
lines are locked in deterministic order. Versions cover the target invoice,
source ledger, account eligibility, company locks and currency configuration.
Stale, wrong-customer, already-used and unbalanced sources are rejected. The
gateway blocks direct native reconciliation and removal methods. Failed or
uncertain replies require a fresh status read, never an automatic write retry.
The read uses Odoo's compute protection: directly invoking its widget compute
method outside that protection changes `write_date` and invalidates a review.

More than 200 outstanding or reconciled items requires native Billing instead
of truncating the choices. This adapter is not a substitute for accountant review.

## Reviewed reconciliation removal

The named `qorlia_credit_remove` action delegates one reviewed history item to
native `js_remove_outstanding_partial`. It reopens affected residuals without
deleting invoices, credit notes or posted receipts, creating payments or moving
real money. Native unlink/reversal handles full reconciliation, related exchange
and cash-basis entries. Currency-exchange history rows cannot be selected directly.

The review version includes the connected reconciliation graph and accounting
configuration. Native ACLs/record rules, deterministic document/line locks and
a post-lock snapshot reject stale, unrelated, unauthorized and repeated requests.
Balanced-ledger checks run before and after the action. Direct native removal
methods remain blocked at the gateway; uncertain replies require status read-back.
Bank-statement matching is a separate unfinished workflow.

## Reviewed invoice reset and draft cancellation

The named `qorlia_correction_load` and `qorlia_correction_run` actions review
and delegate to native `button_draft` or `button_cancel`. Reset can release
allocations and remove analytic entries, while native accounting handles
exchange/cash-basis effects. Existing posted receipts and credit notes are not
deleted or automatically reapplied. Cancellation is restricted to draft state
and disables scheduled posting. Cancelled documents can be restored to draft
where native permissions and journal configuration allow it.

The version includes invoice state, connected reconciliation, analytic entries,
company lock dates and protected-journal configuration. Native ACLs/record rules,
deterministic move/line/partial locks, post-lock version checks and balanced-ledger
guards remain active without `sudo`. Protected journals and native fiscal/tax
period checks are not bypassed. Reviews above 1,000 connected journal lines or
200 allocations require native Billing instead of partial display.

The React UI requires a separate review/confirmation, shows reset consequences
and current allocations, and never retries uncertain writes. Reset/cancel does
not issue a refund, transfer money, return stock or cancel a sales order.
Editable draft corrections are covered by the draft editor described above.

## Reviewed credit-note creation and reversal

The named `qorlia_reversal_load`, `qorlia_reversal_preview` and
`qorlia_reversal_run` methods use the pinned native `account.move.reversal`
wizard and `reverse_moves`. An editable credit stays in draft. Full reversal
posts/reconciles the credit with the original invoice and releases prior
allocations, retaining posted receipts. The replacement option also copies a
separate draft invoice. A future date schedules native posting and does not
reduce the original invoice balance now. Original-entry date mode uses the
native journal date. Accounting period rules can adjust the journal entry date
when posting. Fully allocated invoices retain the native editable-credit-only
choice. This workflow does not move/refund cash, return stock or cancel orders.

Load/preview persist no wizard or financial record. Native access controls and
company rules apply without `sudo` or caller context. Journal eligibility,
balances, invoice and connected reconciliation state, previous credit notes and
relevant company/tax/account/currency/payment-term configuration are reviewed.
Deterministic move/line/partial locks and a fresh post-lock snapshot reject stale
or repeated confirmations, including concurrent creation of an editable credit.
Native creation and all affected ledgers are checked before returning success.

The React form requires an explicit preview, clears it on edits, prevents
duplicate saves/closing during writes and requires read-back after uncertain
responses. Drafts have distinct record-ID labels until Odoo assigns a number.
More than 100 linked credits or 1,000 connected journal lines requires native
Billing review, rather than truncated evidence. Partial credit editing and
replacement draft editing are covered by the draft editor described above.

## Native customer invoice PDF reports

The named `qorlia_invoice_report_list` and `qorlia_invoice_report_download`
methods expose only the installed Invoices and Invoices without Payment
customer-report actions. Native invoice/report ACLs, report groups and company
rules apply. Download locks the invoice and journal lines, verifies balanced
accounting and saved document adjustments, then delegates to native
`ir.actions.report._render_qweb_pdf`. No arbitrary report/template or caller
accounting context is accepted. PDF bytes and filenames are bounded/validated.

Printing does not post, pay, allocate or refund. The native report engine can
create its standard PDF attachment. The React modal requires an explicit click,
blocks duplicate downloads/closing during generation, preserves failures for
explicit retry and reconnects an expired session. It prints the saved record,
not unsaved draft-editor values. Raw rendering/report routes remain blocked.

Staging needs `report.url` to address the native HTTP service from inside its
container. This prevents the browser/forwarded QA-login host from becoming an
unreachable asset base for wkhtmltopdf. No public native Billing port is needed.
Actual native HTTP and hosted browser files cover drafts, posted invoices and
credit reports, with financial state unchanged. Native PDF layout is retained;
quotation, receipt/statement printing and complete layout reskin remain.

## Advance invoices and regular-invoice deduction

Confirmed charge orders expose the native percentage/fixed down-payment wizard
through `qorlia_advance_load`, `choices`, `preview`, `save` and `status`. Preview
uses virtual native records; explicit save creates a draft advance invoice, not
a payment or delivery. Native product/tax/fiscal mapping and balanced document
adjustments apply. First-use account/tax choices are company-scoped; selecting
the deposit income account requires an accounting manager. Existing deposit
products retain their configured account/taxes instead of accepting overrides.

Each reviewed save has an exact request key and payload hash. The native unique
key, order locks and serialised first-use configuration prevent duplicate or stale
saves. The frontend keeps uncertain requests in same-tab storage scoped to Billing
user and order across reload/sign-in. Status checks are read-only; a missing result
is inconclusive. Explicit same-request retry is available, never automatic retry.

Regular invoicing offers native `deduct_down_payments`, checked by default when
down-payment lines exist. Unchecking warns that advances will not be deducted.
Only a strict boolean is accepted, and order status versions bind down-payment
presence. Native ordered/delivered quantities and negative-balance credit notes
are retained. Creating an advance invoice is distinct from paying or allocating it.

The pinned Bahmni `_create_invoices` copy attempts to post every linked invoice,
including already-posted advances. The adapter skips that copy while retaining
native Odoo creation and Bahmni preparation hooks. Configured automatic posting
applies only to newly returned draft invoices under the caller's identity.
Existing draft/posted advances remain unchanged. Revalidate this override against
upstream source and the accounting/discount/rounding/stock suite before upgrades.

The 10 October checkpoint has 157 native tests and 206 Home tests. Actual HTTP
and protected browser saves produce INR 300 with deduction and INR 500 without
against INR 500 synthetic orders with INR 200 posted advances. Browser reload
retains both results; independent native reads confirm balanced entries, no
duplicates and unchanged payments, stock and protected financial documents.
Fault-injected browser recovery and first-use account/tax browser acceptance
remain pending. These selected checks do not establish complete Billing parity.

## Verification and scope

The `tests` package covers native draft/order workflows and customer posting,
including fixed/percentage discounts, both credit-note signs, upward/downward
rounding, installments, foreign currency, reversal, reset/repost, invalid
configuration, stale requests, unauthorized access and unbalanced history.
Payment checks also cover partial/full receipts, refund direction, installments,
currency conversion, write-off accounting, excess credit, ordinary cashier
rights, separate bank matching and rejection of stale/repeated requests.
Credit checks cover credit-note/debit allocation, excess receipt credit, native
foreign-currency conversion, ordinary cashier rights, source/target staleness,
read-only version stability and unbalanced-source rejection. Removal checks cover
partial/full allocations, retained posted receipts and unrelated allocations,
cashier rights, credit-note perspective, currency conversion, exchange/cash-basis
reversals and stale/repeated/unauthorized requests.
Correction checks cover reset/cancel/restore/repost, scheduled posting, retained
receipts and unrelated allocations, foreign-currency exchange reversal, protected
journals, locked periods, cashier/read-only/company boundaries, stale/repeated
requests and unbalanced-ledger rejection. HTTP and hosted browser checks verify
state read-back, retained receipts, no automatic reallocation and duplicate
request rejection on isolated synthetic records.
Credit-creation tests cover all native reversal choices, future/original-entry
dates, retained partially allocated receipts, fully allocated restrictions,
discount/rounding and foreign currency, cashier/read-only/company boundaries,
stale/invalid reviews and unbalanced sources. HTTP concurrency creates one
credit and rejects the duplicate. Hosted browser tests verify read-only preview,
posted reversal, replacement draft, balanced journals, no new payment and reload.
Tests require an isolated company with a chart, shop and synthetic data.

Provider collection, cheque printing/sent-state, deferred PDC posting and statement reconciliation,
partial/down-payment invoice allocation, stock/batch acceptance, POS, remaining printouts
and Clinical-to-ERP synchronization still require integration and end-to-end
acceptance. Existing/new invoice and editable credit-draft workflows have the
selected acceptance evidence above, not full native-form parity for every case.
Selected native and browser checks are not full Billing acceptance. Do not use
this review build for real patients or accounting.
