import {
  BillingActionRejected,
  BillingSessionExpired,
  CheckpointAttachmentRequest,
  getCheckpointAttachmentStatus,
  saveCheckpointAttachments,
} from '../billingService';

const key = '11111111-2222-4333-8444-555555555555';
const payload = (): CheckpointAttachmentRequest => ({
  checkpoint_id: 9,
  version: 'a'.repeat(64),
  uploads: [{ name: 'Synthetic.bin', content: btoa('Native\x00\xff') }],
  remove_ids: [7],
});
const page = () => ({
  checkpoint_id: 9,
  version: 'b'.repeat(64),
  after: false,
  next_after: false,
  total_count: 1,
  can_upload: true,
  can_remove: true,
  rows: [{ id: 8, name: 'Synthetic.bin', kind: 'binary', byte_count: 8 }],
});
const receipt = () => ({
  checkpoint_id: 9,
  request_key: key,
  accepted: true,
  attachments: page(),
});
const reply = (result: unknown) =>
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });

describe('Checkpoint attachment mutation boundary', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('sends the exact request through only the named save and status APIs', async () => {
    reply(receipt());
    await expect(saveCheckpointAttachments(payload(), key)).resolves.toEqual(
      receipt(),
    );
    await expect(
      getCheckpointAttachmentStatus(payload(), key),
    ).resolves.toEqual(receipt());
    for (const [index, action] of ['save', 'status'].entries()) {
      const [url, init] = (global.fetch as jest.Mock).mock.calls[index];
      expect(url).toMatch(
        new RegExp(
          `account.bank.statement/qorlia_checkpoint_attachment_${action}$`,
        ),
      );
      expect(init.credentials).toBe('same-origin');
      expect(JSON.parse(init.body).params).toEqual({
        model: 'account.bank.statement',
        method: `qorlia_checkpoint_attachment_${action}`,
        args: [],
        kwargs: { payload: payload(), request_key: key },
      });
    }
  });
  it('rejects IDs, duplicates, foreign fields, invalid files and request keys before RPC', async () => {
    for (const invalid of [
      { ...payload(), checkpoint_id: 0 },
      { ...payload(), version: 'bad' },
      { ...payload(), remove_ids: [7, 7] },
      { ...payload(), remove_ids: [-1] },
      { ...payload(), uploads: [], remove_ids: [] },
      { ...payload(), context: { uid: 1 } },
      { ...payload(), uploads: [{ name: '../bad', content: '' }] },
      { ...payload(), uploads: [{ name: 'bad.bin', content: 'YR==' }] },
      { ...payload(), uploads: [{ name: 'bad.bin', content: '!!!!' }] },
      { ...payload(), uploads: Array(6).fill(payload().uploads[0]) },
      { ...payload(), uploads: [{ ...payload().uploads[0], res_id: 9 }] },
    ])
      await expect(saveCheckpointAttachments(invalid, key)).rejects.toThrow();
    await expect(saveCheckpointAttachments(payload(), 'bad')).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it('allows empty uploads for removal and zero-byte files for upload', async () => {
    reply({
      ...receipt(),
      attachments: { ...page(), rows: [], total_count: 0 },
    });
    await expect(
      saveCheckpointAttachments({ ...payload(), uploads: [] }, key),
    ).resolves.toHaveProperty('accepted', true);
    reply({
      ...receipt(),
      attachments: { ...page(), rows: [{ ...page().rows[0], byte_count: 0 }] },
    });
    await expect(
      saveCheckpointAttachments(
        {
          ...payload(),
          remove_ids: [],
          uploads: [{ name: 'Empty.txt', content: '' }],
        },
        key,
      ),
    ).resolves.toHaveProperty('accepted', true);
  });
  it('accepts an unconfirmed status, but never an unconfirmed save as success', async () => {
    reply({ ...receipt(), accepted: false, attachments: false });
    await expect(
      getCheckpointAttachmentStatus(payload(), key),
    ).resolves.toHaveProperty('accepted', false);
    await expect(saveCheckpointAttachments(payload(), key)).rejects.toThrow(
      /Invalid checkpoint attachment save receipt/,
    );
    reply({ ...receipt(), accepted: false });
    await expect(
      getCheckpointAttachmentStatus(payload(), key),
    ).rejects.toThrow();
  });
  it('rejects mismatched receipts and malformed attachment pages', async () => {
    for (const invalid of [
      { ...receipt(), checkpoint_id: 10 },
      { ...receipt(), request_key: 'other' },
      { ...receipt(), accepted: 'yes' },
      { ...receipt(), attachments: false },
      { ...receipt(), attachments: { ...page(), checkpoint_id: 10 } },
      { ...receipt(), attachments: { ...page(), after: 8 } },
      { ...receipt(), attachments: { ...page(), total_count: 0 } },
      { ...receipt(), attachments: { ...page(), total_count: 2 } },
      {
        ...receipt(),
        attachments: {
          ...page(),
          rows: [{ ...page().rows[0], byte_count: -1 }],
        },
      },
      {
        ...receipt(),
        attachments: {
          ...page(),
          rows: [page().rows[0], page().rows[0]],
          total_count: 2,
        },
      },
    ]) {
      reply(invalid);
      await expect(saveCheckpointAttachments(payload(), key)).rejects.toThrow();
    }
  });
  it('retains native rejections and session expiry for recovery handling', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: { code: 100 } }),
    });
    await expect(
      saveCheckpointAttachments(payload(), key),
    ).rejects.toBeInstanceOf(BillingSessionExpired);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        error: {
          data: {
            name: 'odoo.exceptions.UserError',
            message: 'Reload attachments',
            arguments: ['Reload attachments'],
          },
        },
      }),
    });
    await expect(
      saveCheckpointAttachments(payload(), key),
    ).rejects.toBeInstanceOf(BillingActionRejected);
  });
});
