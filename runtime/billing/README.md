# Qorlia Billing adapter

Original LGPL-3.0-or-later integration code, with native Bahmni/Odoo permissions.
This is not an Indian chart of accounts or healthcare tax configuration.

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
Credit-note creation/reversal and editable draft corrections remain unfinished.

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
Tests require an isolated company with a chart, shop and synthetic data.

Provider/check/PDC payments, statement reconciliation,
partial/down-payment invoice allocation, stock/batch acceptance, POS, printouts
and Clinical-to-ERP synchronization still
require integration and end-to-end acceptance. Native reversal tests are not
proof of a React credit-note creation workflow. Do not use this review
build for real patients or accounting.
