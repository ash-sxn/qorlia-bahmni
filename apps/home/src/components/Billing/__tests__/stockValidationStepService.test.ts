import {
  checkedStockValidationStepRequest,
  getStockValidationStepStatus,
  previewStockValidationStep,
  saveStockValidationStep,
  StockValidationStepRequest,
  StockValidationStepReview,
  StockValidationStepStatus,
} from '../billingService';
import {
  terminalValidationReview,
  validationRequest,
  validationStatus,
  validationStep,
  validationWizardReview,
} from './stockValidationFixture';

const request = (): StockValidationStepRequest => ({
  ...validationRequest(),
  continuation_key: false,
});
const selection = () => {
  const value = request();
  return {
    order_id: value.order_id,
    transfer_id: value.transfer_id,
    version: value.version,
    decisions: value.decisions,
    continuation_key: value.continuation_key,
  };
};
const review = (): StockValidationStepReview => ({
  ...validationWizardReview(validationStep()),
  continuation_key: false,
  write_ready: true,
  review_version: 'b'.repeat(64),
});
const receipt = (): StockValidationStepStatus => ({
  ...validationStatus(),
  state_after: 'assigned',
  references: {},
  next_step: validationStep(),
  continuation_key: request().request_key,
  continuation_reason: false,
  terminal: false,
});
const reply = (result: unknown) =>
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });

describe('native validation per-RPC step service', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('uses exactly three named APIs and preserves a signed nonterminal save', async () => {
    reply(review());
    expect(await previewStockValidationStep(selection())).toEqual(review());
    reply(receipt());
    expect(await saveStockValidationStep(request())).toEqual(receipt());
    expect(await getStockValidationStepStatus(request())).toEqual(receipt());
    expect((fetch as jest.Mock).mock.calls.map(([url]) => url)).toEqual(
      ['preview', 'save', 'status'].map(
        (action) =>
          `/openmrs/qorlia-billing-api/web/dataset/call_kw/stock.picking/qorlia_validation_step_${action}`,
      ),
    );
    expect(
      JSON.parse((fetch as jest.Mock).mock.calls[1][1].body).params,
    ).toEqual({
      model: 'stock.picking',
      method: 'qorlia_validation_step_save',
      args: [],
      kwargs: { payload: request() },
    });
  });

  it('binds one decision to the previous request and keeps preparation separate from delivery', async () => {
    const value = {
      ...request(),
      request_key: '22222222-2222-4333-8444-555555555555',
      continuation_key: request().request_key,
      decisions: [{ kind: 'immediate' as const, selected: true }],
    };
    const selected = {
      ...selection(),
      continuation_key: value.continuation_key,
      decisions: value.decisions,
    };
    const next: StockValidationStepReview = {
      ...review(),
      ...selected,
      next_step: {
        ...validationStep(),
        kind: 'expiry',
        transfers: [],
        lots: [[4, 'QorliaQA batch']],
        description: 'Native warning',
      },
    };
    reply(next);
    expect(await previewStockValidationStep(selected)).toEqual(next);
    reply({
      ...receipt(),
      request_key: value.request_key,
      continuation_key: value.request_key,
      next_step: next.next_step,
    });
    const result = await saveStockValidationStep(value);
    expect(result.state_after).toBe('assigned');
    expect(result.terminal).toBe(false);
  });

  it.each([
    { context: { skip_immediate: true } },
    { continuation_key: true },
    { continuation_key: 'not-a-request' },
    { continuation_key: request().request_key },
    { decisions: [{ kind: 'immediate', selected: true }] },
    { continuation_key: '22222222-2222-4333-8444-555555555555', decisions: [] },
    {
      continuation_key: '22222222-2222-4333-8444-555555555555',
      decisions: [{ kind: 'receipt', confirm: false }],
    },
    {
      continuation_key: '22222222-2222-4333-8444-555555555555',
      decisions: [{ kind: 'expiry', proceed: false, context: {} }],
    },
    {
      continuation_key: '22222222-2222-4333-8444-555555555555',
      decisions: [
        { kind: 'expiry', proceed: false },
        { kind: 'backorder', selected: true },
      ],
    },
  ])(
    'rejects malformed continuation/decisions before sending: %j',
    async (change) => {
      const value = { ...request(), ...change } as StockValidationStepRequest;
      expect(() => checkedStockValidationStepRequest(value)).toThrow();
      await expect(saveStockValidationStep(value)).rejects.toThrow();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('does not accept unsigned, foreign, blocked or changed preview results', async () => {
    const changes: ((value: StockValidationStepReview) => void)[] = [
      (value) => {
        value.review_version = false as unknown as string;
      },
      (value) => {
        value.write_ready = false;
      },
      (value) => {
        value.continuation_key = request().request_key;
      },
      (value) => {
        value.decisions = [{ kind: 'expiry', proceed: false }];
      },
      (value) => {
        value.transfer_id = 12;
      },
      (value) => {
        value.terminal = true;
      },
      (value) => {
        if (value.next_step) value.next_step.transfers[0].transfer[0] = 12;
      },
      (value) => {
        value.next_step = {
          ...validationStep(),
          kind: 'sms',
          transfers: [],
          blocked_reason: 'Not approved',
        };
      },
      (value) => {
        value.effects.private_effect_counts['stock.quant'] = {
          created: 1,
          updated: 0,
          deleted: 0,
        };
      },
    ];
    for (const change of changes) {
      const value = review();
      change(value);
      reply(value);
      await expect(previewStockValidationStep(selection())).rejects.toThrow(
        'Invalid native step review',
      );
    }
  });

  it('accepts terminal native states only without a continuation or prompt', async () => {
    const value: StockValidationStepReview = {
      ...terminalValidationReview(),
      continuation_key: false,
      review_version: 'b'.repeat(64),
    };
    reply(value);
    expect((await previewStockValidationStep(selection())).terminal).toBe(true);
    const result: StockValidationStepStatus = {
      ...receipt(),
      state_after: 'done',
      terminal: true,
      next_step: false,
      continuation_key: false,
    };
    reply(result);
    expect(await saveStockValidationStep(request())).toEqual(result);
    result.continuation_key = request().request_key;
    reply(result);
    await expect(saveStockValidationStep(request())).rejects.toThrow(
      'Invalid native continuation',
    );
  });

  it('keeps an accepted receipt when its prompt is consumed, expired or no longer permitted', async () => {
    const result: StockValidationStepStatus = {
      ...receipt(),
      next_step: false,
      continuation_key: false,
      continuation_reason: 'The saved native prompt is unavailable.',
    };
    reply(result);
    expect(await getStockValidationStepStatus(request())).toEqual(result);
    result.continuation_reason = false;
    reply(result);
    await expect(getStockValidationStepStatus(request())).rejects.toThrow(
      'Invalid native continuation',
    );
  });

  it('accepts unknown status but never treats an unaccepted save as success', async () => {
    const result: StockValidationStepStatus = {
      ...receipt(),
      accepted: false,
      state_after: false,
      next_step: false,
      continuation_key: false,
      continuation_reason: false,
      terminal: false,
    };
    reply(result);
    expect(await getStockValidationStepStatus(request())).toEqual(result);
    await expect(saveStockValidationStep(request())).rejects.toThrow(
      'Invalid validation receipt',
    );
    result.terminal = true;
    reply(result);
    await expect(getStockValidationStepStatus(request())).rejects.toThrow(
      'Invalid native continuation',
    );
  });

  it('rejects private actions, foreign references and invented follow-up identities', async () => {
    for (const change of [
      {
        next_action: {
          res_model: 'stock.immediate.transfer',
          res_id: 7,
          context: {},
        },
      },
      { continuation_key: '22222222-2222-4333-8444-555555555555' },
      {
        references: {
          'new:res.users:0': {
            model: 'res.users',
            id: 1,
            name: 'Private',
            available: true,
          },
        },
      },
      { current: { ...receipt().current, order_id: 10 } },
    ]) {
      reply({ ...receipt(), ...change });
      await expect(getStockValidationStepStatus(request())).rejects.toThrow();
    }
  });

  it('does not automatically retry an unavailable native step save', async () => {
    (fetch as jest.Mock).mockRejectedValue(new TypeError('Response lost'));
    await expect(saveStockValidationStep(request())).rejects.toThrow(
      'Response lost',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
