import type { Appointment } from '@bahmni/services';
import { useUserPrivilege } from '@bahmni/widgets';
import { useMutation, useQuery } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { CalendarPage } from '../CalendarPage';

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useMutation: jest.fn(),
  useQuery: jest.fn(),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('@bahmni/widgets', () => ({
  ...jest.requireActual('@bahmni/widgets'),
  useUserPrivilege: jest.fn(),
  UserGlobalAction: () => null,
}));

it('offers configured calendar actions only to appointment managers', () => {
  const now = new Date();
  now.setHours(9, 0, 0, 0);
  const appointment = {
    uuid: 'appointment-1',
    patient: { uuid: 'patient-1', name: 'Demo Patient', identifier: 'DEMO-1' },
    status: 'Scheduled',
    startDateTime: now.getTime(),
    endDateTime: now.getTime() + 15 * 60_000,
    service: { name: 'General Medicine' },
    location: { name: 'OPD-1' },
  } as Appointment;
  const mutate = jest.fn();
  (useMutation as jest.Mock).mockReturnValue({
    mutate,
    isPending: false,
    isError: false,
  });
  (useQuery as jest.Mock).mockImplementation(({ queryKey }) => ({
    data:
      queryKey[0] === 'appointment-calendar'
        ? [appointment]
        : queryKey[0] === 'legacy-appointment-actions'
          ? {
              config: {
                allowedActions: ['CheckedIn', 'Cancelled'],
                allowedActionsByStatus: {
                  Scheduled: ['CheckedIn', 'Cancelled', 'Missed'],
                },
              },
            }
          : undefined,
    isLoading: false,
    isError: false,
  }));
  const privileges = useUserPrivilege as jest.Mock;
  privileges.mockReturnValue({
    userPrivileges: [{ name: 'app:appointments' }],
    isLoading: false,
  });
  const { rerender } = render(<CalendarPage />);
  fireEvent.click(screen.getByText('Demo Patient'));
  expect(
    screen.queryByRole('button', { name: 'CheckedIn: Demo Patient' }),
  ).not.toBeInTheDocument();

  privileges.mockReturnValue({
    userPrivileges: [
      { name: 'app:appointments' },
      { name: 'app:appointments:manageAppointmentsTab' },
      { name: 'Manage Appointments' },
    ],
    isLoading: false,
  });
  rerender(<CalendarPage />);
  expect(
    screen.queryByRole('button', { name: 'Missed: Demo Patient' }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'CheckedIn: Demo Patient' }),
  );
  expect(mutate).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Check-in time'), {
    target: { value: '10:45' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm check-in' }));
  const checkIn = new Date();
  checkIn.setHours(10, 45, 0, 0);
  expect(mutate).toHaveBeenCalledWith({
    uuid: 'appointment-1',
    status: 'CheckedIn',
    onDate: checkIn,
  });

  const confirmation = jest.spyOn(window, 'confirm').mockReturnValue(false);
  fireEvent.click(
    screen.getByRole('button', { name: 'Cancelled: Demo Patient' }),
  );
  expect(mutate).toHaveBeenCalledTimes(1);
  confirmation.mockReturnValue(true);
  fireEvent.click(
    screen.getByRole('button', { name: 'Cancelled: Demo Patient' }),
  );
  expect(mutate).toHaveBeenCalledWith({
    uuid: 'appointment-1',
    status: 'Cancelled',
  });
  confirmation.mockRestore();
});
