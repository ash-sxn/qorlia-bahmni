import {
  BillingActionRejected,
  BillingSessionExpired,
  stopPagedStockConfirmation,
  stopPagedStockOperation,
  stopPagedStockReservation,
} from '../billingService';
import { request } from './stockConfirmationPagedFixture';
import { operationRequest } from './stockOperationFixture';
import { stockRequest } from './stockReservationFixture';

const operation = () => ({
  ...operationRequest(),
  review_complete_token: 'd'.repeat(64),
});
const reservation = () => ({
  ...stockRequest(),
  review_complete_token: 'd'.repeat(64),
});
const cases = [
  {
    kind: 'confirmation',
    exact: request,
    call: (change = {}) =>
      stopPagedStockConfirmation({ ...request(), ...change }),
  },
  {
    kind: 'operation',
    exact: operation,
    call: (change = {}) =>
      stopPagedStockOperation({ ...operation(), ...change }),
  },
  {
    kind: 'reservation',
    exact: reservation,
    call: (change = {}) =>
      stopPagedStockReservation({ ...reservation(), ...change }),
  },
];
const reply = (result: unknown) =>
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });
describe.each(cases)(
  'Exact $kind request stop SDK',
  ({ kind, exact, call }) => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });
    it.each([true, false])(
      'uses its named route and preserves the opposite accepted/stopped outcome (%s)',
      async (stopped) => {
        const result = {
          request_key: exact().request_key,
          stopped,
          accepted: !stopped,
        };
        reply(result);
        expect(await call()).toEqual(result);
        const [route, options] = (fetch as jest.Mock).mock.calls[0];
        expect(route).toBe(
          `/openmrs/qorlia-billing-api/web/dataset/call_kw/stock.picking/qorlia_${kind}_paged_stop`,
        );
        expect(JSON.parse(options.body).params).toEqual({
          model: 'stock.picking',
          method: `qorlia_${kind}_paged_stop`,
          args: [],
          kwargs: { payload: exact() },
        });
      },
    );
    it('rejects incomplete, ambiguous, foreign and extra-field results rather than treating them as cancellation', async () => {
      const valid = {
        request_key: exact().request_key,
        stopped: true,
        accepted: false,
      };
      for (const invalid of [
        null,
        [],
        {},
        { ...valid, request_key: 'another-request' },
        { ...valid, accepted: true },
        { ...valid, stopped: false },
        { ...valid, stopped: 1 },
        { ...valid, accepted: undefined },
        { ...valid, current: {} },
        { ...valid, reversed: true },
      ]) {
        reply(invalid);
        await expect(call()).rejects.toThrow('Invalid stop result');
      }
    });
    it('rejects malformed proof and caller-controlled scopes locally before HTTP', async () => {
      for (const invalid of [
        { context: {} },
        { receipt_field: 'qorlia_confirmation_receipts' },
        { review_complete_token: false },
        { review_complete_token: 'not-a-proof' },
        { request_key: 'bad' },
        { transfer_id: 0 },
      ])
        await expect(call(invalid)).rejects.toThrow();
      expect(fetch).not.toHaveBeenCalled();
    });
    it('preserves expiry and native rejection separately from an uncertain transport response', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ error: { code: 100 } }),
      });
      await expect(call()).rejects.toBeInstanceOf(BillingSessionExpired);
      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          error: {
            data: {
              name: 'odoo.exceptions.UserError',
              arguments: ['Native stop rejected'],
            },
          },
        }),
      });
      await expect(call()).rejects.toBeInstanceOf(BillingActionRejected);
      (fetch as jest.Mock).mockRejectedValue(new Error('Stop response lost'));
      await expect(call()).rejects.toThrow('Stop response lost');
    });
  },
);
