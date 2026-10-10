import {
  DocumentReportKey,
  DocumentReportKind,
  downloadDocumentReport,
  getDocumentReports,
} from '../billingService';

const pdf = '%PDF-1.4\nQorliaQA';
const reply = (result: unknown) =>
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });

describe('Order and payment report boundary', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it.each([
    ['order', 'sale.order', 'order_id', 'quotation'],
    ['payment', 'account.payment', 'payment_id', 'receipt_summary'],
  ] as const)(
    'uses fixed %s actions and a checked PDF response',
    async (kind, model, field, key) => {
      reply({ [field]: 9, reports: [{ key, name: 'Native report' }] });
      expect(await getDocumentReports(kind, 9)).toEqual([
        { key, name: 'Native report' },
      ]);
      reply({
        [field]: 9,
        filename: 'QorliaQA_9.pdf',
        mimetype: 'application/pdf',
        byte_count: pdf.length,
        content: btoa(pdf),
      });
      const file = await downloadDocumentReport(kind, 9, key);
      expect(file.blob.size).toBe(pdf.length);
      expect(
        JSON.parse((fetch as jest.Mock).mock.calls[1][1].body).params,
      ).toEqual({
        model,
        method: `qorlia_${kind}_report_download`,
        args: [],
        kwargs: { [field]: 9, report_key: key },
      });
    },
  );
  it('rejects invalid identities, kinds and cross-model keys without a request', async () => {
    for (const id of [0, -1, NaN, 1.5])
      await expect(getDocumentReports('order', id)).rejects.toThrow(
        'saved Billing',
      );
    await expect(
      getDocumentReports('other' as DocumentReportKind, 9),
    ).rejects.toThrow('available');
    await expect(downloadDocumentReport('order', 9, 'receipt')).rejects.toThrow(
      'available',
    );
    await expect(
      downloadDocumentReport('payment', 9, 'quotation'),
    ).rejects.toThrow('available');
    await expect(
      downloadDocumentReport('payment', 9, 'unknown' as DocumentReportKey),
    ).rejects.toThrow('available');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects malformed report menus and unsafe PDFs', async () => {
    for (const result of [
      null,
      { payment_id: 8, reports: [] },
      { payment_id: 9, reports: [null] },
      { payment_id: 9, reports: [{ key: 'quotation', name: 'Wrong model' }] },
      {
        payment_id: 9,
        reports: [
          { key: 'receipt', name: 'A' },
          { key: 'receipt', name: 'B' },
        ],
      },
    ]) {
      reply(result);
      await expect(getDocumentReports('payment', 9)).rejects.toThrow(
        'Invalid payment report list',
      );
    }
    for (const patch of [
      { payment_id: 8 },
      { filename: '../receipt.pdf' },
      { content: btoa('NOTPDF') },
      { byte_count: 11 * 1024 * 1024 },
      { mimetype: 'text/html' },
    ]) {
      reply({
        payment_id: 9,
        filename: 'Receipt_9.pdf',
        mimetype: 'application/pdf',
        byte_count: pdf.length,
        content: btoa(pdf),
        ...patch,
      });
      await expect(
        downloadDocumentReport('payment', 9, 'receipt'),
      ).rejects.toThrow('Invalid payment PDF');
    }
  });
});
