import {
  BillingSessionExpired,
  getStockValidationStepCompactStatus,
  getStockValidationStepPromptPage,
  getStockValidationStepReferencePage,
  type StockValidationPromptMetadata,
  type StockValidationPromptPage,
  type StockValidationStepCompactStatus,
  type StockValidationStepRequest,
} from '../billingService';
import { orderDeliveryPageFixture } from './orderDeliveryFixture';
import { validationRequest } from './stockValidationFixture';

const request = (): StockValidationStepRequest => ({
  ...validationRequest(),
  continuation_key: false,
});
const metadata = (): StockValidationPromptMetadata => ({
  kind: 'immediate',
  title: 'Native prompt',
  blocked_reason: false,
  counts: { transfers: 1, lots: 0, operations: 0 },
});
const status = (): StockValidationStepCompactStatus => ({
  accepted: true,
  request_key: request().request_key,
  state_after: 'assigned',
  reference_count: 0,
  current: {
    order_id: 9,
    transfer_id: 11,
    version: 'e'.repeat(64),
    transfer: {
      ...orderDeliveryPageFixture().rows[0],
      move_count: 501,
      operation_count: 2001,
    },
  },
  next_step: metadata(),
  prompt_count: 1,
  prompt_version: 'f'.repeat(64),
  continuation_key: request().request_key,
  continuation_reason: false,
  terminal: false,
});
const prompt = (): StockValidationPromptPage => ({
  request_key: request().request_key,
  version: 'f'.repeat(64),
  descriptor: metadata(),
  after: 0,
  total_count: 1,
  next_after: false,
  rows: [
    {
      section: 'transfers',
      value: { transfer: [11, 'QA Transfer'], selected: true },
    },
  ],
});
const references = () => ({
  request_key: request().request_key,
  version: 'e'.repeat(64),
  after: 0,
  total_count: 1,
  next_after: false,
  rows: [
    {
      key: 'new:stock.valuation.layer:0',
      model: 'stock.valuation.layer',
      id: false,
      name: false,
      available: false,
    },
  ],
});
const reply = (result: unknown) =>
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });

describe('Compact accepted validation-step recovery API boundary', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('uses exactly three named read APIs and preserves the original seven-key request', async () => {
    reply(status());
    expect(await getStockValidationStepCompactStatus(request())).toEqual(
      status(),
    );
    reply(prompt());
    expect(await getStockValidationStepPromptPage(request())).toEqual(prompt());
    reply(references());
    expect(await getStockValidationStepReferencePage(request())).toEqual(
      references(),
    );
    expect(
      (fetch as jest.Mock).mock.calls.map(
        (call) => JSON.parse(call[1].body).params,
      ),
    ).toEqual([
      {
        model: 'stock.picking',
        method: 'qorlia_validation_step_compact_status',
        args: [],
        kwargs: { payload: request() },
      },
      {
        model: 'stock.picking',
        method: 'qorlia_validation_step_prompt_page',
        args: [],
        kwargs: { payload: request(), after: 0, version: false, limit: 50 },
      },
      {
        model: 'stock.picking',
        method: 'qorlia_validation_step_reference_page',
        args: [],
        kwargs: { payload: request(), after: 0, version: false, limit: 50 },
      },
    ]);
  });
  it.each([
    {
      accepted: false,
      state_after: false,
      next_step: false,
      prompt_count: 0,
      prompt_version: false,
      continuation_key: false,
      terminal: false,
    },
    {
      state_after: 'done',
      next_step: false,
      prompt_count: 0,
      prompt_version: false,
      continuation_key: false,
      terminal: true,
    },
    {
      next_step: false,
      prompt_count: 0,
      prompt_version: false,
      continuation_key: false,
      continuation_reason: 'Prompt consumed',
      terminal: false,
    },
  ])(
    'keeps unknown, terminal and missing/consumed prompt states distinct: %j',
    async (change) => {
      const data = { ...status(), ...change };
      reply(data);
      expect(await getStockValidationStepCompactStatus(request())).toEqual(
        data,
      );
    },
  );
  it.each([
    { accepted: false },
    { state_after: 'paid' },
    { reference_count: -1 },
    { terminal: true },
    { prompt_count: 2 },
    { prompt_version: false },
    { continuation_key: '22222222-2222-4333-8444-555555555555' },
    { next_step: { ...metadata(), transfers: [] } },
    { current: { ...status().current, transfer_id: 99 } },
    {
      next_step: {
        ...metadata(),
        counts: { transfers: 1, lots: 1, operations: 0 },
      },
    },
  ])(
    'rejects inconsistent compact status rather than guessing: %j',
    async (change) => {
      reply({ ...status(), ...change });
      await expect(
        getStockValidationStepCompactStatus(request()),
      ).rejects.toThrow(/compact validation/);
    },
  );
  it('reads all 101 receipt operations with bounded pages and exact snapshot pins', async () => {
    const descriptor: StockValidationPromptMetadata = {
      kind: 'receipt',
      title: 'Receipt review',
      blocked_reason: false,
      source: [3, 'Supplier'],
      destination: [4, 'Stock'],
      picking_code: 'incoming',
      counts: { transfers: 0, lots: 0, operations: 101 },
    };
    for (const after of [0, 50, 100]) {
      const data: StockValidationPromptPage = {
        ...prompt(),
        descriptor,
        after,
        total_count: 101,
        next_after: after + 50 < 101 ? after + 50 : false,
        rows: Array.from({ length: Math.min(50, 101 - after) }, (_, index) => ({
          section: 'operations' as const,
          value: {
            id: 1001 + after + index,
            product_id: [5, 'Medicine'],
            product_uom_id: [6, 'Unit'],
            qty_done: 1,
            lot_id: false,
            lot_name: 'QA Batch',
            expiration_date: '2027-02-01T00:00:00',
            cost_price: 2.5,
            sale_price: 5,
            mrp: 7,
            balance: 0,
            is_move_line_lot_expiring_soon: false,
            expiry_warning: false,
          },
        })),
      };
      reply(data);
      expect(
        await getStockValidationStepPromptPage(
          request(),
          after,
          after === 0 ? false : 'f'.repeat(64),
        ),
      ).toEqual(data);
    }
  });
  it('accepts native expiry and blocked SMS metadata without treating them as completed delivery', async () => {
    const expiry: StockValidationPromptMetadata = {
      kind: 'expiry',
      title: 'Native expiry',
      blocked_reason: false,
      description: 'Native warning',
      counts: { transfers: 0, lots: 1, operations: 0 },
    };
    reply({ ...status(), next_step: expiry });
    expect(
      (await getStockValidationStepCompactStatus(request())).terminal,
    ).toBe(false);
    reply({
      ...prompt(),
      descriptor: expiry,
      rows: [{ section: 'lots', value: [7, 'QA Expired batch'] }],
    });
    expect(
      (await getStockValidationStepPromptPage(request())).rows,
    ).toHaveLength(1);
    reply({
      ...status(),
      next_step: {
        kind: 'sms',
        title: 'Native SMS',
        blocked_reason: 'Sending is not accepted',
        counts: { transfers: 0, lots: 0, operations: 0 },
      },
      prompt_count: 0,
    });
    expect(
      (await getStockValidationStepCompactStatus(request())).terminal,
    ).toBe(false);
  });
  it.each([
    { version: 'a'.repeat(64) },
    { after: 1 },
    { total_count: 2 },
    { next_after: 1 },
    { rows: [] },
    {
      descriptor: {
        ...metadata(),
        counts: { transfers: 0, lots: 0, operations: 0 },
      },
    },
    {
      rows: [
        {
          section: 'transfers',
          value: { transfer: [99, 'Wrong transfer'], selected: true },
        },
      ],
    },
    { rows: [{ section: 'operations', value: { id: 7 } }] },
    {
      rows: [
        {
          section: 'transfers',
          value: { transfer: [11, 'QA'], selected: true, context: {} },
        },
      ],
    },
  ])('rejects malformed, mixed or changed prompt pages: %j', async (change) => {
    reply({ ...prompt(), ...change });
    await expect(
      getStockValidationStepPromptPage(request(), 0, 'f'.repeat(64)),
    ).rejects.toThrow(/prompt page/);
  });
  it.each([
    { rows: [{ ...references().rows[0], id: 7 }] },
    {
      rows: [
        {
          ...references().rows[0],
          model: 'mail.message',
          key: 'new:mail.message:0',
        },
      ],
    },
    { total_count: 2 },
    { next_after: 1 },
    { request_key: '22222222-2222-4333-8444-555555555555' },
  ])(
    'protects validation reference identities, privacy and completeness: %j',
    async (change) => {
      reply({ ...references(), ...change });
      await expect(
        getStockValidationStepReferencePage(request()),
      ).rejects.toThrow(/reference page/);
    },
  );
  it.each([
    [-1, false, 50],
    [1, false, 50],
    [0, false, 0],
    [0, false, 101],
    [0, 'invalid', 50],
  ])(
    'rejects invalid read bounds before HTTP: %j',
    async (after, version, limit) => {
      await expect(
        getStockValidationStepPromptPage(
          request(),
          after as number,
          version as string | false,
          limit as number,
        ),
      ).rejects.toThrow();
      await expect(
        getStockValidationStepReferencePage(
          request(),
          after as number,
          version as string | false,
          limit as number,
        ),
      ).rejects.toThrow();
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it('rejects extra request context and other request families before HTTP', async () => {
    for (const reader of [
      getStockValidationStepCompactStatus,
      getStockValidationStepPromptPage,
      getStockValidationStepReferencePage,
    ])
      await expect(
        reader({
          ...request(),
          context: { skip_immediate: true },
        } as StockValidationStepRequest),
      ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps session expiry distinct from an unknown result or empty prompt', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: { code: 100 } }),
    });
    await expect(
      getStockValidationStepCompactStatus(request()),
    ).rejects.toBeInstanceOf(BillingSessionExpired);
  });
});
