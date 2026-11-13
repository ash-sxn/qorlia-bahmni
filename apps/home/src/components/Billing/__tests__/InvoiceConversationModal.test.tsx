import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  BillingSessionExpired,
  checkInvoiceNote,
  downloadInvoiceAttachment,
  getInvoiceConversation,
  postInvoiceNote,
} from '../billingService';
import { InvoiceConversationModal } from '../InvoiceConversationModal';
import {
  invoiceConversationFixture,
  invoiceMessageFixture,
  noteKey,
} from './invoiceConversationFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  checkInvoiceNote: jest.fn(),
  downloadInvoiceAttachment: jest.fn(),
  getInvoiceConversation: jest.fn(),
  postInvoiceNote: jest.fn(),
}));
const close = jest.fn(),
  reconnect = jest.fn();
const show = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <InvoiceConversationModal
        uid={3}
        invoiceId={7}
        close={close}
        reconnect={reconnect}
      />
    </QueryClientProvider>,
  );
const write = async () => {
  await screen.findByText('QorliaQA Checked invoice');
  fireEvent.change(screen.getByLabelText('Internal note'), {
    target: { value: 'QorliaQA New note' },
  });
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Save internal note' })),
  );
};
describe('Invoice conversation modal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(crypto, 'randomUUID', {
      configurable: true,
      value: () => noteKey,
    });
    (getInvoiceConversation as jest.Mock).mockResolvedValue(
      invoiceConversationFixture(),
    );
    (postInvoiceNote as jest.Mock).mockResolvedValue({
      ...invoiceMessageFixture(),
      id: 10,
      body: 'QorliaQA New note',
    });
    (checkInvoiceNote as jest.Mock).mockResolvedValue(false);
    (downloadInvoiceAttachment as jest.Mock).mockResolvedValue({
      kind: 'binary',
      filename: 'QorliaQA.txt',
      blob: new Blob(['ab']),
    });
  });
  it('reads native history, changes and attachment labels as safe text, without posting', async () => {
    (getInvoiceConversation as jest.Mock).mockResolvedValue({
      ...invoiceConversationFixture(),
      messages: [
        { ...invoiceMessageFixture(), body: '<img src=x onerror=alert(1)>' },
      ],
    });
    show();
    await screen.findByText('<img src=x onerror=alert(1)>');
    expect(screen.getByText('Reference: Before → After')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Download or open QorliaQA Invoice.pdf',
      }),
    ).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    expect(postInvoiceNote).not.toHaveBeenCalled();
  });
  it('guards duplicate clicks and closing, then confirms saved native message identity', async () => {
    let resolve!: (value: unknown) => void;
    (postInvoiceNote as jest.Mock).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    show();
    await write();
    fireEvent.click(
      screen.getByRole('button', { name: 'Checking Billing...' }),
    );
    expect(postInvoiceNote).toHaveBeenCalledTimes(1);
    expect(postInvoiceNote).toHaveBeenCalledWith(
      7,
      noteKey,
      'QorliaQA New note',
    );
    expect(
      screen.getByRole('button', { name: 'Back to invoices' }),
    ).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'Escape',
      keyCode: 27,
    });
    expect(close).not.toHaveBeenCalled();
    await act(async () => resolve({ ...invoiceMessageFixture(), id: 10 }));
    await screen.findByText(/Internal note #10 is saved/);
    expect(screen.getByLabelText('Internal note')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Back to invoices' }));
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('freezes uncertain saves and explicitly retries the same key and text, never a new copy', async () => {
    (postInvoiceNote as jest.Mock).mockRejectedValueOnce(
      new Error('Network interrupted'),
    );
    show();
    await write();
    await screen.findByText('Network interrupted');
    expect(screen.getByLabelText('Internal note')).toBeDisabled();
    expect(postInvoiceNote).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Retry same note' }));
    await screen.findByText(/Internal note #10 is saved/);
    expect((postInvoiceNote as jest.Mock).mock.calls).toEqual([
      [7, noteKey, 'QorliaQA New note'],
      [7, noteKey, 'QorliaQA New note'],
    ]);
  });
  it('keeps the same request frozen when a status check cannot find a delayed save', async () => {
    (postInvoiceNote as jest.Mock).mockRejectedValueOnce(
      new Error('Unavailable'),
    );
    show();
    await write();
    await screen.findByText('Unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Check saved note' }));
    await screen.findByText(/No saved note was found in this check/);
    expect(checkInvoiceNote).toHaveBeenCalledWith(
      7,
      noteKey,
      'QorliaQA New note',
    );
    expect(screen.getByLabelText('Internal note')).toBeDisabled();
    expect(screen.getByLabelText('Internal note')).toHaveValue(
      'QorliaQA New note',
    );
    expect(postInvoiceNote).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Retry same note' }));
    await screen.findByText(/Internal note #10 is saved/);
    expect((postInvoiceNote as jest.Mock).mock.calls).toEqual([
      [7, noteKey, 'QorliaQA New note'],
      [7, noteKey, 'QorliaQA New note'],
    ]);
  });
  it('confirms an uncertain save from native status without posting another note', async () => {
    (postInvoiceNote as jest.Mock).mockRejectedValueOnce(
      new Error('Unavailable'),
    );
    (checkInvoiceNote as jest.Mock).mockResolvedValue({
      ...invoiceMessageFixture(),
      id: 10,
      body: 'QorliaQA New note',
    });
    show();
    await write();
    await screen.findByText('Unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Check saved note' }));
    await screen.findByText(/Internal note #10 is saved/);
    expect(screen.getByLabelText('Internal note')).toHaveValue('');
    expect(screen.getByLabelText('Internal note')).toBeEnabled();
    expect(postInvoiceNote).toHaveBeenCalledTimes(1);
  });
  it('does not silently discard an unsaved or unconfirmed note on close', async () => {
    show();
    await screen.findByText('QorliaQA Checked invoice');
    fireEvent.change(screen.getByLabelText('Internal note'), {
      target: { value: 'Unsent text' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Back to invoices' }));
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Internal note')).toHaveValue('Unsent text');
    fireEvent.click(screen.getByRole('button', { name: 'Back to invoices' }));
    fireEvent.click(
      screen.getByRole('button', { name: /Discard local draft and close/ }),
    );
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('hides previous history on session expiry and requires draft-discard confirmation before reconnect', async () => {
    (postInvoiceNote as jest.Mock).mockRejectedValue(
      new BillingSessionExpired(),
    );
    show();
    await write();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Billing' }),
    );
    expect(
      screen.queryByText('QorliaQA Checked invoice'),
    ).not.toBeInTheDocument();
    expect(reconnect).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: /Discard local draft and reconnect/ }),
    );
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(postInvoiceNote).toHaveBeenCalledTimes(1);
  });
  it('keeps a native read-only account read-only', async () => {
    (getInvoiceConversation as jest.Mock).mockResolvedValue({
      ...invoiceConversationFixture(),
      can_note: false,
    });
    show();
    await screen.findByText(/can read this conversation but cannot post/);
    expect(screen.queryByLabelText('Internal note')).not.toBeInTheDocument();
    expect(postInvoiceNote).not.toHaveBeenCalled();
  });
  it('loads older pages on demand, with no automatic refresh or writes', async () => {
    (getInvoiceConversation as jest.Mock)
      .mockResolvedValueOnce({
        ...invoiceConversationFixture(),
        next_before: 9,
      })
      .mockResolvedValueOnce({
        ...invoiceConversationFixture(),
        messages: [{ ...invoiceMessageFixture(), id: 8, body: 'Older entry' }],
      });
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Load older messages' }),
    );
    await screen.findByText('Older entry');
    await waitFor(() =>
      expect(getInvoiceConversation).toHaveBeenCalledWith(7, 9),
    );
    expect(
      screen.queryByRole('button', { name: 'Load older messages' }),
    ).not.toBeInTheDocument();
    expect(postInvoiceNote).not.toHaveBeenCalled();
  });
  it('saves chosen files together, freezes them after an uncertain save and retries exactly once', async () => {
    (postInvoiceNote as jest.Mock).mockRejectedValueOnce(
      new Error('Upload interrupted'),
    );
    show();
    await screen.findByText('QorliaQA Checked invoice');
    const input = document.querySelector('input[type=file]')!;
    fireEvent.change(input, {
      target: { files: [new File(['ab'], 'QorliaQA.txt')] },
    });
    expect(
      screen.getByRole('button', { name: 'Remove QorliaQA.txt' }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save internal note' }));
    await screen.findByText('Upload interrupted');
    expect(
      screen.getByRole('button', { name: 'Remove QorliaQA.txt' }),
    ).toBeDisabled();
    const expected = [
      7,
      noteKey,
      '',
      [{ name: 'QorliaQA.txt', content: 'YWI=' }],
    ];
    expect((postInvoiceNote as jest.Mock).mock.calls).toEqual([expected]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry same note' }));
    await screen.findByText(/Internal note #10 is saved/);
    expect((postInvoiceNote as jest.Mock).mock.calls).toEqual([
      expected,
      expected,
    ]);
    expect(
      screen.queryByRole('button', { name: 'Remove QorliaQA.txt' }),
    ).not.toBeInTheDocument();
  });
  it('allows removing unsent files and warns before abandoning an attachment-only draft', async () => {
    show();
    await screen.findByText('QorliaQA Checked invoice');
    fireEvent.change(document.querySelector('input[type=file]')!, {
      target: { files: [new File(['ab'], 'QorliaQA.txt')] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Back to invoices' }));
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove QorliaQA.txt' }),
    );
    expect(
      screen.getByRole('button', { name: 'Save internal note' }),
    ).toBeDisabled();
    expect(postInvoiceNote).not.toHaveBeenCalled();
  });
  it('downloads on demand with a temporary blob URL, never automatically', async () => {
    const create = jest.fn(() => 'blob:QorliaQA'),
      revoke = jest.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: create,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revoke,
    });
    const click = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    show();
    const button = await screen.findByRole('button', {
      name: 'Download or open QorliaQA Invoice.pdf',
    });
    expect(downloadInvoiceAttachment).not.toHaveBeenCalled();
    fireEvent.click(button);
    await screen.findByText(/Attachment download requested/);
    expect(downloadInvoiceAttachment).toHaveBeenCalledWith(7, 9, 1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download]')).toBeNull();
    click.mockRestore();
  });
  it('hides attachment controls after native session expiry without repeating the download', async () => {
    (downloadInvoiceAttachment as jest.Mock).mockRejectedValue(
      new BillingSessionExpired(),
    );
    show();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Download or open QorliaQA Invoice.pdf',
      }),
    );
    await screen.findByRole('button', { name: 'Reconnect Billing' });
    expect(
      screen.queryByRole('button', {
        name: 'Download or open QorliaQA Invoice.pdf',
      }),
    ).not.toBeInTheDocument();
    expect(downloadInvoiceAttachment).toHaveBeenCalledTimes(1);
    expect(postInvoiceNote).not.toHaveBeenCalled();
  });
});
