import {
  bookAppointment,
  getAppointmentBookingConflicts,
  type AppointmentSummary,
} from '@bahmni/services';
import { useQuery } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BookingForm } from '../BookingForm';

jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  bookAppointment: jest.fn(),
  getAppointmentBookingConflicts: jest.fn(),
}));

jest.mock('@bahmni/widgets', () => ({ useDebounce: (value: string) => value }));

const mockInvalidateQueries = jest.fn().mockResolvedValue(undefined);
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: jest.fn(),
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

const service = {
  appointmentService: {
    uuid: 'service-1',
    name: 'General Medicine',
    durationMins: 15,
  },
  appointmentCountMap: {},
} as AppointmentSummary;

beforeEach(() => {
  jest.clearAllMocks();
  (useQuery as jest.Mock).mockImplementation(({ queryKey }) => ({
    data:
      queryKey[0] === 'booking-patients'
        ? {
            pageOfResults: [
              {
                uuid: 'patient-1',
                givenName: 'Demo',
                familyName: 'Patient',
                identifier: 'DEMO-001',
              },
            ],
          }
        : queryKey[0] === 'appointment-locations'
          ? [{ uuid: 'location-1', display: 'OPD' }]
          : [
              { uuid: 'provider-1', display: 'Non-clinical account' },
              {
                uuid: 'provider-2',
                display: 'doctor - Demo Doctor',
                person: { display: 'Demo Doctor' },
                attributes: [
                  {
                    voided: false,
                    attributeType: { display: 'Available for appointments' },
                    value: true,
                  },
                ],
              },
            ],
    isLoading: false,
    isError: false,
  }));
});

const fillBooking = () => {
  render(
    <BookingForm
      services={[service]}
      selectedDay="2099-01-01"
      selectedServiceUuid="service-1"
      onClose={jest.fn()}
      onBooked={jest.fn()}
    />,
  );
  fireEvent.click(
    screen.getByRole('button', { name: /Demo Patient \(DEMO-001\)/ }),
  );
  fireEvent.change(screen.getByLabelText('Location'), {
    target: { value: 'location-1' },
  });
};

it('checks conflicts and blocks a conflicting booking', async () => {
  (getAppointmentBookingConflicts as jest.Mock).mockResolvedValue({
    PATIENT_DOUBLE_BOOKING: [{}],
  });
  fillBooking();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm booking' }));

  await waitFor(() =>
    expect(getAppointmentBookingConflicts).toHaveBeenCalled(),
  );
  expect(bookAppointment).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('conflicts');
});

it('offers only providers available for appointments', () => {
  fillBooking();
  expect(screen.getByRole('option', { name: 'Demo Doctor' })).toBeVisible();
  expect(
    screen.queryByRole('option', { name: 'Non-clinical account' }),
  ).not.toBeInTheDocument();
});

it('saves a conflict-free booking with the selected patient and location', async () => {
  (getAppointmentBookingConflicts as jest.Mock).mockResolvedValue({
    PATIENT_DOUBLE_BOOKING: [],
  });
  (bookAppointment as jest.Mock).mockResolvedValue({ uuid: 'appointment-1' });
  fillBooking();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm booking' }));

  await waitFor(() =>
    expect(bookAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        patientUuid: 'patient-1',
        locationUuid: 'location-1',
        serviceUuid: 'service-1',
        appointmentKind: 'Scheduled',
      }),
    ),
  );
  expect(mockInvalidateQueries).toHaveBeenCalledTimes(2);
});
