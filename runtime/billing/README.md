# Qorlia Billing adapter

Original LGPL-3.0-or-later integration code, with native Bahmni/Odoo permissions.
This is not an Indian chart of accounts or healthcare tax configuration.

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

Provider transactions, checks and post-dated checks require additional native
workflows and are explicitly unavailable in this form. Recording a payment
does not charge a card or transfer money from a bank. Customer bank-statement
matching is not implemented in the React UI.

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

Provider/check/PDC payments, statement reconciliation,
partial/down-payment invoice allocation, stock/batch acceptance, POS, remaining printouts
and Clinical-to-ERP synchronization still require integration and end-to-end
acceptance. Existing/new invoice and editable credit-draft workflows have the
selected acceptance evidence above, not full native-form parity for every case.
Selected native and browser checks are not full Billing acceptance. Do not use
this review build for real patients or accounting.
