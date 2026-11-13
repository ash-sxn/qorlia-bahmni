import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { getDayEnd } from '../dayEnd';
import { DayEndPanel } from '../DayEndPanel';

jest.mock('../dayEnd', () => ({
  ...jest.requireActual('../dayEnd'),
  getDayEnd: jest.fn(),
}));

const show = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <DayEndPanel uid={3} reconnect={jest.fn()} />
    </QueryClientProvider>,
  );

beforeEach(() => jest.clearAllMocks());

it('shows totals by payment method for the chosen day and prints them', async () => {
  jest.mocked(getDayEnd).mockResolvedValue({
    date: '2026-11-11',
    methods: [
      {
        journal: 'Bank',
        currency: 'INR',
        received: 200,
        refunded: 0,
        count: 1,
      },
      {
        journal: 'Cash',
        currency: 'INR',
        received: 500,
        refunded: 100,
        count: 2,
      },
    ],
    payments: [],
    drafts: 1,
  });
  const print = jest.spyOn(window, 'print').mockImplementation(() => {});
  show();
  fireEvent.change(screen.getByLabelText('Day'), {
    target: { value: '2026-11-11' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Show collections' }));

  expect(
    await screen.findByText('Collections on 11 November 2026'),
  ).toBeVisible();
  const cash = screen.getByRole('row', { name: /Cash/ });
  expect(within(cash).getByText('₹400.00')).toBeVisible();
  const total = screen.getByRole('row', { name: /Total/ });
  expect(within(total).getByText('₹600.00')).toBeVisible();
  expect(screen.getByText(/1 draft payment is not counted/)).toBeVisible();
  expect(getDayEnd).toHaveBeenCalledWith('2026-11-11');

  fireEvent.click(screen.getByRole('button', { name: 'Print day-end report' }));
  expect(print).toHaveBeenCalled();
  expect(document.body).toHaveClass('qorlia-print-day-end');
  window.dispatchEvent(new Event('afterprint'));
  expect(document.body).not.toHaveClass('qorlia-print-day-end');
});

it('says so when nothing was posted that day', async () => {
  jest.mocked(getDayEnd).mockResolvedValue({
    date: '2026-11-11',
    methods: [],
    payments: [],
    drafts: 0,
  });
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Show collections' }));
  expect(
    await screen.findByText('No payments were posted this day.'),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Print day-end report' }),
  ).not.toBeInTheDocument();
});

it('shows a read failure instead of an empty day', async () => {
  jest
    .mocked(getDayEnd)
    .mockRejectedValue(new Error('Billing did not answer.'));
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Show collections' }));
  expect(await screen.findByText('Billing did not answer.')).toHaveAttribute(
    'role',
    'alert',
  );
});
