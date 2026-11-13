import {
  checkedStockConfirmationRequest,
  getStockConfirmation,
  getStockConfirmationStatus,
  previewStockConfirmation,
  saveStockConfirmation,
  StockConfirmationLoad,
  StockConfirmationRequest,
  StockConfirmationReview,
  StockConfirmationStatus,
} from '../billingService';
import { stockLoad } from './stockReservationFixture';

const load = (): StockConfirmationLoad => ({
  order_id: 9,
  transfer_id: 11,
  version: 'a'.repeat(64),
  graph: stockLoad().graph,
  reason: false,
  write_ready: true,
});
const request = (): StockConfirmationRequest => ({
  order_id: 9,
  transfer_id: 11,
  version: 'a'.repeat(64),
  review_version: 'b'.repeat(64),
  request_key: '11111111-2222-4333-8444-555555555555',
});
const review = (): StockConfirmationReview => ({
  order_id: 9,
  transfer_id: 11,
  version: 'a'.repeat(64),
  review_version: 'b'.repeat(64),
  state_after: 'waiting',
  write_ready: true,
  effects: {
    created: {
      'stock.picking': [
        {
          key: 'new:stock.picking:0',
          values: { name: false, state: 'confirmed' },
          assigned_on_save: ['name'],
        },
      ],
    },
    updated: {
      'stock.picking': [
        { id: 11, before: { state: 'draft' }, after: { state: 'waiting' } },
      ],
    },
    deleted: { 'stock.picking': [] },
    labels: { 'stock.location:3': 'Stock' },
    schema: {
      'stock.picking': {
        name: { label: 'Name', type: 'char', relation: false },
        state: { label: 'State', type: 'selection', relation: false },
      },
    },
    private_audit_counts: {
      'mail.tracking.value': { created: 1, updated: 0, deleted: 0 },
    },
  },
});
const status = (): StockConfirmationStatus => ({
  accepted: true,
  request_key: request().request_key,
  state_after: 'waiting',
  current: load(),
  references: {
    'new:stock.picking:0': {
      model: 'stock.picking',
      id: 12,
      name: 'QA/IN/12',
      available: true,
    },
  },
});
const reply = (result: unknown) =>
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });

describe('Native confirmation service boundary', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('uses named scoped load, review and exact payload save/status APIs', async () => {
    reply(load());
    expect(await getStockConfirmation(9, 11)).toEqual(load());
    reply(review());
    const selection = { order_id: 9, transfer_id: 11, version: load().version };
    expect(await previewStockConfirmation(selection)).toEqual(review());
    reply(status());
    expect(await saveStockConfirmation(request())).toEqual(status());
    expect(await getStockConfirmationStatus(request())).toEqual(status());
    const calls = (fetch as jest.Mock).mock.calls;
    expect(calls.map((call) => call[0])).toEqual(
      ['load', 'preview', 'save', 'status'].map(
        (action) =>
          `/openmrs/qorlia-billing-api/web/dataset/call_kw/stock.picking/qorlia_confirmation_${action}`,
      ),
    );
    expect(JSON.parse(calls[2][1].body).params).toEqual({
      model: 'stock.picking',
      method: 'qorlia_confirmation_save',
      args: [],
      kwargs: { payload: request() },
    });
    expect(JSON.parse(calls[3][1].body).params.kwargs).toEqual({
      payload: request(),
    });
  });
  it('preserves unavailable and not-yet-accepted status without pretending it saved', async () => {
    reply({
      ...load(),
      reason: 'Native state does not permit confirmation.',
      write_ready: false,
    });
    expect((await getStockConfirmation(9, 11)).write_ready).toBe(false);
    reply({ ...status(), accepted: false, state_after: false, references: {} });
    expect((await getStockConfirmationStatus(request())).accepted).toBe(false);
    reply({
      ...status(),
      references: {
        'new:stock.picking:0': {
          model: 'stock.picking',
          id: false,
          name: false,
          available: false,
        },
      },
    });
    expect(
      (await getStockConfirmationStatus(request())).references[
        'new:stock.picking:0'
      ].available,
    ).toBe(false);
  });
  it('preserves native audit pseudo-relations to newly created documents', async () => {
    const data = review();
    data.effects.schema['mail.message'] = {
      model: { label: 'Model', type: 'char', relation: false },
      res_id: {
        label: 'Related Document ID',
        type: 'many2one_reference',
        relation: false,
      },
    };
    data.effects.created['mail.message'] = [
      {
        key: 'new:mail.message:0',
        values: { model: 'stock.picking', res_id: 'new:stock.picking:0' },
        assigned_on_save: [],
      },
    ];
    data.effects.updated['mail.message'] = [];
    data.effects.deleted['mail.message'] = [];
    reply(data);
    expect(
      await previewStockConfirmation({
        order_id: 9,
        transfer_id: 11,
        version: load().version,
      }),
    ).toEqual(data);
    data.effects.created['mail.message'][0].values.res_id =
      'new:account.move:0';
    reply(data);
    await expect(
      previewStockConfirmation({
        order_id: 9,
        transfer_id: 11,
        version: load().version,
      }),
    ).rejects.toThrow('Invalid confirmation review');
  });
  it.each([
    { order_id: true },
    { transfer_id: 0 },
    { version: 'bad' },
    { review_version: false },
    { request_key: 'invalid' },
    { context: { uid: 1 } },
    { action: 'confirm' },
  ])('rejects malformed exact requests before HTTP: %j', async (change) => {
    await expect(
      saveStockConfirmation({
        ...request(),
        ...change,
      } as StockConfirmationRequest),
    ).rejects.toThrow();
    expect(() =>
      checkedStockConfirmationRequest({
        ...request(),
        ...change,
      } as StockConfirmationRequest),
    ).toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects invalid selection before HTTP', async () => {
    await expect(getStockConfirmation(0, 11)).rejects.toThrow();
    await expect(
      previewStockConfirmation({ order_id: 9, transfer_id: 11, version: 'x' }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects foreign, malformed, missing and misleading native load responses', async () => {
    for (const change of [
      { order_id: 99 },
      { transfer_id: 99 },
      { version: [] },
      { graph: null },
      { reason: true },
      { write_ready: 'yes' },
      { extra: true },
    ]) {
      reply({ ...load(), ...change });
      await expect(getStockConfirmation(9, 11)).rejects.toThrow(
        'Invalid confirmation state',
      );
    }
  });
  it('rejects invalid effects, duplicate records and unreviewed fields', async () => {
    const mutations: ((data: StockConfirmationReview) => void)[] = [
      (data) => {
        data.order_id = 99;
      },
      (data) => {
        data.review_version = 'bad';
      },
      (data) => {
        (data as unknown as { state_after: string }).state_after = 'done';
      },
      (data) => {
        data.effects.created['stock.picking'].push(
          data.effects.created['stock.picking'][0],
        );
      },
      (data) => {
        data.effects.created['stock.picking'][0].key = 'new:account.move:0';
      },
      (data) => {
        data.effects.created['stock.picking'][0].values.secret = 'unexpected';
      },
      (data) => {
        data.effects.created['stock.picking'][0].values.name =
          'Not assigned on save';
      },
      (data) => {
        data.effects.created['stock.picking'][0].values.name = NaN;
      },
      (data) => {
        data.effects.schema['stock.picking'].state.type = 'integer';
      },
      (data) => {
        data.effects.schema['stock.picking'].state.type = 'many2one';
        data.effects.schema['stock.picking'].state.relation = 'stock.picking';
        data.effects.created['stock.picking'][0].values.state =
          'new:purchase.order:0';
      },
      (data) => {
        delete data.effects.deleted['stock.picking'];
      },
      (data) => {
        data.effects.updated['stock.picking'].push(
          data.effects.updated['stock.picking'][0],
        );
      },
      (data) => {
        data.effects.schema['stock.picking'].state.relation =
          true as unknown as string;
      },
      (data) => {
        data.effects.private_audit_counts['mail.tracking.value'].created = -1;
      },
      (data) => {
        data.effects.private_audit_counts['stock.quant'] = {
          created: 1,
          updated: 0,
          deleted: 0,
        };
      },
      (data) => {
        data.effects.updated['stock.picking'][0].assigned_on_save = [];
      },
      (data) => {
        data.effects.private_audit_counts['account.move'] = {
          created: 1,
          updated: 0,
          deleted: 0,
        };
      },
      (data) => {
        data.effects.schema['account.move'] = {};
        data.effects.created['account.move'] = [];
        data.effects.updated['account.move'] = [];
        data.effects.deleted['account.move'] = [];
      },
    ];
    for (const mutate of mutations) {
      const data = review();
      mutate(data);
      reply(data);
      await expect(
        previewStockConfirmation({
          order_id: 9,
          transfer_id: 11,
          version: load().version,
        }),
      ).rejects.toThrow('Invalid confirmation review');
    }
  });
  it('rejects receipts for another request/transfer and private or false references', async () => {
    const mutations: ((data: StockConfirmationStatus) => void)[] = [
      (data) => {
        data.request_key = 'different';
      },
      (data) => {
        data.current.transfer_id = 99;
      },
      (data) => {
        data.state_after = false;
      },
      (data) => {
        data.accepted = false;
      },
      (data) => {
        data.references['new:stock.picking:0'].id = false;
      },
      (data) => {
        data.references['new:stock.picking:0'].available = false;
      },
      (data) => {
        data.references['new:stock.picking:0'].model = 'mail.message';
      },
      (data) => {
        data.references['new:stock.picking:0'].model = 'account.move';
      },
    ];
    for (const mutate of mutations) {
      const data = status();
      mutate(data);
      reply(data);
      await expect(getStockConfirmationStatus(request())).rejects.toThrow();
    }
  });
});
