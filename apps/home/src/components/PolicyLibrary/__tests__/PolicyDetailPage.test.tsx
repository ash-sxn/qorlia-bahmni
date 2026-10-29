import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { syntheticPolicies } from '../__fixtures__/syntheticPolicies';
import { loadPolicyCatalogue } from '../policyCatalogue';
import { PolicyDetailPage } from '../PolicyDetailPage';

jest.mock('../../HomePageHeader', () => ({
  HomePageHeader: () => <div data-testid="home-page-header" />,
}));

jest.mock('../policyCatalogue', () => ({
  loadPolicyCatalogue: jest.fn(),
  usesSyntheticExamples: true,
}));

const mockLoadPolicyCatalogue = loadPolicyCatalogue as jest.Mock;

const renderDetail = (policyId: string) =>
  render(
    <MemoryRouter initialEntries={[`/policies/${policyId}`]}>
      <Routes>
        <Route path="/policies/:policyId" element={<PolicyDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('PolicyDetailPage', () => {
  beforeEach(() => {
    mockLoadPolicyCatalogue.mockReturnValue({
      ok: true,
      entries: syntheticPolicies,
    });
  });

  it('shows the policy title, labels, authority and summary', () => {
    renderDetail('synthetic-central-data-protection');

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Synthetic example: Central data protection notice',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Reviewed')).toBeInTheDocument();
    expect(screen.getByText('Central')).toBeInTheDocument();
    expect(screen.getByText('Data protection')).toBeInTheDocument();
    expect(
      screen.getByText('Issued by: Synthetic example authority'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Synthetic test text. Not real guidance.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Synthetic scope note.')).toBeInTheDocument();
  });

  it('shows every known date and "Not provided" for the missing ones', () => {
    renderDetail('synthetic-mp-digital-health');

    expect(screen.getByText('Mar 12, 2026')).toBeInTheDocument();
    expect(screen.getByText('Oct 1, 2026')).toBeInTheDocument();
    expect(screen.getByText('Oct 2, 2026')).toBeInTheDocument();
    expect(screen.getAllByText('Not provided')).toHaveLength(2);
  });

  it('links to the official source in a new tab and shows its host', () => {
    renderDetail('synthetic-mp-digital-health');

    const link = screen.getByRole('link', {
      name: 'Open official source (opens in a new tab)',
    });
    expect(link).toHaveAttribute(
      'href',
      'https://www.example.org/synthetic/mp-digital-health',
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('www.example.org')).toBeInTheDocument();
  });

  it('warns when our content review is overdue', () => {
    renderDetail('synthetic-central-data-protection');

    expect(
      screen.getByText(
        'Our content review is due. This does not mean the policy itself has expired.',
      ),
    ).toBeInTheDocument();
  });

  it('does not warn when the review is not yet due', () => {
    mockLoadPolicyCatalogue.mockReturnValue({
      ok: true,
      entries: [{ ...syntheticPolicies[0], reviewDueOn: '2099-01-01' }],
    });

    renderDetail('synthetic-mp-digital-health');

    expect(
      screen.queryByText(
        'Our content review is due. This does not mean the policy itself has expired.',
      ),
    ).not.toBeInTheDocument();
  });

  it('links back to the policy library', () => {
    renderDetail('synthetic-mp-digital-health');

    expect(
      screen.getByRole('link', { name: 'Back to policy library' }),
    ).toHaveAttribute('href', '/home/policies');
  });

  it('links back to the list with the search and filters the user had', () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/policies/synthetic-mp-digital-health',
            state: { librarySearch: '?q=digital&jurisdiction=madhya_pradesh' },
          },
        ]}
      >
        <Routes>
          <Route path="/policies/:policyId" element={<PolicyDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('link', { name: 'Back to policy library' }),
    ).toHaveAttribute(
      'href',
      '/home/policies?q=digital&jurisdiction=madhya_pradesh',
    );
  });

  it('shows a useful not-found state for an unknown id', () => {
    renderDetail('does-not-exist');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Policy not found' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to policy library' }),
    ).toBeInTheDocument();
  });

  it('shows an error when the catalogue is invalid', () => {
    mockLoadPolicyCatalogue.mockReturnValue({ ok: false, errors: ['x'] });

    renderDetail('synthetic-mp-digital-health');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not load the policy catalogue.',
    );
  });
});
