import {
  getStockReturn,
  getStockReturnLocations,
  getStockReturnStatus,
  previewStockReturn,
  previewStockValidation,
  saveStockReturn,
  checkedStockReturnRequest,
  StockReturnLoad,
  StockReturnReview,
  StockReturnSelection,
  StockReturnRequest,
  StockReturnStatus,
} from '../billingService';
import { stockLoad } from './stockReservationFixture';
import { terminalValidationReview } from './stockValidationFixture';

const loaded = (): StockReturnLoad => {
  const graph = stockLoad().graph;
  graph.transfer.state = 'done';
  return {
    order_id: 9,
    transfer_id: 11,
    version: 'a'.repeat(64),
    graph,
    reason: false,
    write_ready: true,
    form: {
      location: [3, 'QA Stock'],
      location_editable: true,
      show_units: true,
      chained_move_warning: true,
      lines: [
        {
          move_id: 12,
          product: [5, 'QA Medicine'],
          quantity: 5,
          unit: [1, 'Units'],
          updates_order_quantities: true,
        },
      ],
    },
  };
};
const selection = (): StockReturnSelection => ({
  order_id: 9,
  transfer_id: 11,
  version: 'a'.repeat(64),
  location_id: 3,
  lines: [{ move_id: 12, quantity: 2 }],
});
const reviewed = (): StockReturnReview => {
  const form = loaded().form;
  if (!form) throw new Error('Fixture needs a native form.');
  form.lines[0].quantity = 2;
  return {
    ...selection(),
    form,
    return_state: 'assigned',
    write_ready: true,
    review_version: 'b'.repeat(64),
    effects: {
      created: {
        'stock.picking': [
          {
            key: 'new:stock.picking:0',
            values: { name: false, state: 'assigned' },
            assigned_on_save: ['name'],
          },
        ],
      },
      updated: { 'stock.picking': [] },
      deleted: { 'stock.picking': [] },
      labels: {},
      schema: {
        'stock.picking': {
          name: { label: 'Reference', type: 'char', relation: false },
          state: { label: 'Status', type: 'selection', relation: false },
        },
      },
      private_effect_counts: {
        'mail.message': { created: 1, updated: 0, deleted: 0 },
      },
    },
  };
};
const reply = (result: unknown) =>
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });
const base = () => ({ order_id: 9, transfer_id: 11, version: 'a'.repeat(64) });
const request = (): StockReturnRequest => ({
  ...selection(),
  review_version: 'b'.repeat(64),
  request_key: '11111111-2222-4333-8444-555555555555',
});
const accepted = (): StockReturnStatus => ({
  accepted: true,
  request_key: request().request_key,
  state_after: 'assigned',
  current: loaded(),
  return_transfer: {
    model: 'stock.picking',
    id: 19,
    name: 'QA/RETURN/19',
    available: true,
  },
  references: {
    'new:stock.picking:0': {
      model: 'stock.picking',
      id: 19,
      name: 'QA/RETURN/19',
      available: true,
    },
  },
});

describe('Native stock return read and review contracts', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('uses the three named APIs and preserves native warning, units and quantity-update metadata', async () => {
    reply(loaded());
    expect(await getStockReturn(9, 11)).toEqual(loaded());
    reply({ rows: [[4, 'QA Returns']], next_after: false });
    expect(await getStockReturnLocations(base(), 'Returns', 3, 1)).toEqual({
      rows: [[4, 'QA Returns']],
      next_after: false,
    });
    reply(reviewed());
    expect(await previewStockReturn(selection())).toEqual(reviewed());
    const calls = (fetch as jest.Mock).mock.calls;
    expect(calls.map((call) => call[0])).toEqual(
      ['load', 'locations', 'preview'].map(
        (action) =>
          `/openmrs/qorlia-billing-api/web/dataset/call_kw/stock.picking/qorlia_return_${action}`,
      ),
    );
    expect(JSON.parse(calls[1][1].body).params).toEqual({
      model: 'stock.picking',
      method: 'qorlia_return_locations',
      args: [],
      kwargs: { ...base(), query: 'Returns', after: 3, limit: 1 },
    });
    expect(JSON.parse(calls[2][1].body).params.kwargs).toEqual(selection());
  });

  it('requires form readiness and a signed review, without pretending that a return is complete', async () => {
    reply({
      ...loaded(),
      form: false,
      reason: 'Only completed transfers can be returned.',
      write_ready: false,
    });
    expect((await getStockReturn(9, 11)).form).toBe(false);
    reply({ ...loaded(), write_ready: false });
    await expect(getStockReturn(9, 11)).rejects.toThrow(
      'Invalid native return form',
    );
    reply({ ...reviewed(), write_ready: false });
    await expect(previewStockReturn(selection())).rejects.toThrow(
      'Invalid native return review',
    );
  });

  it.each([
    { order_id: 8 },
    { transfer_id: 12 },
    { version: 'bad' },
    { reason: 'Denied' },
    { form: false },
    { form: { location: false } },
    { graph: null },
  ])('rejects mismatched or incomplete load data: %j', async (change) => {
    reply({ ...loaded(), ...change });
    await expect(getStockReturn(9, 11)).rejects.toThrow(
      'Invalid native return form',
    );
  });

  it('rejects duplicate, malformed and nonfinite native form rows', async () => {
    const data = loaded();
    if (!data.form) throw new Error('Missing fixture form.');
    const row = data.form.lines[0];
    for (const lines of [
      [row, row],
      [{ ...row, move_id: 999 }],
      [{ ...row, product: false }],
      [{ ...row, unit: [1] }],
      [{ ...row, quantity: Infinity }],
      [{ ...row, updates_order_quantities: 'yes' }],
    ]) {
      reply({ ...data, form: { ...data.form, lines } });
      await expect(getStockReturn(9, 11)).rejects.toThrow(
        'Invalid native return form',
      );
    }
  });

  it('rejects invalid identities and edits before sending a request', async () => {
    await expect(getStockReturn(0, 11)).rejects.toThrow();
    await expect(
      getStockReturn(9, Number.MAX_SAFE_INTEGER + 1),
    ).rejects.toThrow();
    for (const change of [
      { location_id: false },
      { lines: [{ move_id: 12, quantity: NaN }] },
      {
        lines: [
          { move_id: 12, quantity: 2 },
          { move_id: 12, quantity: 2 },
        ],
      },
      { lines: [{ move_id: 12, quantity: 2, to_refund: false }] },
      { context: { uid: 1 } },
    ]) {
      await expect(
        previewStockReturn({
          ...selection(),
          ...change,
        } as StockReturnSelection),
      ).rejects.toThrow();
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('preserves native over-return and removed-row selection instead of inventing client limits', async () => {
    const data = reviewed();
    data.lines[0].quantity = 6;
    data.form.lines[0].quantity = 6;
    reply(data);
    expect(
      (
        await previewStockReturn({
          ...selection(),
          lines: [{ move_id: 12, quantity: 6 }],
        })
      ).lines[0].quantity,
    ).toBe(6);
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        error: {
          data: {
            name: 'odoo.exceptions.UserError',
            arguments: ['Please specify at least one non-zero quantity.'],
          },
        },
      }),
    });
    await expect(
      previewStockReturn({ ...selection(), lines: [] }),
    ).rejects.toThrow('Please specify at least one non-zero quantity.');
    expect(
      JSON.parse((fetch as jest.Mock).mock.calls[1][1].body).params.kwargs
        .lines,
    ).toEqual([]);
  });

  it('requires the exact reviewed identities, location, rows and uncompleted outcome', async () => {
    for (const change of [
      { order_id: 8 },
      { transfer_id: 12 },
      { version: 'b'.repeat(64) },
      { location_id: 4 },
      { lines: [{ move_id: 14, quantity: 2 }] },
      { return_state: 'done' },
      { return_state: 'cancel' },
      { effects: {} },
    ]) {
      reply({ ...reviewed(), ...change });
      await expect(previewStockReturn(selection())).rejects.toThrow(
        'Invalid native return review',
      );
    }
    const data = reviewed();
    data.form.lines[0].quantity = 3;
    reply(data);
    await expect(previewStockReturn(selection())).rejects.toThrow(
      'Invalid native return review',
    );
  });

  it('checks bounded cursor paging, native relation labels and unexpected fields', async () => {
    reply({ rows: [[4, 'QA Returns']], next_after: 4 });
    expect((await getStockReturnLocations(base(), '', 3, 1)).next_after).toBe(
      4,
    );
    for (const response of [
      { rows: [[4, 'QA Returns']], next_after: 5 },
      {
        rows: [
          [4, 'QA Returns'],
          [4, 'Duplicate'],
        ],
        next_after: false,
      },
      { rows: [[2, 'Before cursor']], next_after: false },
      { rows: [false], next_after: false },
      { rows: [], next_after: 4 },
      { rows: [], next_after: false, secret: 'unexpected' },
    ]) {
      reply(response);
      await expect(getStockReturnLocations(base(), '', 3, 2)).rejects.toThrow(
        'Invalid native return locations',
      );
    }
    (fetch as jest.Mock).mockClear();
    for (const [query, after, limit] of [
      ['x'.repeat(201), 0, 25],
      ['', -1, 25],
      ['', 0, 101],
      ['', 0, 1.5],
    ] as const)
      await expect(
        getStockReturnLocations(base(), query, after, limit),
      ).rejects.toThrow('bounded');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses exact named save/status calls and preserves the native created transfer reference', async () => {
    reply(accepted());
    expect(await saveStockReturn(request())).toEqual(accepted());
    expect(await getStockReturnStatus(request())).toEqual(accepted());
    const calls = (fetch as jest.Mock).mock.calls;
    expect(calls.map(([url]) => url)).toEqual(
      ['save', 'status'].map(
        (action) =>
          `/openmrs/qorlia-billing-api/web/dataset/call_kw/stock.picking/qorlia_return_${action}`,
      ),
    );
    for (const [, options] of calls)
      expect(JSON.parse(options.body).params.kwargs).toEqual({
        payload: request(),
      });
  });

  it('rejects unsigned, altered or injected creation requests before transport', () => {
    for (const change of [
      { request_key: false },
      { review_version: 'bad' },
      { context: {} },
      { lines: [{ move_id: 12, quantity: true }] },
      { lines: [{ move_id: 12, quantity: 2, to_refund: false }] },
    ])
      expect(() =>
        checkedStockReturnRequest({
          ...request(),
          ...change,
        } as StockReturnRequest),
      ).toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('distinguishes unknown creation and a saved but no longer readable return', async () => {
    reply({
      ...accepted(),
      accepted: false,
      state_after: false,
      return_transfer: false,
      references: {},
    });
    expect((await getStockReturnStatus(request())).accepted).toBe(false);
    const hidden = {
      model: 'stock.picking',
      id: false,
      name: false,
      available: false,
    };
    reply({
      ...accepted(),
      return_transfer: hidden,
      references: { 'new:stock.picking:0': hidden },
    });
    expect((await getStockReturnStatus(request())).accepted).toBe(true);
  });

  it('rejects inconsistent receipts, foreign identities and unapproved exposed record types', async () => {
    for (const change of [
      { request_key: 'different' },
      { state_after: 'done' },
      { return_transfer: false },
      { references: {} },
      { accepted: false },
      { return_transfer: { ...accepted().return_transfer, id: 20 } },
    ]) {
      reply({ ...accepted(), ...change });
      await expect(getStockReturnStatus(request())).rejects.toThrow(
        'Invalid return creation receipt',
      );
    }
    reply({ ...accepted(), current: { ...loaded(), order_id: 99 } });
    await expect(getStockReturnStatus(request())).rejects.toThrow(
      'Invalid native return form',
    );
    reply({
      ...accepted(),
      references: {
        ...accepted().references,
        'new:mail.mail:0': {
          model: 'mail.mail',
          id: 22,
          name: 'Private mail',
          available: true,
        },
      },
    });
    await expect(getStockReturnStatus(request())).rejects.toThrow(
      'Invalid return creation receipt',
    );
  });

  it('allows execution-assigned return scheduling metadata without broadening validation contracts', async () => {
    const data = reviewed();
    data.effects.schema['stock.picking'].scheduled_date = {
      label: 'Schedule',
      type: 'datetime',
      relation: false,
    };
    data.effects.created['stock.picking'][0].values.scheduled_date = false;
    data.effects.created['stock.picking'][0].assigned_on_save.push(
      'scheduled_date',
    );
    reply(data);
    expect(await previewStockReturn(selection())).toEqual(data);
    const validation = terminalValidationReview();
    validation.effects.schema['stock.picking'].scheduled_date =
      data.effects.schema['stock.picking'].scheduled_date;
    validation.effects.created['stock.picking'] =
      data.effects.created['stock.picking'];
    reply(validation);
    await expect(
      previewStockValidation({ ...base(), decisions: [] }),
    ).rejects.toThrow('Invalid validation review');
  });
});
