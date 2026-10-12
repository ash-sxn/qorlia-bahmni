import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { BankCheckpointAttachmentEditorModal } from '../BankCheckpointAttachmentEditorModal';
import {
  BillingActionRejected,
  BillingSessionExpired,
  CheckpointAttachmentSaveRequest,
  getCheckpointAttachments,
  getCheckpointAttachmentStatus,
  saveCheckpointAttachments,
} from '../billingService';
import {
  clearCheckpointAttachmentRecovery,
  loadCheckpointAttachmentRecovery,
  persistCheckpointAttachmentRecovery,
} from '../checkpointAttachmentRecovery';

jest.mock('../checkpointAttachmentRecovery', () => ({
  clearCheckpointAttachmentRecovery: jest.fn(),
  loadCheckpointAttachmentRecovery: jest.fn(),
  persistCheckpointAttachmentRecovery: jest.fn(),
}));
jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getCheckpointAttachments: jest.fn(),
  getCheckpointAttachmentStatus: jest.fn(),
  saveCheckpointAttachments: jest.fn(),
}));
const key = '11111111-2222-4333-8444-555555555555';
const request = (): CheckpointAttachmentSaveRequest => ({
  request_key: key,
  payload: {
    checkpoint_id: 9,
    version: 'a'.repeat(64),
    remove_ids: [7],
    uploads: [],
  },
});
const row = (id = 7) => ({
  id,
  name: `Synthetic-${id}.txt`,
  kind: 'binary' as const,
  byte_count: 2,
});
const page = () => ({
  checkpoint_id: 9,
  version: 'a'.repeat(64),
  after: false as const,
  next_after: false as number | false,
  total_count: 1,
  can_upload: true,
  can_remove: true,
  rows: [row()],
});
const accepted = () => ({
  checkpoint_id: 9,
  request_key: key,
  accepted: true,
  attachments: { ...page(), version: 'b'.repeat(64), total_count: 0, rows: [] },
});
const get = jest.mocked(getCheckpointAttachments);
const save = jest.mocked(saveCheckpointAttachments);
const status = jest.mocked(getCheckpointAttachmentStatus);
const load = jest.mocked(loadCheckpointAttachmentRecovery);
const persist = jest.mocked(persistCheckpointAttachmentRecovery);
const clear = jest.mocked(clearCheckpointAttachmentRecovery);
const close = jest.fn(),
  reconnect = jest.fn();
const show = (selection: number | null = 9, uid = 3) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <BankCheckpointAttachmentEditorModal
        uid={uid}
        selection={selection}
        close={close}
        reconnect={reconnect}
      />
    </QueryClientProvider>,
  );
const remove = async () =>
  fireEvent.click(
    await screen.findByRole('checkbox', {
      name: 'Remove attachment 7 from checkpoint',
    }),
  );
const submit = () =>
  fireEvent.click(
    screen.getByRole('button', { name: 'Save attachment changes' }),
  );

describe('Checkpoint attachment editor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    load.mockResolvedValue(null);
    persist.mockResolvedValue(request());
    clear.mockResolvedValue(null);
    get.mockResolvedValue(page());
    save.mockResolvedValue(accepted());
    status.mockResolvedValue({
      checkpoint_id: 9,
      request_key: key,
      accepted: false,
      attachments: false,
    });
    Object.defineProperty(crypto, 'randomUUID', {
      configurable: true,
      value: () => key,
    });
  });
  it('checks recovery before native loading and respects readonly file capabilities', async () => {
    get.mockResolvedValue({ ...page(), can_upload: false, can_remove: false });
    show();
    await screen.findByText(/can read these files but cannot change/);
    expect(load).toHaveBeenCalledWith(3);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(document.querySelector('input[type=file]')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Save attachment changes' }),
    ).toBeDisabled();
    expect(save).not.toHaveBeenCalled();
  });
  it('persists the exact removal before sending and clears it only after acceptance', async () => {
    let commit!: () => void;
    persist.mockImplementation(
      () =>
        new Promise((resolve) => {
          commit = () => resolve(request());
        }),
    );
    show();
    await remove();
    submit();
    await waitFor(() => expect(persist).toHaveBeenCalledWith(3, request()));
    expect(save).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'Escape',
      keyCode: 27,
    });
    expect(close).not.toHaveBeenCalled();
    await act(async () => commit());
    await screen.findByText(/Your exact attachment request was accepted/);
    expect(save).toHaveBeenCalledWith(request().payload, key);
    expect(clear).toHaveBeenCalledWith(3, request());
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to checkpoints' }),
    );
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('leaves a newer request from another tab untouched after exact acceptance', async () => {
    const other = {
      ...request(),
      request_key: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    };
    clear.mockResolvedValue(other);
    show();
    await remove();
    submit();
    await screen.findByText(
      /Another attachment request is pending in this browser/,
    );
    expect(clear).toHaveBeenCalledWith(3, request());
    expect(save).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('button', { name: 'Save attachment changes' }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to checkpoints' }),
    );
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('uploads actual empty files together with selected removals', async () => {
    show();
    await remove();
    fireEvent.change(document.querySelector('input[type=file]')!, {
      target: { files: [new File([], 'Empty.txt')] },
    });
    await screen.findByText(/Empty.txt \(0 bytes\), selected upload/);
    submit();
    await screen.findByText(/Your exact attachment request was accepted/);
    const exact = {
      ...request(),
      payload: {
        ...request().payload,
        uploads: [{ name: 'Empty.txt', content: '' }],
      },
    };
    expect(persist).toHaveBeenCalledWith(3, exact);
    expect(save).toHaveBeenCalledWith(exact.payload, key);
    expect(clear).toHaveBeenCalledWith(3, exact);
  });
  it('freezes uncertain saves and retries exactly the same request without replacement', async () => {
    save.mockRejectedValueOnce(new Error('Network interrupted'));
    show();
    await remove();
    submit();
    await screen.findByText('Network interrupted');
    expect(clear).not.toHaveBeenCalled();
    expect(document.querySelector('input[type=file]')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Back to checkpoints' }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Check exact attachment save' }),
    );
    await screen.findByText(/A delayed save may still finish/);
    expect(status).toHaveBeenCalledWith(request().payload, key);
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry exact attachment save' }),
    );
    await screen.findByText(/Your exact attachment request was accepted/);
    expect(save.mock.calls).toEqual([
      [request().payload, key],
      [request().payload, key],
    ]);
  });
  it('resumes the stored checkpoint instead of loading a different selected source', async () => {
    load.mockResolvedValue(request());
    show(55);
    await screen.findByRole('heading', {
      name: 'Exact attachment save pending',
    });
    expect(get).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveAccessibleName(
      'Manage checkpoint 9 attachments',
    );
    status.mockResolvedValue(accepted());
    fireEvent.click(
      screen.getByRole('button', { name: 'Check exact attachment save' }),
    );
    await screen.findByText(/Your exact attachment request was accepted/);
    expect(save).not.toHaveBeenCalled();
    expect(clear).toHaveBeenCalledWith(3, request());
  });
  it('does not start an API save when storage cannot commit', async () => {
    persist.mockRejectedValue(new Error('Synthetic storage quota failure'));
    show();
    await remove();
    submit();
    await screen.findByText('Synthetic storage quota failure');
    expect(save).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: 'Save attachment changes' }),
    ).not.toBeInTheDocument();
    await screen.findByText(/No replacement save is allowed/);
  });
  it('keeps an accepted request locked until failed storage cleanup succeeds', async () => {
    clear.mockRejectedValueOnce(new Error('Synthetic cleanup failure'));
    show();
    await remove();
    submit();
    await screen.findByText(
      /accepted, but recovery storage could not be cleared/,
    );
    expect(
      screen.getByRole('button', { name: 'Retry exact attachment save' }),
    ).toBeDisabled();
    status.mockResolvedValue(accepted());
    fireEvent.click(
      screen.getByRole('button', { name: 'Check exact attachment save' }),
    );
    await screen.findByText(/Your exact attachment request was accepted/);
    expect(save).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledTimes(2);
  });
  it('retains pending data across session expiry and offers reconnect, not replacement', async () => {
    load.mockResolvedValue(request());
    save.mockRejectedValue(new BillingSessionExpired());
    show(null);
    await screen.findByRole('heading', {
      name: 'Exact attachment save pending',
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry exact attachment save' }),
    );
    await screen.findByText('Your Billing session expired.');
    fireEvent.click(
      screen.getByRole('button', { name: 'Reconnect Billing for attachments' }),
    );
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(clear).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });
  it('requires explicit discard for unsaved selections and warns on browser leave', async () => {
    show();
    await remove();
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to checkpoints' }),
    );
    await screen.findByText('Discard unsaved attachment selections?');
    expect(
      screen.queryByRole('button', { name: 'Save attachment changes' }),
    ).not.toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Keep attachment selections' }),
    );
    expect(screen.getByRole('checkbox')).toBeChecked();
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to checkpoints' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Discard attachment selections/ }),
    );
    expect(close).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  });
  it('requires complete pages and hides changed capability snapshots', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => row(60 - i));
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
        total_count: 31,
        rows: [row(30)],
        can_remove: false,
      });
    show();
    fireEvent.click(
      await screen.findByRole('checkbox', {
        name: 'Remove attachment 60 from checkpoint',
      }),
    );
    expect(
      screen.getByRole('button', { name: 'Save attachment changes' }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Load more editor attachments' }),
    );
    await screen.findByText(/Attachment pages changed or overlapped/);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
  it('fails closed on malformed recovery without loading or saving another source', async () => {
    load.mockRejectedValue(new Error('Invalid synthetic recovery'));
    show();
    await screen.findByText(/recovery storage is unavailable or invalid/);
    expect(get).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
  it('clears a definite native rejection, but keeps selections for explicit reload', async () => {
    save.mockRejectedValueOnce(
      new BillingActionRejected('Reload changed attachments'),
    );
    show();
    await remove();
    submit();
    await screen.findByText('Reload changed attachments');
    await screen.findByRole('checkbox', {
      name: 'Remove attachment 7 from checkpoint',
    });
    expect(clear).toHaveBeenCalledWith(3, request());
    expect(screen.getByRole('checkbox')).toBeChecked();
  });
});
