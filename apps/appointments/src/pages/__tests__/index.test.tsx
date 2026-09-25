import { useQuery } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { IndexPage } from '..';

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: jest.fn(),
}));

jest.mock('@bahmni/widgets', () => ({
  ...jest.requireActual('@bahmni/widgets'),
  useUserPrivilege: () => ({
    userPrivileges: [{ name: 'app:appointments' }],
    isLoading: false,
  }),
  UserGlobalAction: () => <div />,
}));

const mockUseQuery = useQuery as jest.Mock;

beforeEach(() => {
  mockUseQuery.mockImplementation(({ queryKey }) => ({
    data:
      queryKey[0] === 'appointment-summary'
        ? [
            {
              appointmentService: {
                uuid: 'service-1',
                name: 'General Medicine',
              },
              appointmentCountMap: {},
            },
          ]
        : [],
    isLoading: false,
    isError: false,
  }));
});

describe('IndexPage', () => {
  it('shows the appointment summary and filters by service', () => {
    render(<IndexPage />);
    expect(
      screen.getByRole('heading', { name: 'Appointment scheduling' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('rowheader', { name: 'General Medicine' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filter by service'), {
      target: { value: 'service-1' },
    });
    expect(screen.getByLabelText('Filter by service')).toHaveValue('service-1');
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: expect.arrayContaining(['appointment-day']),
        enabled: true,
      }),
    );
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<IndexPage />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows appointment details from the daily list', async () => {
    mockUseQuery.mockImplementation(({ queryKey }) => ({
      data:
        queryKey[0] === 'appointment-summary'
          ? []
          : [
              {
                uuid: 'appointment-1',
                appointmentNumber: 'APT-001',
                patient: {
                  uuid: 'patient-1',
                  name: 'Demo Patient',
                  identifier: 'DEMO-001',
                },
                service: { uuid: 'service-1', name: 'General Medicine' },
                provider: { name: 'Demo Doctor' },
                location: { name: 'OPD' },
                startDateTime: Date.parse('2099-01-01T09:00:00Z'),
                endDateTime: Date.parse('2099-01-01T09:15:00Z'),
                appointmentKind: 'Scheduled',
                status: 'Scheduled',
                comments: 'Follow-up',
                reasons: [],
              },
            ],
      isLoading: false,
      isError: false,
    }));
    const { container } = render(<IndexPage />);
    fireEvent.click(
      screen.getByRole('button', { name: 'View details: Demo Patient' }),
    );
    expect(
      screen.getByRole('heading', { name: 'Appointment details' }),
    ).toBeInTheDocument();
    expect(screen.getByText('APT-001')).toBeInTheDocument();
    expect(screen.getByText('Follow-up')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
