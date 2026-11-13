import {
  checkedChequeRequest,
  downloadCheque,
  downloadCurrentCheque,
  getChequeStatus,
  getChequeWorkflow,
  previewChequeWorkflow,
  printChequeWorkflow,
} from '../billingService';
import { chequeFixture, chequePdf, chequeRequest } from './chequeFixture';

const reply = (result: unknown) =>
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });
describe('Cheque API boundary', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('uses only named payment actions with exact reviewed payloads', async () => {
    reply(chequeFixture());
    expect(await getChequeWorkflow(9)).toEqual(chequeFixture());
    reply(
      chequeFixture({
        number_to_print: '000007',
        review_version: 'b'.repeat(64),
      }),
    );
    await previewChequeWorkflow(chequeFixture(), '000007');
    reply({
      payment: chequeFixture({
        sent: true,
        can_print: false,
        check_number: '000007',
      }),
      pdf: chequePdf(),
    });
    expect((await printChequeWorkflow(chequeRequest())).pdf.blob.size).toBe(7);
    expect(
      JSON.parse((fetch as jest.Mock).mock.calls[2][1].body).params,
    ).toEqual({
      model: 'account.payment',
      method: 'qorlia_cheque_print',
      args: [],
      kwargs: chequeRequest(),
    });
    reply({ accepted: true, payment: chequeFixture() });
    expect((await getChequeStatus(chequeRequest())).accepted).toBe(true);
    reply(chequePdf());
    await downloadCheque(chequeRequest());
    await downloadCurrentCheque(9);
  });
  it('rejects invalid identities, cheque numbers and requests before network access', async () => {
    for (const id of [0, 1.5, NaN, Infinity])
      await expect(getChequeWorkflow(id)).rejects.toThrow('saved cheque');
    for (const number of ['ABC007', '', '-1', '9223372036854775808', '\u0661'])
      await expect(
        previewChequeWorkflow(chequeFixture(), number),
      ).rejects.toThrow('valid cheque');
    for (const change of [
      { payment_id: 0 },
      { request_key: 'bad' },
      { version: 'x' },
      { check_number: 'ABC007' },
      { context: { uid: 1 } },
    ])
      expect(() =>
        checkedChequeRequest({ ...chequeRequest(), ...change }),
      ).toThrow('Invalid cheque request');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects wrong-payment and unsafe PDF or mismatched-number responses', async () => {
    for (const changed of [
      { payment_id: 8 },
      { can_print: true, sent: true },
      { currency: false },
      { check_number: 'abc' },
    ]) {
      reply({ ...chequeFixture(), ...changed });
      await expect(getChequeWorkflow(9)).rejects.toThrow(
        'Invalid cheque status',
      );
    }
    for (const changed of [
      { payment_id: 8 },
      { filename: '../bank.pdf' },
      { content: btoa('not pdf') },
      { byte_count: 11 * 1024 * 1024 },
    ]) {
      reply({ ...chequePdf(), ...changed });
      await expect(downloadCheque(chequeRequest())).rejects.toThrow(
        'Invalid cheque PDF',
      );
    }
    reply({
      payment: chequeFixture({
        sent: true,
        can_print: false,
        check_number: '8',
      }),
      pdf: chequePdf(),
    });
    await expect(printChequeWorkflow(chequeRequest())).rejects.toThrow(
      'reviewed number',
    );
    reply({ accepted: 'yes', payment: chequeFixture() });
    await expect(getChequeStatus(chequeRequest())).rejects.toThrow(
      'status is unavailable',
    );
  });
  it('rejects changed preview versions and numbers, and never retries a lost write', async () => {
    for (const changed of [
      { version: 'c'.repeat(64) },
      { number_to_print: '8' },
      { review_version: false },
    ]) {
      reply({
        ...chequeFixture(),
        number_to_print: '000007',
        review_version: 'b'.repeat(64),
        ...changed,
      });
      await expect(
        previewChequeWorkflow(chequeFixture(), '000007'),
      ).rejects.toThrow('Invalid cheque review');
    }
    (fetch as jest.Mock)
      .mockReset()
      .mockRejectedValue(new Error('Lost response'));
    await expect(printChequeWorkflow(chequeRequest())).rejects.toThrow(
      'Lost response',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
