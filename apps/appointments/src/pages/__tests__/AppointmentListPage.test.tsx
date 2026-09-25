import type { Appointment } from '@bahmni/services';
import { useUserPrivilege } from '@bahmni/widgets';
import { useMutation, useQuery } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  AppointmentListPage,
  filterAppointments,
  getAllowedTransitions,
} from '../AppointmentListPage';

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

it('filters appointments by patient, service, provider, location and status', () => {
  const appointments = [
    {
      patient: { name: 'Anita Rao', identifier: 'DEMO-101' },
      service: { uuid: 'service-1' },
      providers: [{ uuid: 'provider-1' }],
      location: { uuid: 'location-1' },
      status: 'Scheduled',
    },
    {
      patient: { name: 'Other Patient', identifier: 'DEMO-202' },
      service: { uuid: 'service-2' },
      providers: [{ uuid: 'provider-2' }],
      location: { uuid: 'location-2' },
      status: 'WaitList',
    },
  ] as Appointment[];

  expect(
    filterAppointments(appointments, {
      patient: 'demo-101',
      serviceUuid: 'service-1',
      providerUuid: 'provider-1',
      locationUuid: 'location-1',
      status: 'Scheduled',
    }),
  ).toEqual([appointments[0]]);
});

it('only exposes transitions allowed by the legacy configuration', () => {
  const config = {
    config: {
      allowedActions: ['CheckedIn', 'Completed', 'Cancelled'],
      allowedActionsByStatus: {
        Scheduled: ['CheckedIn', 'Cancelled', 'Missed'],
        CheckedIn: ['Completed', 'Cancelled'],
      },
    },
  };

  expect(getAllowedTransitions(config, 'Scheduled')).toEqual([
    'CheckedIn',
    'Cancelled',
  ]);
  expect(getAllowedTransitions(config, 'Completed')).toEqual([]);
  expect(getAllowedTransitions(undefined, 'Scheduled')).toEqual([]);
});

it('requires management access and confirmation before changing status', () => {
  const privileges = useUserPrivilege as jest.Mock;
  const mutate = jest.fn();
  (useMutation as jest.Mock).mockReturnValue({
    mutate,
    isPending: false,
    isError: false,
  });
  (useQuery as jest.Mock).mockImplementation(({ queryKey }) => ({
    data:
      queryKey[0] === 'legacy-appointment-actions'
        ? {
            config: {
              allowedActions: ['CheckedIn', 'Cancelled'],
              allowedActionsByStatus: {
                Scheduled: ['CheckedIn', 'Cancelled', 'Missed'],
              },
            },
          }
        : queryKey[0] === 'appointment-list-day'
          ? [
              {
                uuid: 'appointment-1',
                patient: { uuid: 'patient-1', name: 'Demo Patient' },
                status: 'Scheduled',
                startDateTime: Date.parse('2099-01-01T09:00:00Z'),
              },
            ]
          : [],
    isLoading: false,
    isError: false,
  }));
  privileges.mockReturnValue({
    userPrivileges: [{ name: 'app:appointments' }],
    isLoading: false,
  });
  const { rerender } = render(
    <MemoryRouter initialEntries={['/bahmni-v2/appointments/list']}>
      <AppointmentListPage />
    </MemoryRouter>,
  );
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
  rerender(
    <MemoryRouter initialEntries={['/bahmni-v2/appointments/list']}>
      <AppointmentListPage />
    </MemoryRouter>,
  );
  expect(
    screen.queryByRole('button', { name: 'Missed: Demo Patient' }),
  ).not.toBeInTheDocument();
  const confirmation = jest.spyOn(window, 'confirm').mockReturnValue(false);
  fireEvent.click(
    screen.getByRole('button', { name: 'CheckedIn: Demo Patient' }),
  );
  expect(mutate).not.toHaveBeenCalled();
  confirmation.mockReturnValue(true);
  fireEvent.click(
    screen.getByRole('button', { name: 'CheckedIn: Demo Patient' }),
  );
  expect(mutate).toHaveBeenCalledWith({
    uuid: 'appointment-1',
    status: 'CheckedIn',
  });
  confirmation.mockRestore();
});
