import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  BillingSessionExpired,
  getStockOperationChoices,
} from '../billingService';
import { StockOperationChoice } from '../StockOperationChoice';
import { operationRequest } from './stockOperationFixture';

jest.mock('../billingService', () => ({
  ...jest.requireActual('../billingService'),
  getStockOperationChoices: jest.fn(),
}));
const get = jest.mocked(getStockOperationChoices),
  change = jest.fn(),
  reconnect = jest.fn();
const show = (disabled = false) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <StockOperationChoice
        uid={3}
        request={operationRequest()}
        field="lot_id"
        label="Batch"
        value={6}
        name="QA-BATCH"
        disabled={disabled}
        change={change}
        reconnect={reconnect}
      />
    </QueryClientProvider>,
  );
describe('Native operation relation choices with house ComboBox', () => {
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: jest.fn(),
    });
  });
  beforeEach(() => {
    jest.clearAllMocks();
    get.mockResolvedValue({
      rows: [[6, 'QA-BATCH']],
      has_more: true,
      offset: 0,
    });
  });
  it('loads native pages, preserves identity and chooses a record with the keyboard', async () => {
    show();
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(operationRequest(), 'lot_id', '', 0),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'More batch choices' }),
      ).toBeEnabled(),
    );
    get.mockResolvedValueOnce({
      rows: [[7, 'Second batch']],
      has_more: false,
      offset: 25,
    });
    fireEvent.click(screen.getByRole('button', { name: 'More batch choices' }));
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(operationRequest(), 'lot_id', '', 25),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'More batch choices' }),
      ).toBeDisabled(),
    );
    const input = screen.getByRole('combobox', { name: 'Batch' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    await screen.findByRole('option', { name: 'Second batch' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(change).toHaveBeenCalledWith(7);
  });
  it('hides stale options while debouncing a new native search and resets paging', async () => {
    show();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'More batch choices' }),
      ).toBeEnabled(),
    );
    const input = screen.getByRole('combobox', { name: 'Batch' });
    get.mockResolvedValue({
      rows: [[8, 'Matching batch']],
      has_more: false,
      offset: 0,
    });
    fireEvent.change(input, { target: { value: 'Matching' } });
    expect(change).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'More batch choices' }),
    ).toBeDisabled();
    expect(
      screen.queryByRole('option', { name: 'QA-BATCH' }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        operationRequest(),
        'lot_id',
        'Matching',
        0,
      ),
    );
    expect(
      screen.queryByRole('button', { name: 'Previous batch choices' }),
    ).not.toBeInTheDocument();
  });
  it('clears a selection only through the explicit clear control and reloads failed searches', async () => {
    get.mockRejectedValueOnce(new Error('Search failed'));
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reload batch choices' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'More batch choices' }),
      ).toBeEnabled(),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Clear selected item' }),
    );
    expect(change).toHaveBeenCalledWith(false);
    expect(get).toHaveBeenCalledTimes(2);
  });
  it('does not clutter a single native page with unused paging or duplicate clear buttons', async () => {
    get.mockResolvedValue({
      rows: [[6, 'QA-BATCH']],
      has_more: false,
      offset: 0,
    });
    show();
    await screen.findByText('Search and select a native record.');
    expect(
      screen.queryByRole('button', { name: 'More batch choices' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Previous batch choices' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Clear batch' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Clear selected item' }),
    ).toHaveLength(1);
  });
  it('does not query disabled/readonly choices and offers reconnect after an expired search', async () => {
    const first = show(true);
    expect(get).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox')).toBeDisabled();
    first.unmount();
    get.mockRejectedValue(new BillingSessionExpired());
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reconnect Billing' }),
    );
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(change).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledTimes(1);
  });
});
