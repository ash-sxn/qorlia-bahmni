import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  BillingActionRejected,
  BillingSessionExpired,
  getJournalDetailChoices,
  getJournalDetails,
  getJournalDetailsStatus,
  previewJournalDetails,
  saveJournalDetails,
} from '../billingService';
import { JournalDetailsEditor } from '../JournalDetailsEditor';
import {
  journalDetailFixture,
  journalDetailRequest,
} from './journalDetailFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getJournalDetailChoices: jest.fn(),
  getJournalDetails: jest.fn(),
  getJournalDetailsStatus: jest.fn(),
  previewJournalDetails: jest.fn(),
  saveJournalDetails: jest.fn(),
}));
const close = jest.fn(),
  saved = jest.fn(),
  reconnect = jest.fn();
const storage = 'qorlia.billing.journal.pending:3:7:17';
const show = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <JournalDetailsEditor
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
  fireEvent.change(await screen.findByLabelText('Journal item label'), {
    target: { value: 'QorliaQA Reviewed label' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Review journal details' }),
  );
  await screen.findByRole('region', { name: 'Reviewed journal details' });
};
describe('Native draft journal detail editor', () => {
  afterEach(() => jest.restoreAllMocks());
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    (getJournalDetails as jest.Mock).mockResolvedValue(journalDetailFixture());
    (getJournalDetailChoices as jest.Mock).mockResolvedValue([]);
    (previewJournalDetails as jest.Mock).mockResolvedValue({
      ...journalDetailFixture(),
      values: journalDetailRequest().values,
      review_version: 'b'.repeat(64),
    });
    (saveJournalDetails as jest.Mock).mockResolvedValue({
      ...journalDetailFixture(),
      values: journalDetailRequest().values,
      version: 'c'.repeat(64),
    });
    (getJournalDetailsStatus as jest.Mock).mockResolvedValue(false);
  });
  it('requires review and sends only the explicitly reviewed native request', async () => {
    show();
    await screen.findByLabelText('Journal item label');
    expect(
      screen.getByRole('button', { name: 'Save reviewed journal details' }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Monetary editing and adding\/removing/),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Analytic distribution/),
    ).not.toBeInTheDocument();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed journal details' }),
    );
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(saveJournalDetails).toHaveBeenCalledTimes(1);
    expect(saveJournalDetails).toHaveBeenCalledWith(
      expect.objectContaining({
        invoice_id: 7,
        line_id: 17,
        version: 'a'.repeat(64),
        values: journalDetailRequest().values,
        review_version: 'b'.repeat(64),
      }),
    );
    expect(sessionStorage.getItem(storage)).toBeNull();
  });
  it('invalidates review after another edit and protects unsaved entries on close', async () => {
    show();
    await review();
    fireEvent.change(screen.getByLabelText('Journal item label'), {
      target: { value: 'QorliaQA Changed again' },
    });
    expect(
      screen.queryByRole('region', { name: 'Reviewed journal details' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save reviewed journal details' }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to journal items' }),
    );
    await screen.findByText('Discard unsaved journal details?');
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Journal item label')).toHaveValue(
      'QorliaQA Changed again',
    );
    expect(saveJournalDetails).not.toHaveBeenCalled();
  });
  it('locks an uncertain save, checks a missing receipt and retries the identical request only', async () => {
    (saveJournalDetails as jest.Mock)
      .mockRejectedValueOnce(new Error('Network response lost'))
      .mockResolvedValueOnce(journalDetailFixture());
    show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed journal details' }),
    );
    await screen.findByText('Network response lost');
    const request = JSON.parse(sessionStorage.getItem(storage)!);
    expect(screen.getByLabelText('Journal item label')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Back to journal items' }),
    ).toBeDisabled();
    expect(saveJournalDetails).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Check journal save' }));
    await screen.findByText(/No receipt was found yet/);
    expect(getJournalDetailsStatus).toHaveBeenCalledWith(request);
    expect(saved).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry identical journal save' }),
    );
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(saveJournalDetails).toHaveBeenNthCalledWith(2, request);
  });
  it('recovers an exact stored request after remount and confirms its native receipt', async () => {
    sessionStorage.setItem(storage, JSON.stringify(journalDetailRequest()));
    (getJournalDetailsStatus as jest.Mock).mockResolvedValue(
      journalDetailFixture(),
    );
    show();
    await screen.findByRole('button', { name: 'Check journal save' });
    expect(screen.getByLabelText('Journal item label')).toHaveValue(
      'QorliaQA Reviewed label',
    );
    expect(screen.getByLabelText('Journal item label')).toBeDisabled();
    expect(saveJournalDetails).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Check journal save' }));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(sessionStorage.getItem(storage)).toBeNull();
  });
  it('retains pending identity when Billing expires and reconnects without discarding it', async () => {
    (saveJournalDetails as jest.Mock).mockRejectedValue(
      new BillingSessionExpired(),
    );
    show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed journal details' }),
    );
    await screen.findByRole('button', { name: 'Reconnect Billing' });
    const request = sessionStorage.getItem(storage);
    expect(request).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect Billing' }));
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(storage)).toBe(request);
  });
  it('keeps entries but clears a definitely rejected save and requires a fresh review', async () => {
    (saveJournalDetails as jest.Mock).mockRejectedValue(
      new BillingActionRejected('The invoice changed. Reload journal details.'),
    );
    show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed journal details' }),
    );
    await screen.findByText('The invoice changed. Reload journal details.');
    expect(sessionStorage.getItem(storage)).toBeNull();
    expect(screen.getByLabelText('Journal item label')).toHaveValue(
      'QorliaQA Reviewed label',
    );
    expect(screen.getByLabelText('Journal item label')).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Save reviewed journal details' }),
    ).toBeDisabled();
  });
  it('fails closed for invalid recovery or noneditable native records', async () => {
    sessionStorage.setItem(storage, '{invalid');
    (getJournalDetails as jest.Mock).mockResolvedValue({
      ...journalDetailFixture(),
      can_edit: false,
    });
    show();
    await screen.findByLabelText('Journal item label');
    expect(
      screen.getByText(/recovery storage is unavailable or invalid/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Review journal details' }),
    ).toBeDisabled();
    expect(saveJournalDetails).not.toHaveBeenCalled();
  });
  it('prevents malformed analytic text from reviewing an earlier valid distribution', async () => {
    (getJournalDetails as jest.Mock).mockResolvedValue({
      ...journalDetailFixture(),
      analytics_visible: true,
    });
    show();
    await review();
    fireEvent.change(
      screen.getByLabelText(
        'Analytic distribution (account IDs and percentages)',
      ),
      { target: { value: '{bad' } },
    );
    expect(
      screen.getByRole('button', { name: 'Review journal details' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Save reviewed journal details' }),
    ).toBeDisabled();
    expect(saveJournalDetails).not.toHaveBeenCalled();
  });
  it('does not send a save when its exact recovery request cannot be stored', async () => {
    show();
    await review();
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Recovery storage is full');
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save reviewed journal details' }),
    );
    await screen.findByText('Recovery storage is full');
    expect(saveJournalDetails).not.toHaveBeenCalled();
    expect(saved).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(storage)).toBeNull();
    expect(screen.getByLabelText('Journal item label')).toBeEnabled();
  });
});
