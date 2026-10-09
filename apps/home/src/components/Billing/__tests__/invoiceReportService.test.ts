import {
  downloadInvoiceReport,
  getInvoiceReports,
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
