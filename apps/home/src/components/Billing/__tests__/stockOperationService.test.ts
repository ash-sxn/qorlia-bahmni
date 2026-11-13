import {
  checkedStockOperationRequest,
  getStockOperationStatus,
  previewStockOperation,
  saveStockOperation,
  StockOperationRequest,
  StockOperationReview,
} from '../billingService';
import {
  operationRequest,
  operationReview,
  operationStatus,
  operationSelectionRequest,
} from './stockOperationFixture';

const reply = (result: unknown) =>
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });
const selection = operationSelectionRequest;
describe('Reviewed native operation write boundary', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('transmits only the scoped preview and exact save/status payload, preserving ordered edits', async () => {
    reply(operationReview());
    expect(await previewStockOperation(selection())).toEqual(operationReview());
    reply(operationStatus());
    expect(await saveStockOperation(operationRequest())).toEqual(
      operationStatus(),
    );
    expect(await getStockOperationStatus(operationRequest())).toEqual(
      operationStatus(),
    );
    for (const [index, method] of ['preview', 'save', 'status'].entries()) {
      const [url, options] = (fetch as jest.Mock).mock.calls[index];
      expect(url).toContain(`/stock.picking/qorlia_operation_${method}`);
      expect(JSON.parse(options.body).params).toEqual({
        model: 'stock.picking',
        method: `qorlia_operation_${method}`,
        args: [],
        kwargs: { payload: index ? operationRequest() : selection() },
      });
    }
  });
  it('rejects malformed actions, deletions, extra authority and non-finite values before network access', async () => {
    for (const change of [
      { action: 'validate' },
      { action: 'delete', operation_id: false, edits: [] },
      { action: 'delete' },
      { context: { sudo: true } },
      { review_version: 'bad' },
      { request_key: 'bad' },
      { edits: [{ field: 'qty_done', value: Infinity }] },
    ]) {
      const request = {
        ...operationRequest(),
        ...change,
      } as StockOperationRequest;
      expect(() => checkedStockOperationRequest(request)).toThrow();
      await expect(saveStockOperation(request)).rejects.toThrow();
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it('accepts a native new-operation preview without inventing a saved identity', async () => {
    const result = operationReview();
    result.operation_id = false;
    result.form.operation_id = false;
    result.after.transfer.operations[0].id = false;
    result.after.form_rows[0].id = false;
    reply(result);
    expect(
      await previewStockOperation({ ...selection(), operation_id: false }),
    ).toEqual(result);
    reply(operationStatus());
    expect(
      (await saveStockOperation({ ...operationRequest(), operation_id: false }))
        .operation_id,
    ).toBe(13);
  });
  it('accepts removal and exact recovery after the saved operation no longer exists', async () => {
    const request = {
      ...operationRequest(),
      action: 'delete' as const,
      edits: [],
    };
    const result = operationReview();
    result.action = 'delete';
    result.edits = [];
    result.after.transfer.operations = [];
    result.after.form_rows = [];
    reply(result);
    expect(
      (
        await previewStockOperation({
          ...selection(),
          action: 'delete',
          edits: [],
        })
      ).action,
    ).toBe('delete');
    const receipt = {
      ...operationStatus(),
      action: 'delete',
      operation_id: false,
    };
    receipt.current.graph.transfer.operations = [];
    reply(receipt);
    expect(await getStockOperationStatus(request)).toEqual(receipt);
    reply({ ...receipt, action: 'save', operation_id: 13 });
    expect((await getStockOperationStatus(operationRequest())).accepted).toBe(
      true,
    );
  });
  it('rejects mismatched form rows, physical inventory movement, terminal transfers and foreign review identities', async () => {
    const changes: ((value: StockOperationReview) => void)[] = [
      (value) => {
        value.move_id = 99;
      },
      (value) => {
        value.form.version = 'c'.repeat(64);
      },
      (value) => {
        value.after.transfer.state = 'done';
      },
      (value) => {
        value.after.form_rows[0].values.qty_done = 99;
      },
      (value) => {
        value.after.form_rows[0].values.location_id = 99;
      },
      (value) => {
        value.after.form_rows[0].values.balance = NaN;
      },
      (value) => {
        value.after.form_rows = [];
      },
      (value) => {
        value.quant_after[0].quantity = 21;
      },
      (value) => {
        value.quant_after[0].id = 99;
      },
      (value) => {
        value.edits.reverse();
        value.edits.push({ field: 'lot_name', value: 'Injected' });
      },
    ];
    for (const change of changes) {
      const value = operationReview();
      change(value);
      reply(value);
      await expect(previewStockOperation(selection())).rejects.toThrow();
    }
  });
  it('rejects foreign/malformed receipts rather than confirming a different operation or transfer', async () => {
    for (const change of [
      { request_key: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' },
      { accepted: 'yes' },
      { action: 'delete' },
      { operation_id: false },
      { operation_id: 99 },
      { current: { ...operationStatus().current, transfer_id: 99 } },
    ]) {
      reply({ ...operationStatus(), ...change });
      await expect(
        getStockOperationStatus(operationRequest()),
      ).rejects.toThrow();
    }
    reply(operationStatus(false));
    expect((await getStockOperationStatus(operationRequest())).accepted).toBe(
      false,
    );
  });
});
