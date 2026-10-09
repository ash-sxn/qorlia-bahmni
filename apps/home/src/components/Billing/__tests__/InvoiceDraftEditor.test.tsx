import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { money } from '../billingFormat';
import {
  BillingSessionExpired,
  getInvoiceDraft,
  previewInvoiceDraft,
  saveInvoiceDraft,
} from '../billingService';
import { InvoiceDraftEditor } from '../InvoiceDraftEditor';
import { invoiceDraftFixture } from './invoiceDraftFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getInvoiceDraft: jest.fn(),
  previewInvoiceDraft: jest.fn(),
  saveInvoiceDraft: jest.fn(),
}));
jest.mock('../DraftChoiceInput', () => ({
  DraftChoiceInput: ({
    label,
    onChange,
    disabled,
  }: {
    label: string;
    onChange: (value: number) => void;
    disabled?: boolean;
  }) => (
    <button disabled={disabled} onClick={() => onChange(11)}>
      {label}
    </button>
  ),
}));
const saved = jest.fn();
const close = jest.fn();
const reconnect = jest.fn();
const show = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <InvoiceDraftEditor
        uid={3}
        invoiceId={7}
        saved={saved}
        close={close}
        reconnect={reconnect}
      />
    </QueryClientProvider>,
  );

describe('Native invoice draft editor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    let id = 0;
    Object.defineProperty(crypto, 'randomUUID', {
      configurable: true,
      value: jest.fn(() => `test-${id++}`),
    });
    (getInvoiceDraft as jest.Mock).mockResolvedValue(invoiceDraftFixture());
    (previewInvoiceDraft as jest.Mock).mockImplementation(async (draft) => ({
      ...draft,
      review_version: 'b'.repeat(64),
      totals: { ...draft.totals, invoice_total: 750 },
    }));
    (saveInvoiceDraft as jest.Mock).mockResolvedValue(invoiceDraftFixture());
  });
  it('uses native reviewed totals and saves only this existing draft', async () => {
    show();
    const quantity = await screen.findByLabelText('Quantity');
    const save = screen.getByRole('button', { name: 'Save draft invoice' });
    expect(save).toBeDisabled();
    fireEvent.change(quantity, { target: { value: '2' } });
    expect(save).toBeDisabled();
    fireEvent.blur(quantity);
    await waitFor(() => expect(save).toBeEnabled());
    expect(previewInvoiceDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 7,
        lines: [
          expect.objectContaining({
            values: expect.objectContaining({ quantity: 2 }),
          }),
        ],
      }),
      { field: 'quantity', line: 0 },
    );
    expect(screen.getByText(money(750, 'INR'))).toBeInTheDocument();
    fireEvent.click(save);
    await waitFor(() =>
      expect(saved).toHaveBeenCalledWith(invoiceDraftFixture()),
    );
    expect(saveInvoiceDraft).toHaveBeenCalledWith(
      expect.objectContaining({ review_version: 'b'.repeat(64) }),
    );
    expect(
      screen.queryByRole('button', {
        name: /Post invoice|Record payment|Apply credit/,
      }),
    ).not.toBeInTheDocument();
  });
  it('preserves edits and blocks save until failed previews are successfully recalculated', async () => {
    (previewInvoiceDraft as jest.Mock).mockRejectedValueOnce(
      new Error('Native tax configuration changed'),
    );
    show();
    const quantity = await screen.findByLabelText('Quantity');
    fireEvent.change(quantity, { target: { value: '3' } });
    fireEvent.blur(quantity);
    await screen.findByText('Native tax configuration changed');
    expect(screen.getByLabelText('Quantity')).toHaveValue(3);
    expect(
      screen.getByRole('button', { name: 'Save draft invoice' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Recalculate totals' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save draft invoice' }),
      ).toBeEnabled(),
    );
    expect(saveInvoiceDraft).not.toHaveBeenCalled();
  });
  it('keeps entries after a stale or failed save and asks before discarding', async () => {
    (saveInvoiceDraft as jest.Mock).mockRejectedValueOnce(
      new Error('The draft changed. Reload before editing.'),
    );
    show();
    const reference = await screen.findByLabelText('Reference');
    fireEvent.change(reference, { target: { value: 'QorliaQA Updated' } });
    fireEvent.blur(reference);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save draft invoice' }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save draft invoice' }));
    await screen.findByText('The draft changed. Reload before editing.');
    expect(screen.getByLabelText('Reference')).toHaveValue('QorliaQA Updated');
    fireEvent.click(screen.getByRole('button', { name: 'Back to invoices' }));
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Reference')).toHaveValue('QorliaQA Updated');
    fireEvent.click(screen.getByRole('button', { name: 'Back to invoices' }));
    fireEvent.click(screen.getByRole('button', { name: /Discard changes/ }));
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('allows sections, notes and manual lines without forcing a catalogue product', async () => {
    show();
    await screen.findByLabelText('Quantity');
    fireEvent.click(
      screen.getByRole('button', { name: 'Add product or service' }),
    );
    expect(screen.getAllByLabelText('Description')).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Line account' })[1]);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save draft invoice' }),
      ).toBeEnabled(),
    );
    expect(
      (previewInvoiceDraft as jest.Mock).mock.calls[0][0].lines[1].values,
    ).toEqual(
      expect.objectContaining({
        product_id: false,
        account_id: 11,
        display_type: 'product',
        quantity: 1,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add section' }));
    expect(screen.getByText('Section 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    expect(screen.getByText('Note 4')).toBeInTheDocument();
  });
  it('shows credits correctly and locks the original journal of a previously posted draft', async () => {
    (getInvoiceDraft as jest.Mock).mockResolvedValue({
      ...invoiceDraftFixture(),
      move_type: 'out_refund',
      journal_locked: true,
    });
    show();
    await screen.findByLabelText('Quantity');
    expect(
      screen.getByRole('button', { name: 'Save draft credit note' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Sales journal' }),
    ).toBeDisabled();
  });
  it('does not permit readonly accounts to preview, save or search editable choices', async () => {
    (getInvoiceDraft as jest.Mock).mockResolvedValue({
      ...invoiceDraftFixture(),
      can_edit: false,
    });
    show();
    await screen.findByLabelText('Quantity');
    expect(screen.getByLabelText('Quantity')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Customer' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Save draft invoice' }),
    ).toBeDisabled();
    expect(previewInvoiceDraft).not.toHaveBeenCalled();
  });
  it('requires explicit discard before reconnecting an expired session with unsaved edits', async () => {
    (previewInvoiceDraft as jest.Mock).mockRejectedValueOnce(
      new BillingSessionExpired('Session expired'),
    );
    show();
    const quantity = await screen.findByLabelText('Quantity');
    fireEvent.change(quantity, { target: { value: '4' } });
    fireEvent.blur(quantity);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Billing' }),
    );
    expect(reconnect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Quantity')).toHaveValue(4);
    expect(
      screen.getByRole('button', { name: 'Save draft invoice' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect Billing' }));
    fireEvent.click(
      screen.getByRole('button', { name: /Discard changes and reconnect/ }),
    );
    expect(reconnect).toHaveBeenCalledTimes(1);
  });
  it('warns that scheduled posting and recurring options have future accounting effects', async () => {
    show();
    await screen.findByLabelText('Quantity');
    fireEvent.change(screen.getByLabelText('Automatic posting'), {
      target: { value: 'monthly' },
    });
    await screen.findByLabelText('Repeat until');
    expect(
      screen.getByText(
        /Recurring options can create and post subsequent invoices/,
      ),
    ).toBeInTheDocument();
    expect(previewInvoiceDraft).toHaveBeenCalledWith(expect.any(Object), {
      field: 'auto_post',
    });
  });
});
