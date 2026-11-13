import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  BillingActionRejected,
  BillingSessionExpired,
  downloadCheque,
  downloadCurrentCheque,
  getChequeStatus,
  getChequeWorkflow,
  previewChequeWorkflow,
  printChequeWorkflow,
} from '../billingService';
import { ChequeWorkflowModal } from '../ChequeWorkflowModal';
import { chequeFixture, chequeRequest } from './chequeFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getChequeWorkflow: jest.fn(),
  previewChequeWorkflow: jest.fn(),
  printChequeWorkflow: jest.fn(),
  getChequeStatus: jest.fn(),
  downloadCheque: jest.fn(),
  downloadCurrentCheque: jest.fn(),
}));
const close = jest.fn(),
  reconnect = jest.fn();
const storage = 'qorlia.billing.cheque.pending:3:9';
const pdf = { filename: 'QorliaQA.pdf', blob: new Blob(['%PDF-QA']) };
const show = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ChequeWorkflowModal
        uid={3}
        paymentId={9}
        close={close}
        reconnect={reconnect}
      />
    </QueryClientProvider>,
  );
const review = async () => {
  fireEvent.change(
    await screen.findByLabelText('Number on cheque stationery'),
    { target: { value: '000007' } },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Review cheque number' }));
  await screen.findByRole('button', {
    name: 'Generate cheque PDF and mark sent',
  });
};
describe('Cheque print review and recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    Object.defineProperty(global.crypto, 'randomUUID', {
      configurable: true,
      value: jest.fn(() => chequeRequest().request_key),
    });
    URL.createObjectURL = jest.fn(() => 'blob:qorliaqa');
    URL.revokeObjectURL = jest.fn();
    jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    (getChequeWorkflow as jest.Mock).mockResolvedValue(chequeFixture());
    (previewChequeWorkflow as jest.Mock).mockResolvedValue(
      chequeFixture({
        number_to_print: '000007',
        review_version: 'b'.repeat(64),
      }),
    );
    (printChequeWorkflow as jest.Mock).mockResolvedValue({
      payment: chequeFixture({
        sent: true,
        can_print: false,
        check_number: '000007',
      }),
      pdf,
    });
    (downloadCheque as jest.Mock).mockResolvedValue(pdf);
    (downloadCurrentCheque as jest.Mock).mockResolvedValue(pdf);
    (getChequeStatus as jest.Mock).mockResolvedValue({
      accepted: false,
      payment: chequeFixture(),
    });
  });
  afterEach(() => jest.restoreAllMocks());
  it('explains missing native layout and does not offer a print or save', async () => {
    (getChequeWorkflow as jest.Mock).mockResolvedValue(
      chequeFixture({
        can_print: false,
        layout: false,
        reason: 'No native cheque layout is configured.',
      }),
    );
    show();
    await screen.findByText('No native cheque layout is configured.');
    expect(
      screen.queryByRole('button', { name: 'Review cheque number' }),
    ).not.toBeInTheDocument();
    expect(printChequeWorkflow).not.toHaveBeenCalled();
  });
  it('requires review again after an edit and sends only the reviewed request', async () => {
    show();
    await review();
    fireEvent.change(screen.getByLabelText('Number on cheque stationery'), {
      target: { value: '8' },
    });
    expect(
      screen.queryByRole('button', {
        name: 'Generate cheque PDF and mark sent',
      }),
    ).not.toBeInTheDocument();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Generate cheque PDF and mark sent' }),
    );
    await screen.findByRole('button', { name: 'Download accepted cheque PDF' });
    expect(printChequeWorkflow).toHaveBeenCalledTimes(1);
    expect(printChequeWorkflow).toHaveBeenCalledWith(chequeRequest());
    expect(JSON.parse(sessionStorage.getItem(storage)!)).toEqual(
      chequeRequest(),
    );
    expect(
      screen.getByText(
        /Physical printing and bank clearance are not confirmed/,
      ),
    ).toBeInTheDocument();
  });
  it('retains an uncertain request across remount, checks acceptance and downloads without a write', async () => {
    (printChequeWorkflow as jest.Mock).mockRejectedValue(
      new Error('Response lost'),
    );
    const mounted = show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Generate cheque PDF and mark sent' }),
    );
    await screen.findByText('Response lost');
    mounted.unmount();
    show();
    await screen.findByRole('button', { name: 'Check cheque request status' });
    expect(
      screen.queryByLabelText('Number on cheque stationery'),
    ).not.toBeInTheDocument();
    (getChequeStatus as jest.Mock).mockResolvedValue({
      accepted: true,
      payment: chequeFixture({
        sent: true,
        can_print: false,
        check_number: '000007',
      }),
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Check cheque request status' }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Download accepted cheque PDF',
      }),
    );
    await waitFor(() =>
      expect(downloadCheque).toHaveBeenCalledWith(chequeRequest()),
    );
    expect(printChequeWorkflow).toHaveBeenCalledTimes(1);
  });
  it('retries only the identical persisted request after a missing status receipt', async () => {
    sessionStorage.setItem(storage, JSON.stringify(chequeRequest()));
    show();
    await screen.findByRole('button', { name: 'Check cheque request status' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Check cheque request status' }),
    );
    await screen.findByText(/No receipt was found yet/);
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry identical cheque request' }),
    );
    await screen.findByRole('button', { name: 'Download accepted cheque PDF' });
    expect(printChequeWorkflow).toHaveBeenCalledWith(chequeRequest());
    expect(previewChequeWorkflow).not.toHaveBeenCalled();
  });
  it('blocks duplicate clicks and closing during the native print', async () => {
    let finish!: (value: unknown) => void;
    (printChequeWorkflow as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    show();
    await review();
    const button = screen.getByRole('button', {
      name: 'Generate cheque PDF and mark sent',
    });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'Escape',
      keyCode: 27,
    });
    expect(close).not.toHaveBeenCalled();
    expect(printChequeWorkflow).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'Back to payments' }),
    ).toBeDisabled();
    await act(async () =>
      finish({ payment: chequeFixture({ sent: true, can_print: false }), pdf }),
    );
  });
  it('clears a definitively rejected request and requires another review', async () => {
    (printChequeWorkflow as jest.Mock).mockRejectedValue(
      new BillingActionRejected('Changed configuration'),
    );
    show();
    await review();
    fireEvent.click(
      screen.getByRole('button', { name: 'Generate cheque PDF and mark sent' }),
    );
    await screen.findByText('Changed configuration');
    expect(sessionStorage.getItem(storage)).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: 'Generate cheque PDF and mark sent',
      }),
    ).not.toBeInTheDocument();
  });
  it('keeps corrupt recovery storage fail-closed', async () => {
    sessionStorage.setItem(storage, '{broken');
    show();
    await screen.findByText(/Cheque recovery storage is unavailable/);
    expect(
      await screen.findByRole('button', { name: 'Review cheque number' }),
    ).toBeDisabled();
    expect(printChequeWorkflow).not.toHaveBeenCalled();
  });
  it('offers existing numbered sent cheque download without renumbering and respects session expiry', async () => {
    (getChequeWorkflow as jest.Mock).mockResolvedValue(
      chequeFixture({ sent: true, can_print: false, check_number: '000007' }),
    );
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Download saved cheque PDF' }),
    );
    await waitFor(() => expect(downloadCurrentCheque).toHaveBeenCalledWith(9));
    expect(printChequeWorkflow).not.toHaveBeenCalled();
    (downloadCurrentCheque as jest.Mock).mockRejectedValue(
      new BillingSessionExpired('Session expired'),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Download saved cheque PDF' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Billing' }),
    );
    expect(reconnect).toHaveBeenCalledTimes(1);
  });
});
