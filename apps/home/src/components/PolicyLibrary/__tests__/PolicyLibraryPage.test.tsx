import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { syntheticPolicies } from '../__fixtures__/syntheticPolicies';
import { loadPolicyCatalogue } from '../policyCatalogue';
import { PolicyLibraryPage } from '../PolicyLibraryPage';

jest.mock('../../HomePageHeader', () => ({
  HomePageHeader: () => <div data-testid="home-page-header" />,
}));

jest.mock('../policyCatalogue', () => ({
  loadPolicyCatalogue: jest.fn(),
  usesSyntheticExamples: true,
}));

const mockLoadPolicyCatalogue = loadPolicyCatalogue as jest.Mock;

const renderPage = () =>
  render(
    <MemoryRouter>
      <PolicyLibraryPage />
    </MemoryRouter>,
  );

describe('PolicyLibraryPage', () => {
  beforeEach(() => {
    mockLoadPolicyCatalogue.mockReturnValue({
      ok: true,
      entries: syntheticPolicies,
    });
  });

  it('shows the heading and the information-only note', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Policy library' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Information only. Confirm current requirements with the original authority.',
      ),
    ).toBeInTheDocument();
  });

  it('labels the synthetic examples clearly', () => {
    renderPage();

    expect(
      screen.getByText(
        'Synthetic examples for development only. Not real guidance.',
      ),
    ).toBeInTheDocument();
  });

  it('shows only reviewed policies by default, newest first', () => {
    renderPage();

    const cards = screen.getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    expect(
      within(cards[0]).getByRole('heading', {
        name: 'Synthetic example: MP digital health record guidance',
      }),
    ).toBeInTheDocument();
    expect(
      within(cards[1]).getByRole('heading', {
        name: 'Synthetic example: Central data protection notice',
      }),
    ).toBeInTheDocument();
  });

  it('filters the cards as the user types a search', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(
      screen.getByRole('searchbox', { name: 'Search policies' }),
      'notice',
    );

    const cards = screen.getAllByRole('listitem');
    expect(cards).toHaveLength(1);
    expect(
      within(cards[0]).getByRole('heading', {
        name: 'Synthetic example: Central data protection notice',
      }),
    ).toBeInTheDocument();
  });

  it('says so when no policy matches the search', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(
      screen.getByRole('searchbox', { name: 'Search policies' }),
      'no such policy',
    );

    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    expect(screen.getByText('No matching policies.')).toBeInTheDocument();
  });

  it('tells the user when no policies have been published yet', () => {
    mockLoadPolicyCatalogue.mockReturnValue({ ok: true, entries: [] });

    renderPage();

    expect(
      screen.getByText('No reviewed policies have been published yet.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('No matching policies.')).not.toBeInTheDocument();
  });

  it('shows an error instead of a list when the catalogue is invalid', () => {
    mockLoadPolicyCatalogue.mockReturnValue({
      ok: false,
      errors: ['Entry 1: duplicate id "x".'],
    });

    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not load the policy catalogue.',
    );
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
