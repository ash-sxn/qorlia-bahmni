import {
  changeStockOperationForm,
  getStockOperationChoices,
  getStockOperationForm,
  stockOperationFields,
  StockOperationForm,
  StockOperationFormRequest,
} from '../billingService';

const selection = {
  order_id: 9,
  transfer_id: 11,
  move_id: 13,
  operation_id: 17,
};
const request = (): StockOperationFormRequest => ({
  ...selection,
  version: 'a'.repeat(64),
  edits: [{ field: 'qty_done', value: 2 }],
});
const form = (): StockOperationForm => ({
  ...selection,
  version: 'a'.repeat(64),
  product: [3, 'Medicine'],
  state: 'assigned',
  tracking: 'lot',
  values: {
    qty_done: 2,
    cost_price: 0,
    sale_price: 0,
    mrp: 0,
    product_uom_id: 1,
    lot_id: 7,
    existing_lot_id: false,
    location_id: 4,
    location_dest_id: 5,
    package_id: false,
    result_package_id: false,
    owner_id: false,
    lot_name: false,
    expiration_date: '2027-01-01 00:00:00',
  },
  rules: Object.fromEntries(
    stockOperationFields.map((field) => [
      field,
      { visible: true, readonly: false },
    ]),
  ) as StockOperationForm['rules'],
  labels: {
    product_uom_id: [1, 'Units'],
    lot_id: [7, 'Batch'],
    location_id: [4, 'Stock'],
    location_dest_id: [5, 'Customer'],
  },
  reserved: 5,
  balance: 8,
  expiry_warning: false,
  warning: false,
  reason: false,
  write_ready: false,
  can_delete: true,
});
const reply = (result: unknown) =>
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });

describe('Native stock operation form boundary', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('uses only named scoped form APIs and keeps an ordered edit history', async () => {
    reply(form());
    expect(await getStockOperationForm(selection)).toEqual(form());
    expect((fetch as jest.Mock).mock.calls[0][0]).toContain(
      '/stock.picking/qorlia_operation_load',
    );
    const changed = {
      ...request(),
      edits: [
        { field: 'cost_price', value: 100 },
        { field: 'sale_price', value: 123 },
      ],
    } as StockOperationFormRequest;
    expect(await changeStockOperationForm(changed)).toEqual(form());
    expect(
      JSON.parse((fetch as jest.Mock).mock.calls[1][1].body).params,
    ).toEqual({
      model: 'stock.picking',
      method: 'qorlia_operation_onchange',
      args: [],
      kwargs: changed,
    });
  });
  it('accepts explicit unsaved operation identity but never invents one', async () => {
    reply({ ...form(), operation_id: false, reserved: 0 });
    expect(
      (await getStockOperationForm({ ...selection, operation_id: false }))
        .operation_id,
    ).toBe(false);
    reply(form());
    await expect(
      getStockOperationForm({ ...selection, operation_id: false }),
    ).rejects.toThrow('Invalid native stock operation form');
  });
  it.each([
    { move_id: 0 },
    { operation_id: true },
    { operation_id: undefined },
    { transfer_id: 1.2 },
  ])('rejects invalid identity before transmitting %j', async (change) => {
    await expect(
      getStockOperationForm({ ...selection, ...change } as typeof selection),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects unsupported or malformed edits before sending them', async () => {
    for (const edits of [
      null,
      [{}],
      [{ field: 'reserved_uom_qty', value: 2 }],
      [{ field: 'qty_done', value: true }],
      [{ field: 'qty_done', value: Infinity }],
      [{ field: 'lot_id', value: 1.5 }],
      [{ field: 'qty_done', value: 2, context: {} }],
      [{ field: 'expiration_date', value: 'tomorrow' }],
      Array(101).fill({ field: 'qty_done', value: 2 }),
    ])
      await expect(
        changeStockOperationForm({
          ...request(),
          edits,
        } as StockOperationFormRequest),
      ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('denies foreign identity, mismatched labels and malformed native rules', async () => {
    const mutations: ((data: StockOperationForm) => void)[] = [
      (data) => {
        data.move_id = 99;
      },
      (data) => {
        data.values.qty_done = NaN;
      },
      (data) => {
        data.labels.lot_id = [99, 'Wrong batch'];
      },
      (data) => {
        delete data.labels.location_id;
      },
      (data) => {
        data.rules.qty_done.visible = false;
      },
      (data) => {
        delete (data.rules as Partial<typeof data.rules>).mrp;
      },
      (data) => {
        (data as unknown as { write_ready: string }).write_ready = 'yes';
      },
    ];
    for (const mutate of mutations) {
      const data = form();
      mutate(data);
      reply(data);
      await expect(getStockOperationForm(selection)).rejects.toThrow(
        'Invalid native stock operation form',
      );
    }
    reply({ ...form(), version: 'b'.repeat(64) });
    await expect(changeStockOperationForm(request())).rejects.toThrow(
      'version changed',
    );
  });
  it('returns exact native choice pages and rejects duplicate or misleading pages', async () => {
    reply({ rows: [[7, 'Batch']], has_more: false, offset: 25 });
    expect(
      await getStockOperationChoices(request(), 'lot_id', 'Batch', 25),
    ).toEqual({ rows: [[7, 'Batch']], has_more: false, offset: 25 });
    expect(
      JSON.parse((fetch as jest.Mock).mock.calls[0][1].body).params.kwargs,
    ).toEqual({ ...request(), field: 'lot_id', search: 'Batch', offset: 25 });
    for (const result of [
      {
        rows: [
          [7, 'Batch'],
          [7, 'Duplicate'],
        ],
        has_more: false,
        offset: 0,
      },
      { rows: [false], has_more: false, offset: 0 },
      { rows: [[7, 'Batch']], has_more: true, offset: 0 },
      { rows: [], has_more: false, offset: 25 },
    ]) {
      reply(result);
      await expect(
        getStockOperationChoices(request(), 'lot_id'),
      ).rejects.toThrow('Invalid native stock field choices');
    }
  });
});
