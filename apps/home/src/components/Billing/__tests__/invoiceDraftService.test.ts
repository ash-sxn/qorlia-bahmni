import {
  getInvoiceDraft,
  previewInvoiceDraft,
  saveInvoiceDraft,
  getInvoiceDraftChoices,
} from '../billingService';
import { invoiceDraftFixture } from './invoiceDraftFixture';

const reply = (result: unknown) =>
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });
describe('Invoice draft API boundary', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('loads and previews only named existing-draft actions and excludes caller context', async () => {
    const draft = invoiceDraftFixture();
    reply(draft);
    expect(await getInvoiceDraft(7)).toEqual(draft);
    reply({ ...draft, review_version: 'b'.repeat(64) });
    const preview = await previewInvoiceDraft(draft, {
      field: 'quantity',
      line: 0,
    });
    expect(preview.review_version).toBe('b'.repeat(64));
    const calls = (fetch as jest.Mock).mock.calls;
    expect(calls[0][0]).toContain('/account.move/qorlia_invoice_draft_load');
    expect(JSON.parse(calls[1][1].body).params).toEqual({
      model: 'account.move',
      method: 'qorlia_invoice_draft_preview',
      args: [],
      kwargs: {
        payload: {
          id: draft.id,
          version: draft.version,
          values: draft.values,
          lines: draft.lines,
        },
        change: { field: 'quantity', line: 0 },
      },
    });
  });
  it('requires a native review token before saving and sends it separately from the payload', async () => {
    const draft = invoiceDraftFixture();
    await expect(saveInvoiceDraft(draft)).rejects.toThrow('Recalculate');
    expect(fetch).not.toHaveBeenCalled();
    reply(draft);
    await saveInvoiceDraft({ ...draft, review_version: 'b'.repeat(64) });
    const [url, options] = (fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/qorlia_invoice_draft_save');
    expect(JSON.parse(options.body).params.kwargs).toEqual({
      payload: {
        id: draft.id,
        version: draft.version,
        values: draft.values,
        lines: draft.lines,
      },
      review_version: 'b'.repeat(64),
    });
  });
  it('rejects unreviewed previews, wrong-document responses and malformed financial data', async () => {
    const draft = invoiceDraftFixture();
    reply(draft);
    await expect(previewInvoiceDraft(draft, { field: 'ref' })).rejects.toThrow(
      'Invalid invoice draft',
    );
    for (const bad of [
      { ...draft, id: 8 },
      { ...draft, totals: { ...draft.totals, amount_total: NaN } },
      { ...draft, values: { ...draft.values, currency_id: false } },
      { ...draft, can_edit: 'yes' },
      {
        ...draft,
        lines: [
          {
            ...draft.lines[0],
            values: { ...draft.lines[0].values, tax_ids: [false] },
          },
        ],
      },
      {
        ...draft,
        lines: [
          {
            ...draft.lines[0],
            values: {
              ...draft.lines[0].values,
              analytic_distribution: { '13': NaN },
            },
          },
        ],
      },
    ]) {
      reply(bad);
      await expect(getInvoiceDraft(7)).rejects.toThrow('Invalid invoice draft');
    }
  });
  it('uses scoped native choices with invoice and product context and validates choice rows', async () => {
    reply([[13, 'Service account']]);
    expect(await getInvoiceDraftChoices(7, 'account', 'Service', 11)).toEqual([
      [13, 'Service account'],
    ]);
    expect(
      JSON.parse((fetch as jest.Mock).mock.calls[0][1].body).params.kwargs,
    ).toEqual({
      invoice_id: 7,
      kind: 'account',
      search: 'Service',
      product_id: 11,
    });
    for (const bad of [
      false,
      [[false, 'Invalid']],
      [[13]],
      [false],
      [[13, 99]],
    ]) {
      reply(bad);
      await expect(getInvoiceDraftChoices(7, 'account', '')).rejects.toThrow(
        'Invalid invoice choices',
      );
    }
  });
  it('loads an unsaved customer invoice and accepts incomplete previews only with a warning', async () => {
    const draft = { ...invoiceDraftFixture(), id: false as const, lines: [] };
    reply(draft);
    expect(await getInvoiceDraft(false)).toEqual(draft);
    reply({ ...draft, warning: { message: 'Add a product or service.' } });
    expect(
      (await previewInvoiceDraft(draft, { field: 'partner_id' }))
        .review_version,
    ).toBeUndefined();
    reply(draft);
    await expect(previewInvoiceDraft(draft, { field: 'ref' })).rejects.toThrow(
      'Invalid invoice draft',
    );
    reply({ ...draft, move_type: 'out_refund' });
    await expect(getInvoiceDraft(false)).rejects.toThrow(
      'Invalid invoice draft',
    );
  });
  it('requires a creation key and confirms a real customer invoice in the same company', async () => {
    const draft = {
      ...invoiceDraftFixture(),
      id: false as const,
      review_version: 'b'.repeat(64),
    };
    for (const key of [undefined, 'invalid']) {
      await expect(saveInvoiceDraft(draft, key)).rejects.toThrow(
        'save request identifier',
      );
    }
    expect(fetch).not.toHaveBeenCalled();
    const key = '3a47b619-83c0-4b39-846a-953d176e7ff5';
    reply(invoiceDraftFixture());
    expect((await saveInvoiceDraft(draft, key)).id).toBe(7);
    expect(
      JSON.parse((fetch as jest.Mock).mock.calls[0][1].body).params.kwargs
        .request_key,
    ).toBe(key);
    for (const bad of [
      draft,
      { ...invoiceDraftFixture(), move_type: 'out_refund' },
      { ...invoiceDraftFixture(), company: [99, 'Other company'] },
    ]) {
      reply(bad);
      await expect(saveInvoiceDraft(draft, key)).rejects.toThrow(
        'Invalid new invoice response',
      );
    }
  });
});
