import {
  BillingSessionExpired,
  downloadCustomerStatement,
  getCustomerStatement,
} from '../billingService';
import { customerStatementFixture } from './customerStatementFixture';

const reply = (result: unknown) =>
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });
describe('Customer statement API', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('uses one named read-only route with fixed invoice/date arguments, no context', async () => {
    reply(customerStatementFixture());
    expect(await getCustomerStatement(7, '2026-01-01', '2026-01-31')).toEqual(
      customerStatementFixture(),
    );
    expect(
      JSON.parse((fetch as jest.Mock).mock.calls[0][1].body).params,
    ).toEqual({
      model: 'account.move',
      method: 'qorlia_customer_statement',
      args: [],
      kwargs: { invoice_id: 7, date_from: '2026-01-01', date_to: '2026-01-31' },
    });
  });
  it('rejects malformed IDs, dates and reversed periods before any request', async () => {
    for (const [id, start, end] of [
      [0, '2026-01-01', '2026-01-31'],
      [7, '2026-02-30', '2026-03-01'],
      [7, '20260101', '2026-01-31'],
      [7, '2026-02-01', '2026-01-31'],
    ] as const)
      await expect(getCustomerStatement(id, start, end)).rejects.toThrow(
        'valid statement',
      );
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects mismatched identities, nonfinite totals, invalid rows and hidden truncation', async () => {
    const fixture = customerStatementFixture();
    for (const patch of [
      { invoice_id: 8 },
      { date_to: '2026-02-01' },
      { closing: NaN },
      { currency: false },
      { rows: [null] },
      { rows: [fixture.rows[0], fixture.rows[0]] },
      { rows: [{ ...fixture.rows[0], date: '2026-02-02' }] },
      { rows: [{ ...fixture.rows[0], debit: -1 }] },
      { rows: [{ ...fixture.rows[0], currency: false }] },
      { rows: Array(2001).fill(fixture.rows[0]) },
    ]) {
      reply({ ...fixture, ...patch });
      await expect(
        getCustomerStatement(7, '2026-01-01', '2026-01-31'),
      ).rejects.toThrow('Invalid customer statement');
    }
  });
  it('preserves native user errors and expiry without retrying', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: { code: 100 } }),
    });
    await expect(
      getCustomerStatement(7, '2026-01-01', '2026-01-31'),
    ).rejects.toBeInstanceOf(BillingSessionExpired);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  const pdf = {
    invoice_id: 7,
    date_from: '2026-01-01',
    date_to: '2026-01-31',
    filename: 'Statement_7.pdf',
    mimetype: 'application/pdf',
    byte_count: 9,
    content: btoa('%PDF-test'),
  };
  it('downloads only a fixed dated statement and validates the PDF bytes', async () => {
    reply(pdf);
    const result = await downloadCustomerStatement(
      7,
      '2026-01-01',
      '2026-01-31',
    );
    expect(result.filename).toBe('Statement_7.pdf');
    expect(result.blob.size).toBe(9);
    expect(result.blob.type).toBe('application/pdf');
    expect(
      JSON.parse((fetch as jest.Mock).mock.calls[0][1].body).params,
    ).toEqual({
      model: 'account.move',
      method: 'qorlia_customer_statement_download',
      args: [],
      kwargs: { invoice_id: 7, date_from: '2026-01-01', date_to: '2026-01-31' },
    });
  });
  it('rejects invalid download ranges before making requests', async () => {
    for (const [id, start, end] of [
      [0, '2026-01-01', '2026-01-31'],
      [7, '2026-02-30', '2026-03-01'],
      [7, '2026-02-01', '2026-01-01'],
    ] as const)
      await expect(downloadCustomerStatement(id, start, end)).rejects.toThrow(
        'valid statement',
      );
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects mismatched dates, identity, unsafe names and corrupt PDFs', async () => {
    for (const patch of [
      { invoice_id: 8 },
      { date_from: '2025-01-01' },
      { date_to: '2026-02-01' },
      { filename: '../Statement.pdf' },
      { content: btoa('not a pdf') },
      { byte_count: 8 },
      { byte_count: 11 * 1024 * 1024 },
      { mimetype: 'text/html' },
      { content: '%%%invalid%%%' },
    ]) {
      reply({ ...pdf, ...patch });
      await expect(
        downloadCustomerStatement(7, '2026-01-01', '2026-01-31'),
      ).rejects.toThrow('Invalid customer statement PDF');
    }
  });
});
