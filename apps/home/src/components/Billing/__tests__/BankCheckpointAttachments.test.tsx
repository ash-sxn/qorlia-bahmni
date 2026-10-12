import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BankCheckpointAttachments } from '../BankCheckpointAttachments';
import {
  BillingSessionExpired,
  CheckpointAttachmentsPage,
  downloadCheckpointAttachment,
  getCheckpointAttachments,
} from '../billingService';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getCheckpointAttachments: jest.fn(),
  downloadCheckpointAttachment: jest.fn(),
}));
const version = 'a'.repeat(64);
const file = (id = 5) => ({
  id,
  name: `QorliaQA-${id}.txt`,
  kind: 'binary' as const,
  byte_count: 2,
});
const page = (): CheckpointAttachmentsPage => ({
  checkpoint_id: 9,
  version,
  after: false,
  next_after: false,
  total_count: 1,
  rows: [file()],
});
const get = jest.mocked(getCheckpointAttachments);
const download = jest.mocked(downloadCheckpointAttachment);
const reconnect = jest.fn();
const show = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false, gcTime: Infinity } },
        })
      }
    >
      <BankCheckpointAttachments
        uid={3}
        checkpointId={9}
        reconnect={reconnect}
      />
    </QueryClientProvider>,
  );

describe('Checkpoint attachment workspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    get.mockResolvedValue(page());
    URL.createObjectURL = jest.fn(() => 'blob:synthetic-file');
    URL.revokeObjectURL = jest.fn();
  });
  it('lists all native pages and downloads only the selected snapshot file', async () => {
    const rows = Array.from({ length: 30 }, (_, index) => file(60 - index));
    get
      .mockResolvedValueOnce({
        ...page(),
        rows,
        total_count: 31,
        next_after: 31,
      })
      .mockResolvedValueOnce({
        ...page(),
        after: 31,
        rows: [file(30)],
        total_count: 31,
      });
    download.mockResolvedValue({
      kind: 'binary',
      filename: 'QorliaQA.txt',
      blob: new Blob(['ab']),
    });
    const clicked: { href: string; download: string }[] = [];
    const click = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push({ href: this.href, download: this.download });
      });
    show();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Load more checkpoint attachments',
      }),
    );
    await screen.findByText('Showing 31 of 31 saved attachments.');
    expect(get).toHaveBeenCalledWith(9, 31, version);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Download attachment 30',
      }),
    );
    await screen.findByText(/Attachment download requested/);
    expect(download).toHaveBeenCalledWith(9, 30, version);
    expect(clicked).toEqual([
      { href: 'blob:synthetic-file', download: 'QorliaQA.txt' },
    ]);
    click.mockRestore();
  });
  it('hides changed or overlapping attachment pages instead of showing a partial list', async () => {
    const rows = Array.from({ length: 30 }, (_, index) => file(60 - index));
    get
      .mockResolvedValueOnce({
        ...page(),
        rows,
        total_count: 31,
        next_after: 31,
      })
      .mockResolvedValueOnce({
        ...page(),
        after: 31,
        rows: [file(31)],
        total_count: 31,
      });
    show();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Load more checkpoint attachments',
      }),
    );
    await screen.findByText(/Attachment pages changed or overlapped/);
    expect(
      screen.queryByRole('button', {
        name: 'Download attachment 60',
      }),
    ).not.toBeInTheDocument();
    expect(download).not.toHaveBeenCalled();
  });
  it('shows empty results honestly and disables oversized binaries without hiding links', async () => {
    get.mockResolvedValueOnce({ ...page(), rows: [], total_count: 0 });
    show();
    await screen.findByText('No attachments are linked to this checkpoint.');
    get.mockResolvedValue({
      ...page(),
      total_count: 2,
      rows: [
        { ...file(6), byte_count: 10 * 1024 * 1024 + 1 },
        { ...file(), kind: 'url' },
      ],
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload checkpoint attachments' }),
    );
    expect(
      await screen.findByRole('button', {
        name: 'Download attachment 6',
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', {
        name: 'Open attachment link 5',
      }),
    ).toBeEnabled();
  });
  it('retains errors, hides old files and exposes reconnect without automatic download retries', async () => {
    download.mockRejectedValue(new BillingSessionExpired());
    show();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Download attachment 5',
      }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Billing' }),
    );
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('button', {
        name: 'Download attachment 5',
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload checkpoint attachments' }),
    );
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByRole('button', {
        name: 'Download attachment 5',
      }),
    ).toBeEnabled();
  });
});
