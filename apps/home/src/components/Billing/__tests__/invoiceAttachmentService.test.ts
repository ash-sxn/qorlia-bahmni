import {
  BillingSessionExpired,
  downloadInvoiceAttachment,
  postInvoiceNote,
  readInvoiceUploads,
} from '../billingService';
import { invoiceMessageFixture, noteKey } from './invoiceConversationFixture';

const binary = () => ({
  invoice_id: 7,
  message_id: 9,
  attachment_id: 1,
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

describe('Invoice attachment service', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('downloads only a named invoice/message/file scoped action and validates exact bytes', async () => {
    reply(binary());
    const result = await downloadInvoiceAttachment(7, 9, 1);
    expect(result.kind).toBe('binary');
    if (result.kind !== 'binary')
      throw new Error('Expected a binary attachment');
    expect(result.blob.size).toBe(2);
    expect(result.blob.type).toBe('application/octet-stream');
    expect(
      JSON.parse((fetch as jest.Mock).mock.calls[0][1].body).params,
    ).toEqual({
      model: 'account.move',
      method: 'qorlia_invoice_attachment_download',
      args: [],
      kwargs: { invoice_id: 7, message_id: 9, attachment_id: 1 },
    });
    reply({ ...binary(), byte_count: 0, content: '' });
    expect((await downloadInvoiceAttachment(7, 9, 1)).kind).toBe('binary');
  });
  it('rejects wrong identities, active MIME, paths, malformed or oversized binary responses', async () => {
    for (const change of [
      { invoice_id: 8 },
      { message_id: 8 },
      { attachment_id: 2 },
      { kind: 'unknown' },
      { mimetype: 'text/html' },
      { filename: '../secret' },
      { filename: 'a\u202eb' },
      { content: 'YR==', byte_count: 1 },
      { content: '!!!!' },
      { byte_count: 3 },
      { byte_count: 10 * 1024 * 1024 + 1 },
    ]) {
      reply({ ...binary(), ...change });
      await expect(downloadInvoiceAttachment(7, 9, 1)).rejects.toThrow();
    }
    (fetch as jest.Mock).mockClear();
    await expect(downloadInvoiceAttachment(7, 0, 1)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('returns validated external links without fetching their contents', async () => {
    const result = {
      ...binary(),
      kind: 'url',
      url: 'https://example.invalid/QorliaQA',
    };
    reply(result);
    expect(await downloadInvoiceAttachment(7, 9, 1)).toEqual({
      kind: 'url',
      url: result.url,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,x',
      '//example.invalid/x',
      'https://user:secret@example.invalid/x',
      'https://example.invalid/\nfile',
    ]) {
      reply({ ...result, url });
      await expect(downloadInvoiceAttachment(7, 9, 1)).rejects.toThrow(
        'Invalid attachment link',
      );
    }
  });
  it('reads selected files locally and posts an attachment-only atomic note without raw model fields', async () => {
    const uploads = await readInvoiceUploads([
      new File(['ab'], 'QorliaQA.txt'),
      new File([], 'Empty.txt'),
    ]);
    expect(uploads).toEqual([
      { name: 'QorliaQA.txt', content: 'YWI=' },
      { name: 'Empty.txt', content: '' },
    ]);
    expect(fetch).not.toHaveBeenCalled();
    reply({
      invoice_id: 7,
      request_key: noteKey,
      message: invoiceMessageFixture(),
    });
    await postInvoiceNote(7, noteKey, '', uploads);
    expect(
      JSON.parse((fetch as jest.Mock).mock.calls[0][1].body).params.kwargs,
    ).toEqual({
      invoice_id: 7,
      request_key: noteKey,
      body: '',
      uploads,
    });
  });
  it('rejects invalid uploads and local limits before networking and does not retry expired downloads', async () => {
    for (const uploads of [
      [{ name: '../bad', content: 'YWI=' }],
      [{ name: 'x', content: 'YR==' }],
      [{ name: 'x', content: '!!!' }],
      Array(6).fill({ name: 'x', content: '' }),
    ])
      await expect(
        postInvoiceNote(7, noteKey, 'Note', uploads),
      ).rejects.toThrow();
    await expect(
      readInvoiceUploads([new File([], '../bad')]),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: { code: 100 } }),
    });
    await expect(downloadInvoiceAttachment(7, 9, 1)).rejects.toBeInstanceOf(
      BillingSessionExpired,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
