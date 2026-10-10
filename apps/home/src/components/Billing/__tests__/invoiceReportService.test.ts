import {
  downloadInvoiceReport,
  downloadInvoiceBatchReport,
  getInvoiceReports,
  getInvoiceBatchReports,
  InvoiceReportKey,
} from '../billingService';

const pdf = '%PDF-1.4\nQorliaQA';
const result = () => ({
  invoice_id: 7,
  filename: 'Draft_7_invoice.pdf',
  mimetype: 'application/pdf',
  byte_count: pdf.length,
  content: btoa(pdf),
});
const reply = (value: unknown) =>
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result: value }),
  });
describe('Invoice report API boundary', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('binds a combined PDF to the exact ordered selection and scoped action', async () => {
    reply({
      invoice_ids: [7, 9],
      reports: [{ key: 'invoice', name: 'Invoices' }],
    });
    expect(await getInvoiceBatchReports([7, 9])).toHaveLength(1);
    reply({ ...result(), invoice_ids: [7, 9] });
    expect(
      (await downloadInvoiceBatchReport([7, 9], 'invoice')).blob.size,
    ).toBe(pdf.length);
    expect(
      JSON.parse((fetch as jest.Mock).mock.calls[1][1].body).params,
    ).toEqual({
      model: 'account.move',
      method: 'qorlia_invoice_batch_report_download',
      args: [],
      kwargs: { invoice_ids: [7, 9], report_key: 'invoice' },
    });
  });
  it('rejects empty, duplicate, oversized or invalid selections without RPC', async () => {
    for (const ids of [
      [],
      [7, 7],
      [0],
      [7, NaN],
      Array.from({ length: 26 }, (_, i) => i + 1),
    ]) {
      await expect(getInvoiceBatchReports(ids)).rejects.toThrow('distinct');
      await expect(downloadInvoiceBatchReport(ids, 'invoice')).rejects.toThrow(
        'distinct',
      );
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects reordered, omitted, extra or wrong batch identities and unsafe PDF content', async () => {
    for (const ids of [[9, 7], [7], [7, 9, 10], [7, '9'], [7, 7], null]) {
      reply({ invoice_ids: ids, reports: [] });
      await expect(getInvoiceBatchReports([7, 9])).rejects.toThrow('Invalid');
      reply({ ...result(), invoice_ids: ids });
      await expect(
        downloadInvoiceBatchReport([7, 9], 'invoice'),
      ).rejects.toThrow('Invalid');
    }
    reply({ ...result(), invoice_ids: [7, 9], filename: '../batch.pdf' });
    await expect(downloadInvoiceBatchReport([7, 9], 'invoice')).rejects.toThrow(
      'Invalid',
    );
  });
  it('uses only named report actions without caller context and decodes a PDF', async () => {
    reply({ invoice_id: 7, reports: [{ key: 'invoice', name: 'Invoices' }] });
    expect(await getInvoiceReports(7)).toEqual([
      { key: 'invoice', name: 'Invoices' },
    ]);
    reply(result());
    const file = await downloadInvoiceReport(7, 'invoice');
    expect(file.filename).toBe('Draft_7_invoice.pdf');
    expect(file.blob.type).toBe('application/pdf');
    expect(file.blob.size).toBe(pdf.length);
    const calls = (fetch as jest.Mock).mock.calls;
    expect(calls[0][0]).toContain('qorlia_invoice_report_list');
    expect(JSON.parse(calls[1][1].body).params).toEqual({
      model: 'account.move',
      method: 'qorlia_invoice_report_download',
      args: [],
      kwargs: { invoice_id: 7, report_key: 'invoice' },
    });
  });
  it('rejects invalid requests before contacting Billing', async () => {
    await expect(getInvoiceReports(0)).rejects.toThrow('saved invoice');
    await expect(
      downloadInvoiceReport(7, 'arbitrary' as InvoiceReportKey),
    ).rejects.toThrow('available');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects wrong invoice, duplicate or unsupported report lists', async () => {
    for (const bad of [
      { invoice_id: 8, reports: [] },
      { invoice_id: 7, reports: [false] },
      { invoice_id: 7, reports: [{ key: 'vendor', name: 'Vendor' }] },
      {
        invoice_id: 7,
        reports: [
          { key: 'invoice', name: 'Invoices' },
          { key: 'invoice', name: 'Duplicate' },
        ],
      },
    ]) {
      reply(bad);
      await expect(getInvoiceReports(7)).rejects.toThrow(
        'Invalid invoice report list',
      );
    }
  });
  it('rejects unsafe filenames, wrong identity, HTML, size mismatch and malformed base64', async () => {
    for (const change of [
      { filename: '../invoice.pdf' },
      { invoice_id: 8 },
      { mimetype: 'text/html' },
      { byte_count: 11 * 1024 * 1024 },
      { byte_count: 5 },
      { content: btoa('html-not-a-PDF!!!') },
      { content: '!'.repeat(result().content.length) },
    ]) {
      reply({ ...result(), ...change });
      await expect(downloadInvoiceReport(7, 'invoice')).rejects.toThrow(
        'Invalid invoice PDF',
      );
    }
  });
});
