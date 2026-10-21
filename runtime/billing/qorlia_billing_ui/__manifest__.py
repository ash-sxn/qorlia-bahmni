{
    'name': 'Qorlia Billing UI adapter',
    'version': '16.0.1.84.0',
    'license': 'LGPL-3',
    'depends': ['bahmni_sale', 'bahmni_auto_payment_reconciliation', 'base_accounting_kit', 'mail', 'product_expiry'],
    'data': ['report/document_reports.xml', 'report/customer_statement.xml'],
    'post_init_hook': 'post_init_hook',
    'installable': True,
    'application': False,
}
