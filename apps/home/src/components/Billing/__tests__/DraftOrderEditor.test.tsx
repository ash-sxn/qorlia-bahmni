import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  getBillingDraft,
  previewBillingDraft,
  saveBillingDraft,
} from '../billingService';
import { DraftOrderEditor } from '../DraftOrderEditor';
import { draftFixture } from './draftFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getBillingDraft: jest.fn(),
  previewBillingDraft: jest.fn(),
  saveBillingDraft: jest.fn(),
}));
jest.mock('../DraftChoiceInput', () => ({
  DraftChoiceInput: ({ label }: { label: string }) => <p>{label}</p>,
}));
const saved = jest.fn();
const close = jest.fn();
const show = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <DraftOrderEditor
        uid={3}
        orderId={false}
        saved={saved}
        close={close}
        reconnect={jest.fn()}
      />
    </QueryClientProvider>,
  );
describe('Native quotation editor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(crypto, 'randomUUID', {
      configurable: true,
      value: jest.fn(() => 'c390c708-71d7-4454-a9a9-aa524a2cdb57'),
    });
    (getBillingDraft as jest.Mock).mockResolvedValue(draftFixture());
    (previewBillingDraft as jest.Mock).mockImplementation(
      async (draft) => draft,
    );
    (saveBillingDraft as jest.Mock).mockResolvedValue({
      ...draftFixture(),
      id: 18,
      name: 'S00018',
    });
  });
  it('previews changed fields, then saves a native draft without confirmation or payments', async () => {
    show();
    const provider = await screen.findByLabelText('Provider');
    expect(
      screen.getByRole('button', { name: 'Save draft quotation' }),
    ).toBeDisabled();
    fireEvent.change(provider, { target: { value: 'QorliaQA Doctor' } });
    fireEvent.blur(provider);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save draft quotation' }),
      ).toBeEnabled(),
    );
    expect(previewBillingDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({ provider_name: 'QorliaQA Doctor' }),
      }),
      { field: 'provider_name' },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Save draft quotation' }),
    );
    await waitFor(() =>
      expect(saved).toHaveBeenCalledWith(
        expect.objectContaining({ id: 18, name: 'S00018' }),
      ),
    );
    expect(saveBillingDraft).toHaveBeenCalledWith(
      expect.any(Object),
      'c390c708-71d7-4454-a9a9-aa524a2cdb57',
    );
    expect(
      screen.queryByRole('button', { name: /Confirm order|Pay/ }),
    ).not.toBeInTheDocument();
  });
  it('preserves entries on a failed preview and requires successful recalculation before saving', async () => {
    (previewBillingDraft as jest.Mock).mockRejectedValueOnce(
      new Error('Pricing unavailable'),
    );
    show();
    const qty = await screen.findByLabelText('Quantity');
    fireEvent.change(qty, { target: { value: '2' } });
    fireEvent.blur(qty);
    await screen.findByText('Pricing unavailable');
    expect(screen.getByLabelText('Quantity')).toHaveValue(2);
    expect(
      screen.getByRole('button', { name: 'Save draft quotation' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Recalculate totals' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save draft quotation' }),
      ).toBeEnabled(),
    );
    expect(saveBillingDraft).not.toHaveBeenCalled();
  });
  it('uses the same creation key on retry and asks before discarding unsaved entries', async () => {
    (saveBillingDraft as jest.Mock).mockRejectedValueOnce(
      new Error('Save response unavailable'),
    );
    show();
    const reference = await screen.findByLabelText('Reference');
    fireEvent.change(reference, { target: { value: 'QORLIAQA-TEST' } });
    fireEvent.blur(reference);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save draft quotation' }),
      ).toBeEnabled(),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Save draft quotation' }),
    );
    await screen.findByText('Save response unavailable');
    expect(screen.getByLabelText('Reference')).toHaveValue('QORLIAQA-TEST');
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to charge orders' }),
    );
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Save draft quotation' }),
    );
    await waitFor(() => expect(saveBillingDraft).toHaveBeenCalledTimes(2));
    expect((saveBillingDraft as jest.Mock).mock.calls[0][1]).toEqual(
      (saveBillingDraft as jest.Mock).mock.calls[1][1],
    );
  });
});
