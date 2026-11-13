import { fireEvent, render, screen } from '@testing-library/react';
import { BillingSessionExpired } from '../billingService';
import { finaliseRefund } from '../cashierBilling';
import { RefundModal } from '../RefundModal';
import { invoiceWorkflowFixture } from './invoiceWorkflowFixture';

jest.mock('../cashierBilling', () => ({
  ...jest.requireActual('../cashierBilling'),
  finaliseRefund: jest.fn(),
}));

const credit = invoiceWorkflowFixture({
  id: 21,
  name: 'RINV/QA/21',
  move_type: 'out_refund',
});

const show = () => {
  const handlers = {
    close: jest.fn(),
    pay: jest.fn(),
    finished: jest.fn(),
    reconnect: jest.fn(),
  };
  render(<RefundModal credit={credit} {...handlers} />);
  return handlers;
};

beforeEach(() => jest.clearAllMocks());

it('finalises the draft credit note only when asked, then opens the payout', async () => {
  jest.mocked(finaliseRefund).mockResolvedValue({ kind: 'pay', invoiceId: 21 });
  const { pay } = show();
  expect(screen.getByText(/saved as a draft/)).toBeVisible();
  expect(finaliseRefund).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Finalise and pay back' }),
  );
  await screen.findByRole('button', { name: 'Finalise and pay back' });
  expect(finaliseRefund).toHaveBeenCalledWith(21, expect.any(Function));
  expect(pay).toHaveBeenCalledWith(21);
});

it('leaves the draft for later without paying anything', () => {
  const { finished } = show();
  fireEvent.click(screen.getByRole('button', { name: 'Later' }));
  expect(finished).toHaveBeenCalledWith(
    expect.stringContaining('No money was paid back yet.'),
  );
  expect(finaliseRefund).not.toHaveBeenCalled();
});

it('shows why the refund cannot continue', async () => {
  jest.mocked(finaliseRefund).mockResolvedValue({
    kind: 'blocked',
    message: 'This credit note cannot be finalised with your account.',
  });
  const { pay } = show();
  fireEvent.click(
    screen.getByRole('button', { name: 'Finalise and pay back' }),
  );
  expect(
    await screen.findByText(
      'This credit note cannot be finalised with your account.',
    ),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Finalise and pay back' }),
  ).toBeDisabled();
  expect(pay).not.toHaveBeenCalled();
});

it('warns that an unclear failure may have finalised the credit note', async () => {
  jest.mocked(finaliseRefund).mockRejectedValue(new Error('Network error'));
  show();
  fireEvent.click(
    screen.getByRole('button', { name: 'Finalise and pay back' }),
  );
  expect(await screen.findByText(/may already be finalised/)).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Finalise and pay back' }),
  ).toBeDisabled();
});

it('asks to reconnect when the Billing session expired', async () => {
  jest.mocked(finaliseRefund).mockRejectedValue(new BillingSessionExpired());
  const { reconnect } = show();
  fireEvent.click(
    screen.getByRole('button', { name: 'Finalise and pay back' }),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Reconnect Billing' }),
  );
  expect(reconnect).toHaveBeenCalledTimes(1);
});
