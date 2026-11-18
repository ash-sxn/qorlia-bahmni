import { searchPatientByNameOrId } from '@bahmni/services';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PatientRecordSearchPage } from '../PatientRecordSearchPage';

jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  searchPatientByNameOrId: jest.fn(),
}));

const mockSearch = searchPatientByNameOrId as jest.Mock;

const renderPage = (url = '/records') =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[url]}>
        <PatientRecordSearchPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const search = async (text: string) => {
  const user = userEvent.setup();
  await user.type(
    screen.getByRole('searchbox', { name: 'Find a patient' }),
    text,
  );
  await user.click(screen.getByRole('button', { name: 'Search' }));
};

describe('PatientRecordSearchPage', () => {
  beforeEach(() => {
    mockSearch.mockReset();
    mockSearch.mockResolvedValue({
      totalCount: 1,
      pageOfResults: [
        {
          uuid: 'patient-1',
          givenName: 'Brijesh',
          middleName: '',
          familyName: 'Mishra',
          identifier: 'ABC200042',
          gender: 'M',
          age: '46',
        },
      ],
    });
  });

  it('explains how to search and does not search before the user asks', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Patients' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Type at least 2 letters of the name, or the patient ID, then choose Search.',
      ),
    ).toBeInTheDocument();
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('lists the matching patients with a link to each record', async () => {
    renderPage();
    await search(' Brijesh ');

    const results = within(
      await screen.findByRole('list', { name: 'Patients found' }),
    );
    expect(mockSearch).toHaveBeenCalledWith('Brijesh');
    expect(
      results.getByRole('link', { name: 'Brijesh Mishra' }),
    ).toHaveAttribute('href', '/home/records/patient-1');
    expect(results.getByText('46 y · M · ABC200042')).toBeInTheDocument();
    expect(results.getByRole('link', { name: 'Open chart' })).toHaveAttribute(
      'href',
      '/home/records/patient-1',
    );
    expect(
      results.queryByRole('link', { name: 'Start consultation' }),
    ).not.toBeInTheDocument();
  });

  it('runs the search typed in the top bar and offers a consultation for an open visit', async () => {
    mockSearch.mockResolvedValue({
      totalCount: 1,
      pageOfResults: [
        {
          uuid: 'patient-2',
          givenName: 'Sunita',
          middleName: '',
          familyName: 'Verma',
          identifier: 'ABC200049',
          gender: 'F',
          age: '52',
          activeVisitUuid: 'visit-1',
        },
      ],
    });
    renderPage('/records?q=Sunita');

    const results = within(
      await screen.findByRole('list', { name: 'Patients found' }),
    );
    expect(mockSearch).toHaveBeenCalledWith('Sunita');
    expect(
      screen.getByRole('searchbox', { name: 'Find a patient' }),
    ).toHaveValue('Sunita');
    expect(
      results.getByRole('link', { name: 'Start consultation' }),
    ).toHaveAttribute('href', '/home/dictation?patient=patient-2');
  });

  it('does not search for a single letter', async () => {
    renderPage();
    await search('B');

    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('says when no patient matches', async () => {
    mockSearch.mockResolvedValue({ totalCount: 0, pageOfResults: [] });
    renderPage();
    await search('Nobody');

    expect(
      await screen.findByText('No patient matches this search.'),
    ).toBeInTheDocument();
  });

  it('shows an error when the search fails', async () => {
    mockSearch.mockRejectedValue(new Error('500'));
    renderPage();
    await search('Brijesh');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The search could not be completed. Try again.',
    );
  });
});
