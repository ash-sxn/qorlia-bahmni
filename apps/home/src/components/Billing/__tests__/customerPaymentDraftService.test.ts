import {
  BillingActionRejected,
  BillingSessionExpired,
  checkedCustomerPaymentDraftRequest,
  getCustomerPaymentDraft,
  previewCustomerPaymentDraft,
  changeCustomerPaymentDraft,
  getCustomerPaymentDraftChoices,
  saveCustomerPaymentDraft,
  getCustomerPaymentDraftRequestStatus,
} from '../billingService';
import {
  customerPaymentDraftFixture,
  customerPaymentDraftRequest,
} from './customerPaymentDraftFixture';
import { paymentStateFixture } from './paymentStateFixture';

describe('Native customer payment draft API', () => {
  const reply = (result: unknown) =>
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ result }),
    });
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('loads new and saved drafts through the fixed native method', async () => {
    reply(customerPaymentDraftFixture());
    await getCustomerPaymentDraft();
    reply(customerPaymentDraftFixture({ id: 9, version: 'a'.repeat(64) }));
    await getCustomerPaymentDraft(9);
    const calls = (fetch as jest.Mock).mock.calls;
    expect(calls[0][0]).toContain(
      '/account.payment/qorlia_customer_payment_draft_load',
    );
    expect(JSON.parse(calls[0][1].body).params.kwargs).toEqual({
      payment_id: false,
    });
    expect(JSON.parse(calls[1][1].body).params.kwargs).toEqual({
      payment_id: 9,
    });
  });
  it('previews the complete form without submitting allocation commands', async () => {
    reply(customerPaymentDraftFixture());
    const { payload } = customerPaymentDraftRequest();
    await previewCustomerPaymentDraft(payload);
    const [url, options] = (fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/qorlia_customer_payment_draft_preview');
    expect(JSON.parse(options.body).params.kwargs).toEqual({ payload });
  });
  it('uses the fixed native onchange for dependent fields and returns native defaults', async () => {
    const fixture = customerPaymentDraftFixture();
    const changed = {
      ...fixture,
      values: { ...fixture.values, journal_id: 12, payment_method_line_id: 13 },
      warning: 'Check the selected bank details.',
      ledger: undefined,
    };
    reply(changed);
    const { payload } = customerPaymentDraftRequest();
    expect(await changeCustomerPaymentDraft(payload, 'journal_id')).toEqual(
      changed,
    );
    const [url, options] = (fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/qorlia_customer_payment_draft_onchange');
    expect(JSON.parse(options.body).params.kwargs).toEqual({
      payload,
      field: 'journal_id',
    });
  });
  it('rejects arbitrary onchange fields before requesting native Billing', async () => {
    await expect(
      changeCustomerPaymentDraft(
        customerPaymentDraftRequest().payload,
        'state' as never,
      ),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects malformed warnings and changed versions from dependent-field responses', async () => {
    const request = customerPaymentDraftRequest();
    request.payload.id = 9;
    request.payload.version = 'a'.repeat(64);
    reply(customerPaymentDraftFixture({ id: 9, version: 'd'.repeat(64) }));
    await expect(
      changeCustomerPaymentDraft(request.payload, 'amount'),
    ).rejects.toThrow('payment changed');
    reply({ ...customerPaymentDraftFixture(), warning: { html: 'untrusted' } });
    await expect(
      changeCustomerPaymentDraft(
        customerPaymentDraftRequest().payload,
        'amount',
      ),
    ).rejects.toThrow();
  });
  it.each([
    { id: 1 },
    { version: 'x' },
    { date_readonly: false },
    { labels: [] },
    { totals: { current_outstanding: 1, balance_outstanding: NaN } },
    { allocations: { outstanding: [], credits: [], extra: [] } },
  ])('rejects malformed native draft snapshots %p', async (change) => {
    reply({ ...customerPaymentDraftFixture(), ...change });
    await expect(getCustomerPaymentDraft()).rejects.toThrow();
  });
  it('rejects invalid form fields and dates before any request', async () => {
    for (const change of [
      { company_id: true },
      { amount: Infinity },
      { amount: -1 },
      { date: '2026-02-30' },
      { effective_date: '' },
      { partner_id: 0 },
      { payment_type: 'transfer' },
      { credit_invoice_lines: [[0, 0, {}]] },
    ]) {
      const request = customerPaymentDraftRequest();
      await expect(
        previewCustomerPaymentDraft({
          ...request.payload,
          values: { ...request.payload.values, ...change },
        } as never),
      ).rejects.toThrow();
    }
    await expect(getCustomerPaymentDraft(true as never)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects missing, unbounded, duplicate or malformed allocation reviews and ledgers', async () => {
    const fixture = customerPaymentDraftFixture();
    for (const change of [
      {
        allocations: {
          outstanding: Array(501).fill(fixture.allocations.outstanding[0]),
          credits: [],
        },
      },
      {
        allocations: {
          outstanding: [
            ...fixture.allocations.outstanding,
            ...fixture.allocations.outstanding,
          ],
          credits: [],
        },
      },
      {
        allocations: {
          outstanding: [
            { ...fixture.allocations.outstanding[0], selected: 'yes' },
          ],
          credits: [],
        },
      },
      { ledger: undefined },
      { ledger: [] },
      { account_labels: false },
      { ledger: [{ ...fixture.ledger![0], debit: NaN }, fixture.ledger![1]] },
    ]) {
      reply({ ...fixture, ...change });
      await expect(
        previewCustomerPaymentDraft(customerPaymentDraftRequest().payload),
      ).rejects.toThrow();
    }
  });
  it('rejects a changed saved-payment version returned by preview', async () => {
    const request = customerPaymentDraftRequest();
    request.payload.id = 9;
    request.payload.version = 'a'.repeat(64);
    reply(customerPaymentDraftFixture({ id: 9, version: 'd'.repeat(64) }));
    await expect(previewCustomerPaymentDraft(request.payload)).rejects.toThrow(
      'payment changed',
    );
  });
  it('loads native dependent choices without raw model access', async () => {
    reply([[3, 'Manual']]);
    const values = customerPaymentDraftRequest().payload.values;
    expect(
      await getCustomerPaymentDraftChoices(values, 'method', 'Man'),
    ).toEqual([[3, 'Manual']]);
    const [url, options] = (fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/qorlia_customer_payment_draft_choices');
    expect(JSON.parse(options.body).params.kwargs).toEqual({
      values,
      kind: 'method',
      search: 'Man',
    });
  });
  it('rejects arbitrary choice kinds, excessive search and duplicate records', async () => {
    const values = customerPaymentDraftRequest().payload.values;
    await expect(
      getCustomerPaymentDraftChoices(values, 'users' as never),
    ).rejects.toThrow();
    await expect(
      getCustomerPaymentDraftChoices(values, 'customer', 'x'.repeat(201)),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    for (const response of [
      [
        [1, 'A'],
        [1, 'B'],
      ],
      [[false, 'A']],
      Array(27).fill([1, 'A']),
    ]) {
      reply(response);
      await expect(
        getCustomerPaymentDraftChoices(values, 'customer'),
      ).rejects.toThrow();
    }
  });
  it('saves and checks the identical request, including a later current state', async () => {
    const current = paymentStateFixture({
      state: 'cancel',
      amount: 150,
      reasons: {
        post: 'Reset first',
        reset: false,
        cancel: 'Already cancelled',
      },
    });
    reply({ accepted: true, payment: current });
    const request = customerPaymentDraftRequest();
    expect((await saveCustomerPaymentDraft(request)).payment).toEqual(current);
    expect(
      (await getCustomerPaymentDraftRequestStatus(request)).payment,
    ).toEqual(current);
    const calls = (fetch as jest.Mock).mock.calls;
    expect(calls.map(([url]) => url.split('/').pop())).toEqual([
      'qorlia_customer_payment_draft_save',
      'qorlia_customer_payment_draft_status',
    ]);
    calls.forEach(([, options]) =>
      expect(JSON.parse(options.body).params.kwargs).toEqual(request),
    );
  });
  it('distinguishes absent receipt from accepted save without inventing a payment', async () => {
    reply({ accepted: false, payment: false });
    expect(
      await getCustomerPaymentDraftRequestStatus(customerPaymentDraftRequest()),
    ).toEqual({ accepted: false, payment: false });
    await expect(
      saveCustomerPaymentDraft(customerPaymentDraftRequest()),
    ).rejects.toThrow('response unavailable');
    reply({ accepted: true, payment: false });
    await expect(
      getCustomerPaymentDraftRequestStatus(customerPaymentDraftRequest()),
    ).rejects.toThrow('Saved payment state');
  });
  it('rejects a receipt for a different saved payment', async () => {
    const request = customerPaymentDraftRequest();
    request.payload.id = 10;
    request.payload.version = 'a'.repeat(64);
    reply({ accepted: true, payment: paymentStateFixture() });
    await expect(
      getCustomerPaymentDraftRequestStatus(request),
    ).rejects.toThrow();
  });
  it('validates exact stored request shape and hashes without accepting server-owned commands', () => {
    for (const change of [
      { extra: 1 },
      { request_key: 'x' },
      { review_version: 'x' },
      {
        payload: { ...customerPaymentDraftRequest().payload, allocations: [] },
      },
    ])
      expect(() =>
        checkedCustomerPaymentDraftRequest({
          ...customerPaymentDraftRequest(),
          ...change,
        } as never),
      ).toThrow();
  });
  it('does not retry uncertain transport failures or mistake them for server rejection', async () => {
    (fetch as jest.Mock).mockRejectedValue(new Error('Lost response'));
    await expect(
      saveCustomerPaymentDraft(customerPaymentDraftRequest()),
    ).rejects.toThrow('Lost response');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('preserves session expiry and explicit server rejection for recovery handling', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        error: {
          data: {
            name: 'odoo.exceptions.UserError',
            arguments: ['Stale review'],
            message: 'Stale review',
          },
        },
      }),
    });
    await expect(
      saveCustomerPaymentDraft(customerPaymentDraftRequest()),
    ).rejects.toBeInstanceOf(BillingActionRejected);
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: { code: 100 } }),
    });
    await expect(getCustomerPaymentDraft()).rejects.toBeInstanceOf(
      BillingSessionExpired,
    );
  });
});
