import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  BillingActionRejected,
  getCutoff,
  getCutoffChoices,
  getCutoffStatus,
  onchangeCutoff,
  previewCutoff,
  saveCutoff,
} from '../billingService';
import { CutoffModal } from '../CutoffModal';
import {
  cutoffFixture,
  cutoffRequest,
  cutoffReview,
  cutoffSaved,
} from './cutoffFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getCutoff: jest.fn(),
  getCutoffChoices: jest.fn(),
  getCutoffStatus: jest.fn(),
  onchangeCutoff: jest.fn(),
  previewCutoff: jest.fn(),
  saveCutoff: jest.fn(),
}));
const close = jest.fn(),
  saved = jest.fn(),
  reconnect = jest.fn();
const key = 'qorlia.billing.cutoff.pending:3:7:17';
const show = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <CutoffModal
        uid={3}
        invoiceId={7}
        lineId={17}
        close={close}
        saved={saved}
        reconnect={reconnect}
      />
    </QueryClientProvider>,
  );
const review = async () => {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Review adjusting entries' }),
  );
  await screen.findByRole('region', { name: 'Reviewed adjusting entries' });
};
describe('Cut-Off review and exact-request recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    (getCutoff as jest.Mock).mockResolvedValue(cutoffFixture());
    (getCutoffChoices as jest.Mock).mockResolvedValue([]);
    (onchangeCutoff as jest.Mock).mockResolvedValue({
      ...cutoffFixture(),
      values: { ...cutoffFixture().values, percentage: 25, total_amount: -125 },
    });
    (previewCutoff as jest.Mock).mockResolvedValue(cutoffReview());
    (saveCutoff as jest.Mock).mockImplementation((request) =>
      Promise.resolve({ ...cutoffSaved(), request_key: request.request_key }),
    );
    (getCutoffStatus as jest.Mock).mockResolvedValue(false);
  });
  afterEach(() => jest.restoreAllMocks());
  it('requires review, discloses default changes and sends the exact reviewed request', async () => {
    show();
    await screen.findByLabelText('Recognition date');
    expect(
      screen.getByRole('button', { name: 'Create reviewed adjusting entries' }),
    ).toBeDisabled();
    await review();
    expect(screen.getByRole('note')).toHaveTextContent(
      /default automatic-entry journal/,
    );
    expect(screen.getByRole('note')).toHaveTextContent(
      /reconcile the two new accrual rows with each other/,
    );
    expect(screen.getAllByRole('table')).toHaveLength(2);
    fireEvent.click(
      screen.getByRole('button', { name: 'Create reviewed adjusting entries' }),
    );
    await screen.findByRole('region', { name: 'Saved adjusting entries' });
    expect(saveCutoff).toHaveBeenCalledTimes(1);
    expect(saveCutoff).toHaveBeenCalledWith(
      expect.objectContaining({
        invoice_id: 7,
        line_id: 17,
        version: 'a'.repeat(64),
        review_version: 'b'.repeat(64),
        values: cutoffReview().values,
      }),
    );
    expect(sessionStorage.getItem(key)).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to journal items' }),
    );
    expect(saved).toHaveBeenCalledTimes(1);
  });
  it('does not promise reconciliation when native preview does not schedule it', async () => {
    (previewCutoff as jest.Mock).mockResolvedValue({
      ...cutoffReview(),
      reconcile_accrual_rows: false,
    });
    show();
    await review();
    expect(screen.getByRole('note')).not.toHaveTextContent(
      /reconcile the two new accrual rows/,
    );
  });
  it('uses native amount onchange and invalidates review after edits', async () => {
    show();
    await review();
    fireEvent.change(screen.getByLabelText('Adjusting amount (INR)'), {
      target: { value: '-125' },
    });
    expect(
      screen.queryByRole('region', { name: 'Reviewed adjusting entries' }),
    ).not.toBeInTheDocument();
    fireEvent.blur(screen.getByLabelText('Adjusting amount (INR)'));
    await waitFor(() =>
      expect(screen.getByLabelText('Percentage')).toHaveValue(25),
    );
    expect(onchangeCutoff).toHaveBeenCalledWith(
      cutoffReview(),
      expect.objectContaining({ total_amount: -125 }),
      'total_amount',
    );
    expect(saveCutoff).not.toHaveBeenCalled();
  });
  it('retains one uncertain request and retries only that request after a missing receipt', async () => {
    (saveCutoff as jest.Mock)
      .mockRejectedValueOnce(new Error('Response lost'))
      .mockImplementationOnce((request) =>
        Promise.resolve({ ...cutoffSaved(), request_key: request.request_key }),
      );
    show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Create reviewed adjusting entries' }),
    );
    await screen.findByText('Response lost');
    const request = JSON.parse(sessionStorage.getItem(key)!);
    expect(screen.queryByLabelText('Recognition date')).not.toBeInTheDocument();
    expect(saveCutoff).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Check Cut-Off save' }));
    await screen.findByText(/does not prove the save stopped/);
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry identical Cut-Off request' }),
    );
    await screen.findByRole('region', { name: 'Saved adjusting entries' });
    expect(saveCutoff).toHaveBeenNthCalledWith(2, request);
  });
  it('recovers without loading an ineligible or unavailable source form', async () => {
    sessionStorage.setItem(key, JSON.stringify(cutoffRequest()));
    (getCutoff as jest.Mock).mockRejectedValue(
      new Error('Source is now a draft'),
    );
    (getCutoffStatus as jest.Mock).mockResolvedValue(cutoffSaved());
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Check Cut-Off save' }),
    );
    await screen.findByRole('region', { name: 'Saved adjusting entries' });
    expect(getCutoff).not.toHaveBeenCalled();
    expect(saveCutoff).not.toHaveBeenCalled();
    expect(getCutoffStatus).toHaveBeenCalledWith(cutoffRequest());
  });
  it('blocks corrupt recovery storage instead of sending another request', async () => {
    sessionStorage.setItem(key, '{bad');
    show();
    await screen.findByText(/storage is unavailable or invalid/);
    expect(getCutoff).not.toHaveBeenCalled();
    expect(saveCutoff).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', {
        name: 'Create reviewed adjusting entries',
      }),
    ).not.toBeInTheDocument();
  });
  it('keeps rejected values but requires a new review', async () => {
    (saveCutoff as jest.Mock).mockRejectedValueOnce(
      new BillingActionRejected('Review again'),
    );
    show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Create reviewed adjusting entries' }),
    );
    await screen.findByText('Review again');
    await screen.findByLabelText('Recognition date');
    expect(screen.getByLabelText('Adjusting amount (INR)')).toHaveValue(-250);
    expect(
      screen.getByRole('button', { name: 'Create reviewed adjusting entries' }),
    ).toBeDisabled();
    expect(sessionStorage.getItem(key)).toBeNull();
  });
  it('protects unsaved input on close and prevents read-only writes', async () => {
    show();
    fireEvent.change(await screen.findByLabelText('Recognition date'), {
      target: { value: '2026-11-10' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to journal items' }),
    );
    await screen.findByText('Discard unsaved Cut-Off settings?');
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Recognition date')).toHaveValue('2026-11-10');
  });
  it('does not allow read-only accounts to review or create entries', async () => {
    (getCutoff as jest.Mock).mockResolvedValue({
      ...cutoffFixture(),
      can_create: false,
    });
    show();
    await screen.findByText(/permissions do not allow/);
    expect(
      screen.getByRole('button', { name: 'Review adjusting entries' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Create reviewed adjusting entries' }),
    ).toBeDisabled();
  });
});
