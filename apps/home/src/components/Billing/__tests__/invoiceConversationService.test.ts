import {
  BillingSessionExpired,
  checkInvoiceNote,
  getInvoiceConversation,
  postInvoiceNote,
} from '../billingService';
import {
  invoiceConversationFixture,
  invoiceMessageFixture,
  noteKey,
} from './invoiceConversationFixture';

const reply = (result: unknown) =>
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });
describe('Invoice conversation API', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('uses named invoice-only history and note routes, never raw mail methods or context', async () => {
    reply(invoiceConversationFixture());
    await getInvoiceConversation(7);
    expect(
      JSON.parse((fetch as jest.Mock).mock.calls[0][1].body).params,
    ).toEqual({
      model: 'account.move',
      method: 'qorlia_invoice_messages',
      args: [],
      kwargs: { invoice_id: 7, before: false },
    });
    reply({
      invoice_id: 7,
      request_key: noteKey,
      message: invoiceMessageFixture(),
    });
    await postInvoiceNote(7, noteKey, 'QorliaQA Checked invoice');
    expect(
      JSON.parse((fetch as jest.Mock).mock.calls[1][1].body).params,
    ).toEqual({
      model: 'account.move',
      method: 'qorlia_invoice_note',
      args: [],
      kwargs: {
        invoice_id: 7,
        request_key: noteKey,
        body: 'QorliaQA Checked invoice',
      },
    });
  });
  it('rejects invalid identities, cursors, request keys and note text before networking', async () => {
    for (const [id, before] of [
      [0, false],
      [7, 0],
      [7, -1],
    ] as const)
      await expect(getInvoiceConversation(id, before)).rejects.toThrow(
        'valid conversation cursor',
      );
    for (const [id, key, body] of [
      [0, noteKey, 'Note'],
      [7, 'invalid', 'Note'],
      [7, noteKey, ' '],
      [7, noteKey, 'x'.repeat(5001)],
      [7, noteKey, 'null\0'],
    ] as const)
      await expect(postInvoiceNote(id, key, body)).rejects.toThrow(
        'valid internal note',
      );
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects incorrect invoice, order, pagination and malformed message responses', async () => {
    for (const change of [
      { invoice_id: 8 },
      { can_note: 'true' },
      { messages: [null] },
      { messages: [invoiceMessageFixture(), invoiceMessageFixture()] },
      { next_before: 9 },
      {
        messages: [{ ...invoiceMessageFixture(), date: '2026-02-30 12:00:00' }],
      },
      { messages: [{ ...invoiceMessageFixture(), changes: [null] }] },
      {
        messages: [
          { ...invoiceMessageFixture(), attachments: [{ id: -1, name: 'x' }] },
        ],
      },
      { messages: [{ ...invoiceMessageFixture(), body_truncated: 1 }] },
    ]) {
      reply({ ...invoiceConversationFixture(), ...change });
      await expect(getInvoiceConversation(7)).rejects.toThrow(
        'Invalid invoice conversation',
      );
    }
    reply(invoiceConversationFixture());
    await expect(getInvoiceConversation(7, 9)).rejects.toThrow(
      'Invalid invoice conversation',
    );
  });
  it('returns absence only from status, and validates saved-note identity and subtype', async () => {
    reply({ invoice_id: 7, request_key: noteKey, message: false });
    expect(await checkInvoiceNote(7, noteKey, 'Note')).toBe(false);
    await expect(postInvoiceNote(7, noteKey, 'Note')).rejects.toThrow(
      'Invalid saved',
    );
    for (const patch of [
      { invoice_id: 8 },
      { request_key: 'another-key' },
      { message: { ...invoiceMessageFixture(), kind: 'comment' } },
    ]) {
      reply({
        invoice_id: 7,
        request_key: noteKey,
        message: invoiceMessageFixture(),
        ...patch,
      });
      await expect(postInvoiceNote(7, noteKey, 'Note')).rejects.toThrow(
        'Invalid saved',
      );
    }
  });
  it('does not retry an expired or unavailable note request', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: { code: 100 } }),
    });
    await expect(postInvoiceNote(7, noteKey, 'Note')).rejects.toBeInstanceOf(
      BillingSessionExpired,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
