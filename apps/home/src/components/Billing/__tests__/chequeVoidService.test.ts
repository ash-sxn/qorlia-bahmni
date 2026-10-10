import {
  checkedChequeVoidRequest,
  getChequeVoidWorkflow,
  previewChequeVoidWorkflow,
  saveChequeVoidWorkflow,
  getChequeVoidRequestStatus,
} from '../billingService';
import { voidFixture, voidRequest, voidedFixture } from './chequeVoidFixture';

const reply = (result: unknown) =>
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });
describe('Cheque void API boundary', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('uses fixed native actions and accepts cancelled-state request recovery', async () => {
    reply(voidFixture());
    await getChequeVoidWorkflow(9);
    reply(voidFixture({ review_version: 'b'.repeat(64) }));
    await previewChequeVoidWorkflow(voidFixture());
    reply({ accepted: true, payment: voidedFixture() });
    await saveChequeVoidWorkflow(voidRequest());
    expect(
      JSON.parse((fetch as jest.Mock).mock.calls[2][1].body).params,
    ).toEqual({
      model: 'account.payment',
      method: 'qorlia_cheque_void_run',
      args: [],
      kwargs: voidRequest(),
    });
    expect(
      (await getChequeVoidRequestStatus(voidRequest())).payment.state,
    ).toBe('cancel');
  });
  it('rejects invalid requests, payment IDs and unavailable actions before fetching', async () => {
    for (const change of [
      { payment_id: 0 },
      { version: 'x' },
      { request_key: 'bad' },
      { context: { uid: 1 } },
    ])
      expect(() =>
        checkedChequeVoidRequest({ ...voidRequest(), ...change } as never),
      ).toThrow();
    await expect(getChequeVoidWorkflow(0)).rejects.toThrow();
    await expect(previewChequeVoidWorkflow(voidedFixture())).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects wrong identities, invalid documents and changing review balances', async () => {
    for (const change of [
      { payment_id: 8 },
      { state: 'cancel' },
      { sent: false },
      { currency: false },
      { documents: [{ ...voidFixture().documents[0], currency: false }] },
      { documents: [null] },
      { documents: [voidFixture().documents[0], voidFixture().documents[0]] },
    ]) {
      reply(voidFixture(change as never));
      await expect(getChequeVoidWorkflow(9)).rejects.toThrow('Invalid');
    }
    reply(
      voidFixture({
        review_version: 'b'.repeat(64),
        documents: [{ ...voidFixture().documents[0], open_amount: 300 }],
      }),
    );
    await expect(previewChequeVoidWorkflow(voidFixture())).rejects.toThrow(
      'review',
    );
    reply({ accepted: false, payment: voidFixture() });
    await expect(saveChequeVoidWorkflow(voidRequest())).rejects.toThrow(
      'response',
    );
  });
  it('never automatically retries a lost cancellation response', async () => {
    (fetch as jest.Mock).mockRejectedValue(new Error('Response lost'));
    await expect(saveChequeVoidWorkflow(voidRequest())).rejects.toThrow(
      'Response lost',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
