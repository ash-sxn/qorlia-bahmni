import {
  getAppointmentBookingConflicts,
  type Appointment,
  updateAppointment,
} from '@bahmni/services';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EditAppointmentForm } from '../EditAppointmentForm';

jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  getAppointmentBookingConflicts: jest.fn(),
  updateAppointment: jest.fn(),
}));

const mockInvalidateQueries = jest.fn().mockResolvedValue(undefined);
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: ({ queryKey }: { queryKey: string[] }) =>
    queryKey[0] === 'allAppointmentServices'
      ? {
          data: [
            { uuid: 'service-1', name: 'Consultation' },
            {
              uuid: 'service-2',
              name: 'Follow-up visit',
              location: { uuid: 'location-2', name: 'OPD-2' },
            },
          ],
        }
      : {
          data: [
            { uuid: 'location-1', display: 'OPD-1' },
            { uuid: 'location-2', display: 'OPD-2' },
          ],
        },
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

const appointment = {
  uuid: 'appointment-1',
  patient: { uuid: 'patient-1', name: 'Demo Patient', identifier: 'DEMO-1' },
  service: { uuid: 'service-1', name: 'Consultation' },
  serviceType: { uuid: 'type-1', name: 'Follow-up' },
  location: { uuid: 'location-1', name: 'OPD-1' },
  dateAppointmentScheduled: new Date('2026-09-25T08:00:00').getTime(),
  startDateTime: new Date('2099-01-01T09:00:00').getTime(),
  endDateTime: new Date('2099-01-01T09:20:00').getTime(),
  appointmentKind: 'WalkIn',
  status: 'Scheduled',
  comments: 'Original note',
  providers: [
    {
      uuid: 'provider-1',
      name: 'Doctor One',
      response: 'AWAITING',
      comments: 'Invited',
    },
    {
      uuid: 'provider-2',
      name: 'Doctor Two',
      response: 'CANCELLED',
      comments: null,
    },
  ],
} as Appointment;

beforeEach(() => {
  jest.clearAllMocks();
});

it('updates time and notes while preserving the existing appointment fields', async () => {
  (getAppointmentBookingConflicts as jest.Mock).mockResolvedValue({});
  (updateAppointment as jest.Mock).mockResolvedValue(appointment);
  const onSaved = jest.fn();
  render(
    <EditAppointmentForm
      appointment={appointment}
      onClose={jest.fn()}
      onSaved={onSaved}
    />,
  );
  fireEvent.change(screen.getByLabelText('Start time'), {
    target: { value: '10:00' },
  });
  fireEvent.change(screen.getByLabelText('End time'), {
    target: { value: '10:30' },
  });
  fireEvent.change(screen.getByLabelText('Notes'), {
    target: { value: 'Updated note' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  await waitFor(() =>
    expect(updateAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        uuid: 'appointment-1',
        patientUuid: 'patient-1',
        serviceUuid: 'service-1',
        serviceTypeUuid: 'type-1',
        locationUuid: 'location-1',
        appointmentKind: 'WalkIn',
        status: 'Scheduled',
        dateAppointmentScheduled: new Date(
          appointment.dateAppointmentScheduled,
        ).toISOString(),
        startDateTime: new Date('2099-01-01T10:00:00').toISOString(),
        endDateTime: new Date('2099-01-01T10:30:00').toISOString(),
        providers: [
          { uuid: 'provider-1', response: 'AWAITING', comments: 'Invited' },
        ],
        comments: 'Updated note',
      }),
    ),
  );
  expect(onSaved).toHaveBeenCalled();
});

it('does not save an appointment with an end time before its start', () => {
  render(
    <EditAppointmentForm
      appointment={appointment}
      onClose={jest.fn()}
      onSaved={jest.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText('End time'), {
    target: { value: '08:00' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'end time after the start',
  );
  expect(updateAppointment).not.toHaveBeenCalled();
});

it('does not replace an unset scheduling date with the Unix epoch', async () => {
  (getAppointmentBookingConflicts as jest.Mock).mockResolvedValue({});
  (updateAppointment as jest.Mock).mockResolvedValue(appointment);
  render(
    <EditAppointmentForm
      appointment={
        {
          ...appointment,
          dateAppointmentScheduled: null,
        } as unknown as Appointment
      }
      onClose={jest.fn()}
      onSaved={jest.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(updateAppointment).toHaveBeenCalled());
  expect((updateAppointment as jest.Mock).mock.calls[0][0]).not.toHaveProperty(
    'dateAppointmentScheduled',
  );
});

it('changes service and its fixed location without retaining an unrelated service type', async () => {
  (getAppointmentBookingConflicts as jest.Mock).mockResolvedValue({});
  (updateAppointment as jest.Mock).mockResolvedValue(appointment);
  render(
    <EditAppointmentForm
      appointment={appointment}
      onClose={jest.fn()}
      onSaved={jest.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText('Service'), {
    target: { value: 'service-2' },
  });
  expect(screen.getByLabelText('Location')).toHaveValue('location-2');
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(updateAppointment).toHaveBeenCalled());
  const request = (updateAppointment as jest.Mock).mock.calls[0][0];
  expect(request).toMatchObject({
    serviceUuid: 'service-2',
    locationUuid: 'location-2',
  });
  expect(getAppointmentBookingConflicts).toHaveBeenCalledWith(request);
  expect(request).not.toHaveProperty('serviceTypeUuid');
});

it('changes the location for a service without a fixed location', async () => {
  (getAppointmentBookingConflicts as jest.Mock).mockResolvedValue({});
  (updateAppointment as jest.Mock).mockResolvedValue(appointment);
  render(
    <EditAppointmentForm
      appointment={appointment}
      onClose={jest.fn()}
      onSaved={jest.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText('Location'), {
    target: { value: 'location-2' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() =>
    expect(updateAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceUuid: 'service-1',
        serviceTypeUuid: 'type-1',
        locationUuid: 'location-2',
      }),
    ),
  );
});
