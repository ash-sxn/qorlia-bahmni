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
