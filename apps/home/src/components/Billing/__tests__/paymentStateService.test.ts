import {
  checkedPaymentStateRequest,
  getCustomerPaymentHistory,
  getPaymentStateWorkflow,
  getPaymentStateRequestStatus,
  previewPaymentStateWorkflow,
  savePaymentStateWorkflow,
} from '../billingService';
import {
  paymentStateFixture,
  paymentStateRequest,
  postedPaymentState,
} from './paymentStateFixture';

describe('Native customer payment history and lifecycle API', () => {
  const reply = (result: unknown) =>
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ result }),
    });
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('loads only a saved payment using the named native method', async () => {
    reply(paymentStateFixture());
    expect(await getPaymentStateWorkflow(9)).toEqual(paymentStateFixture());
    const [url, options] = (fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/account.payment/qorlia_payment_state_load');
    expect(JSON.parse(options.body).params).toEqual({
      model: 'account.payment',
      method: 'qorlia_payment_state_load',
      args: [],
      kwargs: { payment_id: 9 },
    });
  });
  it('reviews exactly the displayed native snapshot and action', async () => {
    reply(
      paymentStateFixture({ action: 'post', review_version: 'b'.repeat(64) }),
    );
    await previewPaymentStateWorkflow(paymentStateFixture(), 'post');
    const [, options] = (fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(options.body).params.kwargs).toEqual({
      payment_id: 9,
      version: 'a'.repeat(64),
      action: 'post',
    });
  });
  it('rejects altered review balances, state or action', async () => {
    for (const changes of [
      { amount: 101 },
      { action: 'cancel' as const },
      { version: 'c'.repeat(64) },
    ]) {
      reply(
        paymentStateFixture({
          action: 'post',
          review_version: 'b'.repeat(64),
          ...changes,
        }),
      );
      await expect(
        previewPaymentStateWorkflow(paymentStateFixture(), 'post'),
      ).rejects.toThrow('review changed');
    }
  });
  it('saves and checks only the identical request via fixed methods', async () => {
    reply({ accepted: true, action: 'post', payment: postedPaymentState() });
    await savePaymentStateWorkflow(paymentStateRequest());
    await getPaymentStateRequestStatus(paymentStateRequest());
    expect(
      (fetch as jest.Mock).mock.calls.map(([url]) => url.split('/').pop()),
    ).toEqual(['qorlia_payment_state_run', 'qorlia_payment_state_status']);
    expect(
      JSON.parse((fetch as jest.Mock).mock.calls[0][1].body).params.kwargs,
    ).toEqual(paymentStateRequest());
  });
  it('does not mistake a missing receipt or wrong action for an accepted save', async () => {
    reply({ accepted: false, action: 'post', payment: paymentStateFixture() });
    await expect(
      savePaymentStateWorkflow(paymentStateRequest()),
    ).rejects.toThrow('response unavailable');
    expect(
      (await getPaymentStateRequestStatus(paymentStateRequest())).accepted,
    ).toBe(false);
    reply({ accepted: true, action: 'cancel', payment: postedPaymentState() });
    await expect(
      getPaymentStateRequestStatus(paymentStateRequest()),
    ).rejects.toThrow('response unavailable');
  });
  it('validates stored identifiers, hashes, exact keys and supported actions', () => {
    for (const change of [
      { payment_id: true },
      { action: 'unlink' },
      { version: 'x' },
      { request_key: 'x' },
      { extra: 1 },
    ])
      expect(() =>
        checkedPaymentStateRequest({
          ...paymentStateRequest(),
          ...change,
        } as never),
      ).toThrow();
  });
  it('rejects wrong-patient status and impossible state eligibility', async () => {
    for (const changes of [
      { payment_id: 10 },
      { reasons: { post: false, reset: false, cancel: false } },
      { date: 'not a date' },
    ]) {
      reply(paymentStateFixture(changes));
      await expect(getPaymentStateWorkflow(9)).rejects.toThrow();
    }
  });
  it('loads paged history using fixed customer scope, no raw search RPC', async () => {
    const rows = [
      { ...paymentStateFixture(), direction: 'inbound', reference: '' },
    ];
    reply({ rows, offset: 25, has_more: true });
    expect((await getCustomerPaymentHistory('QA', 25, 'cancel')).rows).toEqual(
      rows,
    );
    const [url, options] = (fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/qorlia_payment_history');
    expect(JSON.parse(options.body).params.kwargs).toEqual({
      search: 'QA',
      offset: 25,
      state: 'cancel',
    });
  });
  it('rejects invalid filters before network and malformed native history', async () => {
    await expect(getCustomerPaymentHistory('x', -1)).rejects.toThrow();
    await expect(getCustomerPaymentHistory('x', 0, 'sent')).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    const row = {
      ...paymentStateFixture(),
      direction: 'inbound',
      reference: '',
    };
    for (const result of [
      { rows: [row, row], offset: 0, has_more: false },
      { rows: [{ ...row, direction: 'internal' }], offset: 0, has_more: false },
      { rows: [], offset: 25, has_more: false },
    ]) {
      reply(result);
      await expect(getCustomerPaymentHistory('')).rejects.toThrow(
        'Invalid payment history',
      );
    }
  });
});
