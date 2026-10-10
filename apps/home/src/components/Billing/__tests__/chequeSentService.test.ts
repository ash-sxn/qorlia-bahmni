import {
  checkedChequeSentRequest,
  getChequeSentWorkflow,
  previewChequeSentWorkflow,
  saveChequeSentWorkflow,
  getChequeSentRequestStatus,
} from '../billingService';

import { sentFixture, sentRequest } from './chequeSentFixture';

const reply = (result: unknown) =>
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });
describe('Cheque sent-status API boundary', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('uses only scoped native adapters and exact reviewed requests', async () => {
    reply(sentFixture());
    await getChequeSentWorkflow(9);
    reply(sentFixture({ action: 'mark_sent', review_version: 'b'.repeat(64) }));
    await previewChequeSentWorkflow(sentFixture(), 'mark_sent');
    reply({
      accepted: true,
      action: 'mark_sent',
      payment: sentFixture({ sent: true }),
    });
    await saveChequeSentWorkflow(sentRequest());
    expect(
      JSON.parse((fetch as jest.Mock).mock.calls[2][1].body).params,
    ).toEqual({
      model: 'account.payment',
      method: 'qorlia_cheque_sent_run',
      args: [],
      kwargs: sentRequest(),
    });
    reply({ accepted: true, action: 'mark_sent', payment: sentFixture() });
    expect((await getChequeSentRequestStatus(sentRequest())).payment.sent).toBe(
      false,
    );
  });
  it('rejects malformed requests and unavailable actions before network access', async () => {
    for (const changed of [
      { action: 'void' },
      { payment_id: 0 },
      { version: 'x' },
      { request_key: 'bad' },
      { context: { uid: 1 } },
    ])
      expect(() =>
        checkedChequeSentRequest({ ...sentRequest(), ...changed } as never),
      ).toThrow();
    await expect(getChequeSentWorkflow(0)).rejects.toThrow();
    await expect(
      previewChequeSentWorkflow(sentFixture(), 'unmark_sent'),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects wrong identities, inconsistent permissions and changed reviews', async () => {
    for (const changed of [
      { payment_id: 8 },
      { sent: 'yes' },
      { check_number: 'ABC007' },
      { can_update: true, reason: 'Denied' },
      { currency: false },
    ]) {
      reply(sentFixture(changed));
      await expect(getChequeSentWorkflow(9)).rejects.toThrow('Invalid');
    }
    for (const changed of [
      { action: 'unmark_sent' },
      { version: 'c'.repeat(64) },
      { review_version: false },
      { sent: true },
      { amount: 200 },
    ]) {
      reply(
        sentFixture({
          action: 'mark_sent',
          review_version: 'b'.repeat(64),
          ...changed,
        }),
      );
      await expect(
        previewChequeSentWorkflow(sentFixture(), 'mark_sent'),
      ).rejects.toThrow('review');
    }
    reply({ accepted: false, action: 'mark_sent', payment: sentFixture() });
    await expect(saveChequeSentWorkflow(sentRequest())).rejects.toThrow(
      'response',
    );
  });
  it('does not retry a lost mutation response', async () => {
    (fetch as jest.Mock).mockRejectedValue(new Error('Response lost'));
    await expect(saveChequeSentWorkflow(sentRequest())).rejects.toThrow(
      'Response lost',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
