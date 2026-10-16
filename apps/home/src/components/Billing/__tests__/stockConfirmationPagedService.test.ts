import {
  BillingActionRejected,
  BillingSessionExpired,
  checkedPagedStockConfirmationRequest,
  getPagedStockConfirmation,
  getPagedStockConfirmationReferences,
  getPagedStockConfirmationReview,
  getPagedStockConfirmationStatus,
  savePagedStockConfirmation,
  checkedStockConfirmationRequest,
  PagedStockConfirmationLoad,
  PagedStockConfirmationReferences,
  PagedStockConfirmationReview,
  PagedStockConfirmationStatus,
} from '../billingService';
import { confirmationLoad } from './stockConfirmationFixture';
import {
  load,
  selection,
  request,
  status,
  effects,
  review,
  references,
} from './stockConfirmationPagedFixture';

const reply = (result: unknown) =>
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });
const params = () =>
  (fetch as jest.Mock).mock.calls.map(
    (call) => JSON.parse(call[1].body).params,
  );

describe('Complete paged native confirmation boundary', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('uses only five named APIs and retains the exact signed request', async () => {
    reply(load());
    expect(await getPagedStockConfirmation(9, 11)).toEqual(load());
    reply(review());
    expect(await getPagedStockConfirmationReview(selection())).toEqual(
      review(),
    );
    reply(status());
    expect(await savePagedStockConfirmation(request())).toEqual(status());
    expect(await getPagedStockConfirmationStatus(request())).toEqual(status());
    reply(references());
    expect(await getPagedStockConfirmationReferences(request())).toEqual(
      references(),
    );
    const calls = params();
    expect(calls.map((call) => call.method)).toEqual(
      ['load', 'review', 'save', 'status', 'references'].map(
        (action) => `qorlia_confirmation_paged_${action}`,
      ),
    );
    expect(
      calls.every(
        (call) => call.model === 'stock.picking' && call.args.length === 0,
      ),
    ).toBe(true);
    expect(calls[1].kwargs).toEqual({
      ...selection(),
      after: 0,
      review_version: false,
      continuation_token: false,
      limit: 50,
    });
    expect(calls[2].kwargs).toEqual({ payload: request() });
    expect(calls[3].kwargs).toEqual({ payload: request() });
    expect(calls[4].kwargs).toEqual({
      payload: request(),
      after: 0,
      version: false,
      limit: 50,
    });
    expect((fetch as jest.Mock).mock.calls.map((call) => call[0])).toEqual(
      calls.map(
        (call) =>
          `/openmrs/qorlia-billing-api/web/dataset/call_kw/stock.picking/${call.method}`,
      ),
    );
    expect(checkedPagedStockConfirmationRequest(request())).toEqual(request());
    expect(() => checkedStockConfirmationRequest(request())).toThrow();
  });

  it('keeps 501/2001 counts compact without inventing a full graph', async () => {
    reply({
      ...load(),
      reason: 'Native confirmation is unavailable.',
      write_ready: false,
    });
    const current = await getPagedStockConfirmation(9, 11);
    expect(current.transfer.move_count).toBe(501);
    expect(current.transfer.operation_count).toBe(2001);
    expect(current.write_ready).toBe(false);
    expect(current).not.toHaveProperty('graph');
    expect(current.transfer).not.toHaveProperty('moves');
    expect(current.transfer).not.toHaveProperty('operations');
  });

  it('traverses exact review offsets without automatically fetching or saving', async () => {
    reply(review(0, 2));
    const first = await getPagedStockConfirmationReview(
      selection(),
      0,
      false,
      false,
      2,
    );
    expect(first.review_complete_token).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    reply(review(2, 2));
    const last = await getPagedStockConfirmationReview(
      selection(),
      2,
      first.review_version,
      first.continuation_token,
      2,
    );
    expect(params()[1].kwargs).toEqual({
      ...selection(),
      after: 2,
      review_version: first.review_version,
      continuation_token: first.continuation_token,
      limit: 2,
    });
    expect([
      ...first.effects.updated['stock.move'],
      ...last.effects.updated['stock.move'],
    ]).toEqual(effects().updated['stock.move']);
    expect(first.effects.private_audit_counts).toEqual(
      last.effects.private_audit_counts,
    );
    expect(last.next_after).toBe(false);
    expect(last.review_complete_token).toBe(request().review_complete_token);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('preserves terminal zero-visible-effects review and private audit counts', async () => {
    const data = review();
    for (const kind of [
      'created',
      'updated',
      'deleted',
      'schema',
      'labels',
    ] as const)
      data.effects[kind] = {};
    data.total_count = 0;
    reply(data);
    expect(await getPagedStockConfirmationReview(selection())).toEqual(data);
  });

  it('orders generated identities numerically across page boundaries and rejects unsafe ordinals', async () => {
    const page = (positions: string[]): PagedStockConfirmationReview => {
      const data = review();
      const values = data.effects.updated['stock.move'][0].after;
      data.effects.created['stock.move'] = positions.map((position) => ({
        key: `new:stock.move:${position}`,
        values,
        assigned_on_save: [],
      }));
      data.effects.updated['stock.move'] = [];
      return { ...data, after: 9, total_count: 11 };
    };
    const valid = page(['9', '10']);
    reply(valid);
    expect(
      await getPagedStockConfirmationReview(
        selection(),
        9,
        'b'.repeat(64),
        'c'.repeat(64),
        2,
      ),
    ).toEqual(valid);
    for (const positions of [
      ['10', '9'],
      ['9', '9007199254740993'],
    ]) {
      reply(page(positions));
      await expect(
        getPagedStockConfirmationReview(
          selection(),
          9,
          'b'.repeat(64),
          'c'.repeat(64),
          2,
        ),
      ).rejects.toThrow('Invalid');
    }
  });

  it('preserves not-yet-accepted status and historical state separately from current state', async () => {
    reply(status(false));
    expect((await getPagedStockConfirmationStatus(request())).accepted).toBe(
      false,
    );
    const data = status();
    data.current.transfer.state = 'done';
    data.current.reason = 'Already completed.';
    reply(data);
    expect((await getPagedStockConfirmationStatus(request())).state_after).toBe(
      'waiting',
    );
  });

  it('traverses reference pages and exact empty end pages with their own version', async () => {
    const first = references();
    first.rows = first.rows.slice(0, 1);
    first.next_after = 1;
    reply(first);
    expect(
      await getPagedStockConfirmationReferences(request(), 0, false, 1),
    ).toEqual(first);
    const last = references();
    last.after = 1;
    last.rows = last.rows.slice(1);
    reply(last);
    expect(
      await getPagedStockConfirmationReferences(request(), 1, first.version, 1),
    ).toEqual(last);
    expect(last.rows[0]).toMatchObject({
      available: false,
      id: false,
      name: false,
    });
    reply({ ...references(), after: 2, rows: [] });
    expect(
      (await getPagedStockConfirmationReferences(request(), 2, first.version))
        .rows,
    ).toEqual([]);
  });

  it('rejects malformed requests and review/reference cursors before network calls', async () => {
    for (const change of [
      { extra: true },
      { action: 'confirm' },
      { review_complete_token: false },
      { review_complete_token: 'D'.repeat(64) },
      { request_key: 'invalid' },
      { transfer_id: true },
      { order_id: -1 },
      { version: [] },
      { review_version: 'short' },
    ]) {
      await expect(
        savePagedStockConfirmation({ ...request(), ...change } as never),
      ).rejects.toThrow();
      await expect(
        getPagedStockConfirmationStatus({ ...request(), ...change } as never),
      ).rejects.toThrow();
      await expect(
        getPagedStockConfirmationReferences({
          ...request(),
          ...change,
        } as never),
      ).rejects.toThrow();
    }
    for (const [after, reviewVersion, token, limit] of [
      [true, false, false, 50],
      [-1, false, false, 50],
      [1, false, false, 50],
      [0, 'b'.repeat(64), false, 50],
      [0, false, 'c'.repeat(64), 50],
      [1, 'b'.repeat(64), false, 50],
      [0, false, false, 101],
      [0, false, false, 0],
    ])
      await expect(
        getPagedStockConfirmationReview(
          selection(),
          after as never,
          reviewVersion as never,
          token as never,
          limit as never,
        ),
      ).rejects.toThrow();
    for (const [after, version, limit] of [
      [true, false, 50],
      [-1, false, 50],
      [1, false, 50],
      [0, [], 50],
      [0, false, 101],
      [0, false, 0],
    ])
      await expect(
        getPagedStockConfirmationReferences(
          request(),
          after as never,
          version as never,
          limit as never,
        ),
      ).rejects.toThrow();
    await expect(getPagedStockConfirmation(0, 11)).rejects.toThrow();
    await expect(getPagedStockConfirmation(9, true as never)).rejects.toThrow();
    await expect(
      getPagedStockConfirmationReview({ ...selection(), version: [] } as never),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each<[string, (data: PagedStockConfirmationLoad) => void]>([
    [
      'wrong order',
      (data) => {
        data.order_id = 10;
      },
    ],
    [
      'wrong transfer',
      (data) => {
        data.transfer_id = 12;
      },
    ],
    [
      'wrong summary',
      (data) => {
        data.transfer.id = 12;
      },
    ],
    [
      'invalid version',
      (data) => {
        data.version = 'invalid';
      },
    ],
    [
      'negative count',
      (data) => {
        data.transfer.move_count = -1;
      },
    ],
    [
      'unsafe count',
      (data) => {
        data.package_count = 2 ** 53;
      },
    ],
    [
      'boolean count',
      (data) => {
        data.transfer.operation_count = true as never;
      },
    ],
    [
      'graph masquerade',
      (data) => {
        Object.assign(data, { graph: confirmationLoad().graph });
      },
    ],
    [
      'extra detail',
      (data) => {
        Object.assign(data.transfer, { moves: [] });
      },
    ],
    [
      'invalid reason',
      (data) => {
        data.reason = null as never;
      },
    ],
    [
      'invalid readiness',
      (data) => {
        data.write_ready = 'true' as never;
      },
    ],
  ])('rejects compact load: %s', async (_label, change) => {
    const data = load();
    change(data);
    reply(data);
    await expect(getPagedStockConfirmation(9, 11)).rejects.toThrow('Invalid');
  });

  it.each<[string, (data: PagedStockConfirmationReview) => void]>([
    [
      'wrong order',
      (data) => {
        data.order_id = 10;
      },
    ],
    [
      'wrong version',
      (data) => {
        data.version = 'f'.repeat(64);
      },
    ],
    [
      'wrong offset',
      (data) => {
        data.after = 1;
      },
    ],
    [
      'unsafe total',
      (data) => {
        data.total_count = 2 ** 53;
      },
    ],
    [
      'negative total',
      (data) => {
        data.total_count = -1;
      },
    ],
    [
      'short page',
      (data) => {
        data.effects.updated['stock.move'].pop();
      },
    ],
    [
      'extra page row',
      (data) => {
        data.effects.updated['stock.move'].push({
          ...data.effects.updated['stock.move'][0],
          id: 99,
        });
      },
    ],
    [
      'missing completion',
      (data) => {
        data.review_complete_token = false;
      },
    ],
    [
      'terminal continuation',
      (data) => {
        data.continuation_token = 'c'.repeat(64);
      },
    ],
    [
      'false-like cursor',
      (data) => {
        data.next_after = 0;
      },
    ],
    [
      'unsorted IDs',
      (data) => {
        data.effects.updated['stock.move'].reverse();
      },
    ],
    [
      'duplicate IDs',
      (data) => {
        data.effects.updated['stock.move'][1].id = 12;
      },
    ],
    [
      'invalid amount',
      (data) => {
        data.effects.updated['stock.move'][0].after.product_uom_qty = Infinity;
      },
    ],
    [
      'unknown field',
      (data) => {
        data.effects.updated['stock.move'][0].after.secret = 'bad';
      },
    ],
    [
      'malformed reference',
      (data) => {
        data.effects.updated['stock.move'][0].after.lot_id = [];
      },
    ],
    [
      'unrelated label',
      (data) => {
        data.effects.labels['res.users:1'] = 'unrelated';
      },
    ],
    [
      'private content',
      (data) => {
        Object.assign(data, { private_audit: { body: 'must not appear' } });
      },
    ],
    [
      'unknown private model',
      (data) => {
        data.effects.private_audit_counts['res.users'] = {
          created: 1,
          updated: 0,
          deleted: 0,
        };
      },
    ],
    [
      'negative private count',
      (data) => {
        data.effects.private_audit_counts['mail.tracking.value'].created = -1;
      },
    ],
    [
      'empty model',
      (data) => {
        for (const kind of ['created', 'updated', 'deleted'] as const)
          data.effects[kind]['stock.lot'] = [];
        data.effects.schema['stock.lot'] = {};
      },
    ],
    [
      'invalid state',
      (data) => {
        data.state_after = 'done' as never;
      },
    ],
    [
      'invalid readiness',
      (data) => {
        data.write_ready = null as never;
      },
    ],
  ])('rejects review: %s', async (_label, change) => {
    const data = review();
    change(data);
    reply(data);
    await expect(getPagedStockConfirmationReview(selection())).rejects.toThrow(
      'Invalid',
    );
  });

  it('rejects inconsistent nonterminal proofs and changed continuation reviews', async () => {
    for (const change of [
      { next_after: 1 },
      { next_after: false },
      { continuation_token: false },
      { review_complete_token: 'd'.repeat(64) },
    ]) {
      reply({ ...review(0, 2), ...change });
      await expect(
        getPagedStockConfirmationReview(selection(), 0, false, false, 2),
      ).rejects.toThrow('Invalid');
    }
    reply({ ...review(2, 2), review_version: 'f'.repeat(64) });
    await expect(
      getPagedStockConfirmationReview(
        selection(),
        2,
        'b'.repeat(64),
        'c'.repeat(64),
        2,
      ),
    ).rejects.toThrow('Invalid');
  });

  it.each<[string, (data: PagedStockConfirmationStatus) => void]>([
    [
      'nonce mismatch',
      (data) => {
        data.request_key = 'another';
      },
    ],
    [
      'invalid count',
      (data) => {
        data.reference_count = -1;
      },
    ],
    [
      'false acceptance with state',
      (data) => {
        data.accepted = false;
      },
    ],
    [
      'invalid state',
      (data) => {
        data.state_after = 'done' as never;
      },
    ],
    [
      'raw references',
      (data) => {
        Object.assign(data, { references: {} });
      },
    ],
    [
      'invalid current',
      (data) => {
        data.current.transfer.id = 99;
      },
    ],
  ])('rejects status: %s', async (_label, change) => {
    const data = status();
    change(data);
    reply(data);
    await expect(getPagedStockConfirmationStatus(request())).rejects.toThrow(
      'Invalid',
    );
  });

  it.each<[string, (data: PagedStockConfirmationReferences) => void]>([
    [
      'nonce mismatch',
      (data) => {
        data.request_key = 'another';
      },
    ],
    [
      'bad snapshot',
      (data) => {
        data.version = 'short';
      },
    ],
    [
      'wrong offset',
      (data) => {
        data.after = 1;
      },
    ],
    [
      'negative total',
      (data) => {
        data.total_count = -1;
      },
    ],
    [
      'short page',
      (data) => {
        data.rows.pop();
      },
    ],
    [
      'out of order',
      (data) => {
        data.rows.reverse();
      },
    ],
    [
      'duplicate keys',
      (data) => {
        data.rows[1] = data.rows[0];
      },
    ],
    [
      'wrong key model',
      (data) => {
        data.rows[0].key = 'new:stock.picking:0';
      },
    ],
    [
      'private reference',
      (data) => {
        data.rows[0].model = 'mail.message';
        data.rows[0].key = 'new:mail.message:0';
      },
    ],
    [
      'unavailable identity leak',
      (data) => {
        data.rows[1].id = 99;
      },
    ],
    [
      'unavailable name leak',
      (data) => {
        data.rows[1].name = 'hidden';
      },
    ],
    [
      'missing available identity',
      (data) => {
        data.rows[0].id = false;
      },
    ],
    [
      'wrong end cursor',
      (data) => {
        data.next_after = 2;
      },
    ],
  ])('rejects references: %s', async (_label, change) => {
    const data = references();
    change(data);
    reply(data);
    await expect(
      getPagedStockConfirmationReferences(request()),
    ).rejects.toThrow('Invalid');
  });

  it('rejects a changed reference snapshot and preserves native session/business errors', async () => {
    reply({ ...references(), after: 1, rows: references().rows.slice(1) });
    await expect(
      getPagedStockConfirmationReferences(request(), 1, 'f'.repeat(64)),
    ).rejects.toThrow('Invalid');
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        error: {
          data: {
            name: 'odoo.exceptions.UserError',
            arguments: ['Native review is stale.'],
          },
        },
      }),
    });
    await expect(getPagedStockConfirmationReview(selection())).rejects.toThrow(
      'Native review is stale.',
    );
    await expect(
      getPagedStockConfirmationReview(selection()),
    ).rejects.toBeInstanceOf(BillingActionRejected);
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: { code: 100 } }),
    });
    await expect(
      getPagedStockConfirmationStatus(request()),
    ).rejects.toBeInstanceOf(BillingSessionExpired);
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        error: {
          data: {
            name: 'odoo.exceptions.AccessError',
            arguments: ['QorliaQA private record detail'],
          },
        },
      }),
    });
    await expect(
      getPagedStockConfirmationReferences(request()),
    ).rejects.toThrow(
      'Billing access failed. Check your billing account permissions.',
    );
    const navigation = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      (fetch as jest.Mock).mockResolvedValue({ ok: false, status: 401 });
      await expect(getPagedStockConfirmation(9, 11)).rejects.toThrow(
        'Sign in to Qorlia to open Billing.',
      );
      expect(navigation).toHaveBeenCalledTimes(1);
      expect(navigation).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'not implemented' }),
      );
    } finally {
      navigation.mockRestore();
    }
    expect(
      params().every(
        (call) => call.method !== 'qorlia_confirmation_paged_save',
      ),
    ).toBe(true);
  });
});
