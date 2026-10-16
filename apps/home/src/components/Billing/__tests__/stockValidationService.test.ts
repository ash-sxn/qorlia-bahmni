import {
  checkedStockValidationRequest,
  getStockValidation,
  previewStockValidation,
  saveStockValidation,
  getStockValidationStatus,
  StockValidationRequest,
  StockValidationReview,
} from '../billingService';
import {
  validationLoad,
  validationRequest,
  terminalValidationReview,
  validationStep,
  validationStatus,
} from './stockValidationFixture';

const reply = (result: unknown) =>
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });
const selection = () => ({
  order_id: 9,
  transfer_id: 11,
  version: 'a'.repeat(64),
  decisions: [],
});

describe('Native validation service boundary', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('uses four named APIs with scoped ordered choices and the exact saved request', async () => {
    reply(validationLoad());
    expect(await getStockValidation(9, 11)).toEqual(validationLoad());
    reply(terminalValidationReview());
    expect(await previewStockValidation(selection())).toEqual(
      terminalValidationReview(),
    );
    reply(validationStatus());
    expect(await saveStockValidation(validationRequest())).toEqual(
      validationStatus(),
    );
    expect(await getStockValidationStatus(validationRequest())).toEqual(
      validationStatus(),
    );
    const calls = (fetch as jest.Mock).mock.calls;
    expect(calls.map((call) => call[0])).toEqual(
      ['load', 'preview', 'save', 'status'].map(
        (action) =>
          `/openmrs/qorlia-billing-api/web/dataset/call_kw/stock.picking/qorlia_validation_${action}`,
      ),
    );
    expect(JSON.parse(calls[2][1].body).params).toEqual({
      model: 'stock.picking',
      method: 'qorlia_validation_save',
      args: [],
      kwargs: { payload: validationRequest() },
    });
  });
  it('preserves intermediate wizard, native defaults and the uncompleted terminal outcome', async () => {
    for (const kind of ['immediate', 'backorder'] as const) {
      const data = {
        ...terminalValidationReview(),
        terminal: false,
        next_step: validationStep(kind),
        write_ready: false,
        review_version: false,
        state_after: 'assigned',
      };
      reply(data);
      expect(await previewStockValidation(selection())).toEqual(data);
    }
    const data = { ...terminalValidationReview(), state_after: 'assigned' };
    reply(data);
    expect((await previewStockValidation(selection())).state_after).toBe(
      'assigned',
    );
  });
  it('preserves the native expiry warning and blocked SMS setup, without treating them as delivery', async () => {
    for (const next_step of [
      {
        ...validationStep(),
        kind: 'expiry',
        transfers: [],
        lots: [[4, 'QA batch']],
        description: 'Expired batch',
      },
      {
        ...validationStep(),
        kind: 'sms',
        transfers: [],
        blocked_reason: 'Company-wide notification decision requires approval.',
      },
    ]) {
      const data = {
        ...terminalValidationReview(),
        terminal: false,
        next_step,
        write_ready: false,
        review_version: false,
      };
      reply(data);
      expect(await previewStockValidation(selection())).toEqual(data);
    }
  });
  it('preserves receipt unit, batch, prices, expiry, balance and native warning', async () => {
    const data = {
      ...terminalValidationReview(),
      terminal: false,
      write_ready: false,
      review_version: false,
      next_step: {
        ...validationStep(),
        kind: 'receipt',
        transfers: [],
        source: [1, 'Supplier'],
        destination: [2, 'Stock'],
        picking_code: 'incoming',
        operations: [
          {
            id: 17,
            product_id: [3, 'Medicine'],
            product_uom_id: [4, 'Units'],
            qty_done: 5,
            lot_id: false,
            lot_name: 'QA batch',
            expiration_date: '2027-02-01T00:00:00',
            cost_price: 2.5,
            sale_price: 5,
            mrp: 7,
            balance: 10,
            is_move_line_lot_expiring_soon: true,
            expiry_warning: {
              title: 'Expiry',
              type: 'warning',
              message: 'Native days warning',
            },
          },
        ],
      },
    };
    reply(data);
    expect(await previewStockValidation(selection())).toEqual(data);
    data.next_step.operations[0].cost_price = Infinity;
    reply(data);
    await expect(previewStockValidation(selection())).rejects.toThrow(
      'Invalid validation review',
    );
  });
  it.each([
    { context: {} },
    { request_key: 'bad' },
    { order_id: true },
    { review_version: false },
    { decisions: [{ kind: 'immediate', selected: 1 }] },
    { decisions: [{ kind: 'sms', selected: true }] },
    { decisions: [{ kind: 'receipt', confirm: false }] },
    { decisions: [{ kind: 'expiry', proceed: true, res_id: 1 }] },
    { decisions: new Array(17).fill({ kind: 'immediate', selected: true }) },
  ])('rejects malformed exact requests before HTTP: %j', async (change) => {
    const request = {
      ...validationRequest(),
      ...change,
    } as StockValidationRequest;
    expect(() => checkedStockValidationRequest(request)).toThrow();
    await expect(saveStockValidation(request)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects foreign load/selection and extra request properties', async () => {
    await expect(getStockValidation(0, 11)).rejects.toThrow();
    await expect(
      previewStockValidation({ ...selection(), context: {} } as ReturnType<
        typeof selection
      >),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    reply({ ...validationLoad(), transfer_id: 99 });
    await expect(getStockValidation(9, 11)).rejects.toThrow();
  });
  it('does not let malformed effects hide quantities, scheduling dates or private stock records', async () => {
    const changes: ((data: StockValidationReview) => void)[] = [
      (data) => {
        data.terminal = false;
      },
      (data) => {
        data.review_version = false;
      },
      (data) => {
        data.state_after = 'corrupt' as 'done';
      },
      (data) => {
        data.effects.updated['stock.picking'][0].assigned_on_save = [
          'scheduled_date',
        ];
      },
      (data) => {
        data.effects.updated['stock.picking'][0].assigned_on_save =
          null as unknown as string[];
      },
      (data) => {
        data.effects.private_effect_counts['stock.quant'] = {
          created: 1,
          updated: 0,
          deleted: 0,
        };
      },
      (data) => {
        data.effects.private_effect_counts['stock.valuation.layer'].created =
          -1;
      },
      (data) => {
        data.effects.updated['stock.picking'][0].after.date_done =
          'not assigned';
      },
      (data) => {
        data.effects.labels['product.template:3'] = {
          en_US: 'Medicine',
        } as unknown as string;
      },
    ];
    for (const change of changes) {
      const data = terminalValidationReview();
      change(data);
      reply(data);
      await expect(previewStockValidation(selection())).rejects.toThrow(
        'Invalid validation review',
      );
    }
  });
  it('rejects another transfer, leaked hidden reference IDs, private audit references and false acknowledgements', async () => {
    for (const data of [
      { ...validationStatus(), request_key: 'different' },
      { ...validationStatus(), accepted: false },
      { ...validationStatus(), state_after: false },
      {
        ...validationStatus(),
        current: { ...validationLoad(), transfer_id: 99 },
      },
      {
        ...validationStatus(),
        references: {
          'new:stock.valuation.layer:0': {
            model: 'stock.valuation.layer',
            available: false,
            id: 4,
            name: 'private',
          },
        },
      },
      {
        ...validationStatus(),
        references: {
          'new:mail.message:0': {
            model: 'mail.message',
            available: true,
            id: 4,
            name: 'audit',
          },
        },
      },
    ]) {
      reply(data);
      await expect(
        getStockValidationStatus(validationRequest()),
      ).rejects.toThrow();
    }
    reply({
      ...validationStatus(),
      accepted: false,
      state_after: false,
      references: {},
    });
    expect((await getStockValidationStatus(validationRequest())).accepted).toBe(
      false,
    );
    await expect(saveStockValidation(validationRequest())).rejects.toThrow(
      'Invalid validation receipt',
    );
  });
});
