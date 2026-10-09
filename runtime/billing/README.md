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

## Verification and scope

The `tests` package covers native draft/order workflows and customer posting,
including fixed/percentage discounts, both credit-note signs, upward/downward
rounding, installments, foreign currency, reversal, reset/repost, invalid
configuration, stale requests, unauthorized access and unbalanced history.
Tests require an isolated company with a chart, shop and synthetic data.

Payments, reconciliation, refund disbursement, partial/down-payment invoice
allocation, stock/batch acceptance, POS and Clinical-to-ERP synchronization still
require integration and end-to-end acceptance. Native reversal/reset tests are
not proof that those actions are available in the React UI. Do not use this review
build for real patients or accounting.
