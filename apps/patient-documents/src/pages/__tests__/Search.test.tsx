import { searchPatientByNameOrId } from '@bahmni/services';
import { useUserPrivilege } from '@bahmni/widgets';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DocumentAccess } from '../../components/DocumentAccess';
import { SearchPage } from '../Search';

jest.mock('@bahmni/design-system', () => ({
  BaseLayout: ({ main }: { main: React.ReactNode }) => <div>{main}</div>,
  Header: () => null,
}));
jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  searchPatientByNameOrId: jest.fn(),
}));
jest.mock('@bahmni/widgets', () => ({
  UserGlobalAction: () => null,
  useUserPrivilege: jest.fn(),
}));

const renderSearch = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter
        initialEntries={[
          '/patient-documents/search?encounterType=RADIOLOGY&topLevelConcept=All%20Radiology%20orders',
        ]}
      >
        <DocumentAccess>
          <SearchPage />
        </DocumentAccess>
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useUserPrivilege).mockReturnValue({
    userPrivileges: [{ name: 'app:document-upload', uuid: 'privilege' }],
    isLoading: false,
  } as ReturnType<typeof useUserPrivilege>);
});

it('searches real patient IDs and preserves the configured document workflow in React links', async () => {
  jest.mocked(searchPatientByNameOrId).mockResolvedValue({
    totalCount: 1,
    pageOfResults: [
      {
        uuid: 'patient-1',
        givenName: 'Asha',
        familyName: 'Demo',
        identifier: 'ABC200007',
      },
    ],
  } as Awaited<ReturnType<typeof searchPatientByNameOrId>>);
  renderSearch();
  expect(searchPatientByNameOrId).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Patient name or ID'), {
    target: { value: ' ABC200007 ' },
  });
  fireEvent.submit(screen.getByRole('search'));
  const link = await screen.findByRole('link', { name: 'Open documents' });
  expect(searchPatientByNameOrId).toHaveBeenCalledWith('ABC200007');
  expect(link).toHaveAttribute(
    'href',
    '/patient-documents/patient-1?encounterType=RADIOLOGY&topLevelConcept=All+Radiology+orders',
  );
});

it('does not mount patient queries without document access', () => {
  jest
    .mocked(useUserPrivilege)
    .mockReturnValue({ userPrivileges: [], isLoading: false } as ReturnType<
      typeof useUserPrivilege
    >);
  renderSearch();
  expect(screen.getByRole('alert')).toHaveTextContent('You do not have access');
  expect(screen.queryByRole('search')).not.toBeInTheDocument();
  expect(searchPatientByNameOrId).not.toHaveBeenCalled();
});

it('reports search errors instead of presenting them as no patients', async () => {
  jest
    .mocked(searchPatientByNameOrId)
    .mockRejectedValue(new Error('Unavailable'));
  renderSearch();
  fireEvent.change(screen.getByLabelText('Patient name or ID'), {
    target: { value: 'ABC' },
  });
  fireEvent.submit(screen.getByRole('search'));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not search patients',
  );
});
