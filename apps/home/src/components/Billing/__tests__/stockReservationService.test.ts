import {
  getStockReservation,
  previewStockReservation,
  saveStockReservation,
  getStockReservationStatus,
  StockReservationRequest,
} from '../billingService';
import {
  stockLoad,
  stockReview,
  stockRequest,
  quantityReview,
} from './stockReservationFixture';

const reply = (result: unknown) =>
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });
describe('Native stock reservation boundary', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('loads only the named scoped stock API', async () => {
    reply(stockLoad());
    expect(await getStockReservation(9, 11)).toEqual(stockLoad());
    const [url, init] = (fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/stock.picking/qorlia_transfer_load');
    expect(JSON.parse(init.body).params).toEqual({
      model: 'stock.picking',
      method: 'qorlia_transfer_load',
      args: [],
      kwargs: { order_id: 9, transfer_id: 11 },
    });
  });
  it('preserves preview units and temporary operation identities', async () => {
    const review = stockReview();
    reply(review);
    expect(await previewStockReservation(stockRequest())).toEqual(review);
    reply({
      accepted: true,
      request_key: stockRequest().request_key,
      action: 'assign',
      current: stockLoad(),
    });
    expect((await saveStockReservation(stockRequest())).accepted).toBe(true);
    expect((await getStockReservationStatus(stockRequest())).accepted).toBe(
      true,
    );
    expect(
      JSON.parse((fetch as jest.Mock).mock.calls[1][1].body).params.kwargs,
    ).toEqual(stockRequest());
  });
  it('rejects wrong identity, missing reasons and preview-only saved operation IDs', async () => {
    for (const mutate of [
      (value: ReturnType<typeof stockLoad>) => {
        value.transfer_id = 12;
      },
      (value: ReturnType<typeof stockLoad>) => {
        value.graph.transfer.id = 12;
      },
      (value: ReturnType<typeof stockLoad>) => {
        value.reasons.assign = true as unknown as string;
      },
      (value: ReturnType<typeof stockLoad>) => {
        value.graph.transfer.operations[0].id = false;
      },
    ]) {
      const value = stockLoad();
      mutate(value);
      reply(value);
      await expect(getStockReservation(9, 11)).rejects.toThrow(
        'Invalid reservation state',
      );
    }
  });
  it('rejects previews that complete a transfer or change physical inventory', async () => {
    for (const mutate of [
      (value: ReturnType<typeof stockReview>) => {
        value.after.transfer.state = 'done';
      },
      (value: ReturnType<typeof stockReview>) => {
        value.quant_after[0].quantity = 19;
      },
      (value: ReturnType<typeof stockReview>) => {
        value.quant_after[0].lot_id = [99, 'Different'];
      },
      (value: ReturnType<typeof stockReview>) => {
        value.quant_after[0].reserved_quantity = NaN;
      },
      (value: ReturnType<typeof stockReview>) => {
        value.after.transfer.operations[0].move_id = 99;
      },
      (value: ReturnType<typeof stockReview>) => {
        value.quant_after.push(value.quant_after[0]);
      },
      (value: ReturnType<typeof stockReview>) => {
        value.action = 'unreserve';
      },
    ]) {
      const value = stockReview();
      mutate(value);
      reply(value);
      await expect(previewStockReservation(stockRequest())).rejects.toThrow(
        'Invalid reservation preview',
      );
    }
  });
  it('rejects malformed requests before sending and foreign receipts after sending', async () => {
    for (const change of [
      { order_id: 0 },
      { transfer_id: 0.1 },
      { version: 'bad' },
      { review_version: 'bad' },
      { request_key: 'bad' },
      { action: 'validate' },
      { context: {} },
    ])
      await expect(
        saveStockReservation({
          ...stockRequest(),
          ...change,
        } as StockReservationRequest),
      ).rejects.toThrow();
    await expect(getStockReservation(0, 11)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    reply({
      accepted: true,
      request_key: 'other',
      action: 'assign',
      current: stockLoad(),
    });
    await expect(getStockReservationStatus(stockRequest())).rejects.toThrow(
      'Invalid reservation receipt',
    );
  });
  it('previews and sends exact native set/clear quantity requests without converting operation units', async () => {
    for (const action of ['set_quantities', 'clear_quantities'] as const) {
      const review = quantityReview(action);
      reply(review);
      const request = { ...stockRequest(), action };
      expect(await previewStockReservation(request)).toEqual(review);
      reply({
        accepted: true,
        request_key: request.request_key,
        action,
        current: stockLoad(),
      });
      expect((await saveStockReservation(request)).accepted).toBe(true);
      expect(
        JSON.parse((fetch as jest.Mock).mock.calls.at(-1)[1].body).params
          .kwargs,
      ).toEqual(request);
      expect(review.quant_after).toEqual(review.quant_before);
      expect(review.after.transfer.operations[0].done).toBe(
        action === 'set_quantities' ? 0.5 : 0,
      );
    }
  });
  it('requires all native quantity-action reasons rather than silently enabling unknown actions', async () => {
    const value = stockLoad();
    delete (value.reasons as Partial<typeof value.reasons>).set_quantities;
    reply(value);
    await expect(getStockReservation(9, 11)).rejects.toThrow(
      'Invalid reservation state',
    );
  });
  it('preserves labelled package metadata and rejects raw IDs, foreign companies and duplicate levels', async () => {
    const row = {
      id: 19,
      package_id: [20, 'QA Pack'] as [number, string],
      location_id: [3, 'QA Stock'] as [number, string],
      location_dest_id: [4, 'QA Customer'] as [number, string],
      state: 'assigned',
      company_id: [1, 'QA Company'] as [number, string],
    };
    reply({ ...stockLoad(), graph: { ...stockLoad().graph, packages: [row] } });
    expect(
      (await getStockReservation(9, 11)).graph.packages[0].package_id,
    ).toEqual([20, 'QA Pack']);
    for (const packages of [
      [{ ...row, package_id: 20 }],
      [{ ...row, company_id: [2, 'Foreign'] }],
      [row, row],
    ]) {
      reply({ ...stockLoad(), graph: { ...stockLoad().graph, packages } });
      await expect(getStockReservation(9, 11)).rejects.toThrow(
        'Invalid reservation state',
      );
    }
  });
});
