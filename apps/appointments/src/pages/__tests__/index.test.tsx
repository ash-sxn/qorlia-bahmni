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
});
