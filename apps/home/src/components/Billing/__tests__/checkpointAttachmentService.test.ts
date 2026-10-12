import {
  BillingSessionExpired,
  downloadCheckpointAttachment,
  getCheckpointAttachments,
} from '../billingService';

const version = 'a'.repeat(64);
const page = () => ({
  checkpoint_id: 9,
  version,
  after: false,
  next_after: false,
  total_count: 1,
  rows: [{ id: 5, name: 'QorliaQA.txt', kind: 'binary', byte_count: 2 }],
});
const binary = () => ({
  checkpoint_id: 9,
  attachment_id: 5,
  version,
  kind: 'binary',
  filename: 'QorliaQA.txt',
  mimetype: 'application/octet-stream',
  byte_count: 2,
  content: 'YWI=',
});
const reply = (result: unknown) =>
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });

describe('Native checkpoint attachment clients', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('uses only the named scoped list and download APIs with byte validation', async () => {
    reply(page());
    expect(await getCheckpointAttachments(9)).toEqual(page());
    expect(
      JSON.parse((fetch as jest.Mock).mock.calls[0][1].body).params,
    ).toEqual({
      model: 'account.bank.statement',
      method: 'qorlia_checkpoint_attachments',
      args: [],
      kwargs: { checkpoint_id: 9, after: false, version: false },
    });
    reply(binary());
    const result = await downloadCheckpointAttachment(9, 5, version);
    expect(result.kind).toBe('binary');
    if (result.kind !== 'binary') throw new Error('Expected a binary file');
    expect(result.blob.size).toBe(2);
    expect(result.blob.type).toBe('application/octet-stream');
    expect(
      JSON.parse((fetch as jest.Mock).mock.calls[1][1].body).params,
    ).toEqual({
      model: 'account.bank.statement',
      method: 'qorlia_checkpoint_attachment_download',
      args: [],
      kwargs: { checkpoint_id: 9, attachment_id: 5, version },
    });
  });
  it('validates native paging order, scope, version and empty list', async () => {
    const rows = Array.from({ length: 30 }, (_, index) => ({
      ...page().rows[0],
      id: 60 - index,
    }));
    reply({ ...page(), rows, total_count: 31, next_after: 31 });
    expect((await getCheckpointAttachments(9)).next_after).toBe(31);
    reply({
      ...page(),
      after: 31,
      total_count: 31,
      rows: [{ ...page().rows[0], id: 30 }],
    });
    expect((await getCheckpointAttachments(9, 31, version)).rows[0].id).toBe(
      30,
    );
    reply({ ...page(), rows: [], total_count: 0 });
    expect((await getCheckpointAttachments(9)).rows).toEqual([]);
    for (const change of [
      { checkpoint_id: 10 },
      { after: 31 },
      { version: 'bad' },
      { total_count: -1 },
      { rows: [{ ...page().rows[0], name: '../bad' }] },
      { next_after: 5 },
      { rows: [page().rows[0], page().rows[0]], total_count: 2 },
      { rows: [{ ...page().rows[0], byte_count: Infinity }] },
    ]) {
      reply({ ...page(), ...change });
      await expect(getCheckpointAttachments(9)).rejects.toThrow(
        'Invalid checkpoint attachment page',
      );
    }
    reply({ ...page(), after: 31, version: 'b'.repeat(64) });
    await expect(getCheckpointAttachments(9, 31, version)).rejects.toThrow();
  });
  it('rejects invalid cursors and download identities before networking', async () => {
    for (const id of [0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(getCheckpointAttachments(id)).rejects.toThrow();
      await expect(
        downloadCheckpointAttachment(9, id, version),
      ).rejects.toThrow();
    }
    await expect(getCheckpointAttachments(9, 5)).rejects.toThrow();
    await expect(getCheckpointAttachments(9, false, 'bad')).rejects.toThrow();
    await expect(downloadCheckpointAttachment(9, 5, 'bad')).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects wrong file scopes, active content, unsafe names and invalid bytes', async () => {
    for (const change of [
      { checkpoint_id: 10 },
      { attachment_id: 6 },
      { version: 'b'.repeat(64) },
      { filename: '../bad' },
      { mimetype: 'text/html' },
      { kind: 'unknown' },
      { byte_count: 10 * 1024 * 1024 + 1 },
      { byte_count: 3 },
      { content: 'YR==' },
      { content: '!!!!' },
    ]) {
      reply({ ...binary(), ...change });
      await expect(
        downloadCheckpointAttachment(9, 5, version),
      ).rejects.toThrow();
    }
  });
  it('returns safe external links without fetching them and rejects unsafe URLs', async () => {
    reply({
      ...binary(),
      kind: 'url',
      url: 'https://example.invalid/QorliaQA',
    });
    expect(await downloadCheckpointAttachment(9, 5, version)).toEqual({
      kind: 'url',
      url: 'https://example.invalid/QorliaQA',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    for (const url of [
      'javascript:alert(1)',
      '//example.invalid/file',
      'https://user:password@example.invalid/file',
      'https://example.invalid/\nfile',
    ]) {
      reply({ ...binary(), kind: 'url', url });
      await expect(downloadCheckpointAttachment(9, 5, version)).rejects.toThrow(
        'Invalid attachment link',
      );
    }
  });
  it('does not retry session expiry', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: { code: 100 } }),
    });
    await expect(getCheckpointAttachments(9)).rejects.toBeInstanceOf(
      BillingSessionExpired,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
