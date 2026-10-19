import {
  BillingSessionExpired,
  checkedPagedStockValidationRequest,
  getPagedStockValidationStatus,
  getPagedStockValidationPromptPage,
  getPagedStockValidationReferencePage,
  savePagedStockValidation,
  stopPagedStockValidation,
  type PagedStockValidationRequest,
  type PagedStockValidationStatus,
} from '../billingService';
import { orderDeliveryPageFixture } from './orderDeliveryFixture';
import { validationRequest } from './stockValidationFixture';

const key = '11111111-2222-4333-8444-555555555555',
  parent = '22222222-2222-4333-8444-555555555555';
const request = (): PagedStockValidationRequest => ({
  ...validationRequest(),
  continuation_key: false,
  review_complete_token: 'c'.repeat(64),
});
const continuation = (): PagedStockValidationRequest => ({
  ...request(),
  continuation_key: parent,
  decisions: [{ kind: 'immediate', selected: true }],
});
const state = (): PagedStockValidationStatus => ({
  accepted: true,
  stopped: false,
  request_key: key,
  current: {
    order_id: 9,
    transfer_id: 11,
    version: 'd'.repeat(64),
    transfer: {
      ...orderDeliveryPageFixture().rows[0],
      move_count: 501,
      operation_count: 2001,
    },
  },
  receipt: {
    request_key: key,
    state_after: 'assigned',
    reference_count: 1,
    next_step: {
      kind: 'immediate',
      title: 'Native prompt',
      blocked_reason: false,
      counts: { transfers: 1, lots: 0, operations: 0 },
    },
    prompt_count: 1,
    prompt_version: 'e'.repeat(64),
    continuation_key: key,
    continuation_reason: false,
    terminal: false,
  },
});
const prompt = () => {
  const receipt = state().receipt;
  return {
    request_key: key,
    receipt_key: key,
    version: 'e'.repeat(64),
    descriptor: receipt && receipt.next_step,
    after: 0,
    total_count: 1,
    next_after: false,
    rows: [
      {
        section: 'transfers',
        value: { transfer: [11, 'QA Transfer'], selected: true },
      },
    ],
  };
};
const refs = () => ({
  request_key: key,
  receipt_key: key,
  version: 'd'.repeat(64),
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
describe('Exact complete native validation write and recovery client', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('keeps all eight exact fields and uses only the five fixed write/recovery methods', async () => {
    expect(checkedPagedStockValidationRequest(request())).toEqual(request());
    for (const method of [
      savePagedStockValidation,
      getPagedStockValidationStatus,
      stopPagedStockValidation,
    ]) {
      reply(state());
      expect(await method(request())).toEqual(state());
    }
    reply(prompt());
    await getPagedStockValidationPromptPage(request());
    reply(refs());
    await getPagedStockValidationReferencePage(request());
    const calls = (fetch as jest.Mock).mock.calls.map(
      (call) => JSON.parse(call[1].body).params,
    );
    expect(calls.map((value) => value.method)).toEqual([
      'qorlia_validation_paged_save',
      'qorlia_validation_paged_status',
      'qorlia_validation_paged_stop',
      'qorlia_validation_paged_prompt_page',
      'qorlia_validation_paged_reference_page',
    ]);
    for (const call of calls) {
      expect(call.model).toBe('stock.picking');
      expect(call.args).toEqual([]);
      expect(call.kwargs.payload).toEqual(request());
    }
  });
  it('keeps unknown acceptance distinct from stopped and accepted outcomes', async () => {
    const unknown = { ...state(), accepted: false, receipt: false };
    reply(unknown);
    expect(await getPagedStockValidationStatus(request())).toEqual(unknown);
    await expect(savePagedStockValidation(request())).rejects.toThrow(
      /not acknowledged/,
    );
    await expect(stopPagedStockValidation(request())).rejects.toThrow(
      /not acknowledged/,
    );
    const stopped = { ...unknown, stopped: true };
    reply(stopped);
    expect(await stopPagedStockValidation(request())).toEqual(stopped);
    await expect(savePagedStockValidation(request())).rejects.toThrow(
      /not acknowledged/,
    );
  });
  it('retains the prior accepted receipt and prompt when this continuation is stopped', async () => {
    const receipt = state().receipt;
    const data = {
      ...state(),
      accepted: false,
      stopped: true,
      receipt: receipt && {
        ...receipt,
        request_key: parent,
        continuation_key: parent,
      },
    };
    reply(data);
    expect(await stopPagedStockValidation(continuation())).toEqual(data);
    expect(await getPagedStockValidationStatus(continuation())).toEqual(data);
    const page = { ...prompt(), receipt_key: parent };
    reply(page);
    expect(await getPagedStockValidationPromptPage(continuation())).toEqual(
      page,
    );
    const references = { ...refs(), receipt_key: parent };
    reply(references);
    expect(await getPagedStockValidationReferencePage(continuation())).toEqual(
      references,
    );
  });
  it('preserves an accepted terminal decline without inventing delivery', async () => {
    const receipt = state().receipt;
    const data = {
      ...state(),
      receipt: receipt && {
        ...receipt,
        next_step: false,
        prompt_count: 0,
        prompt_version: false,
        continuation_key: false,
        terminal: true,
      },
    };
    reply(data);
    expect(await getPagedStockValidationStatus(request())).toEqual(data);
  });
  it.each([
    { accepted: true, stopped: true },
    { receipt: false },
    { accepted: false },
    { request_key: parent },
    { stopped: 'yes' },
    { current: { ...state().current, transfer_id: 99 } },
    { receipt: { ...state().receipt, request_key: parent } },
    { receipt: { ...state().receipt, terminal: true } },
    { receipt: { ...state().receipt, prompt_count: 2 } },
    { receipt: { ...state().receipt, accepted: false } },
    { receipt: { ...state().receipt, next_action: { res_id: 1 } } },
  ])('rejects inconsistent outcome fields: %j', async (change) => {
    reply({ ...state(), ...change });
    await expect(getPagedStockValidationStatus(request())).rejects.toThrow();
  });
  it('rejects losing a prior receipt or silently replacing it with this unaccepted child', async () => {
    reply({ ...state(), accepted: false, stopped: true, receipt: false });
    await expect(getPagedStockValidationStatus(continuation())).rejects.toThrow(
      /identity/,
    );
    reply({ ...state(), accepted: false, stopped: true });
    await expect(getPagedStockValidationStatus(continuation())).rejects.toThrow(
      /identity/,
    );
  });
  it.each([
    { review_complete_token: false },
    { context: {} },
    { continuation_key: key },
    { request_key: 'bad' },
    { order_id: true },
  ])(
    'rejects wrong proof, nonce, context or identity before HTTP: %j',
    async (change) => {
      const value = { ...request(), ...change } as PagedStockValidationRequest;
      await expect(getPagedStockValidationStatus(value)).rejects.toThrow();
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it('does not accept an old seven-key request or completion proof stripped to fit an old protocol', async () => {
    const { review_complete_token, ...legacy } = request();
    expect(review_complete_token).toHaveLength(64);
    await expect(
      savePagedStockValidation(legacy as PagedStockValidationRequest),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['prompt', 'reference'] as const)(
    'binds %s pages to this request or its explicit prior receipt, snapshot and bounded cursor',
    async (kind) => {
      const data = kind === 'prompt' ? prompt() : refs();
      const read =
        kind === 'prompt'
          ? getPagedStockValidationPromptPage
          : getPagedStockValidationReferencePage;
      reply({ ...data, receipt_key: '33333333-2222-4333-8444-555555555555' });
      await expect(read(request())).rejects.toThrow(/identity/);
      reply({ ...data, request_key: parent });
      await expect(read(request())).rejects.toThrow();
      reply({ ...data, version: 'f'.repeat(64) });
      await expect(read(request(), 0, 'e'.repeat(64))).rejects.toThrow();
      reply(data);
      await expect(read(request(), 1, false)).rejects.toThrow();
    },
  );
  it('rejects raw audit/finance bodies and unsafe prompt values in recovery pages', async () => {
    reply({
      ...refs(),
      rows: [
        {
          key: 'new:mail.message:0',
          model: 'mail.message',
          id: 3,
          name: 'Hidden',
          available: true,
        },
      ],
    });
    await expect(
      getPagedStockValidationReferencePage(request()),
    ).rejects.toThrow();
    reply({
      ...prompt(),
      rows: [
        {
          section: 'transfers',
          value: { transfer: [99, 'Other'], selected: true },
        },
      ],
    });
    await expect(
      getPagedStockValidationPromptPage(request()),
    ).rejects.toThrow();
  });
  it('preserves native expiry without a fallback endpoint or retry', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: { code: 100, message: 'Session expired' } }),
    });
    await expect(savePagedStockValidation(request())).rejects.toBeInstanceOf(
      BillingSessionExpired,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
