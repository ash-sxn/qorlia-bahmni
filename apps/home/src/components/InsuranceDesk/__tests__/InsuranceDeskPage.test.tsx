import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { syntheticCases } from '../__fixtures__/syntheticCases';
import { loadCases } from '../caseCatalogue';
import { InsuranceDeskPage } from '../InsuranceDeskPage';

jest.mock('../../HomePageHeader', () => ({
  HomePageHeader: () => <div data-testid="home-page-header" />,
}));

jest.mock('../caseCatalogue', () => ({
  loadCases: jest.fn(),
  usesSyntheticCases: true,
}));

const mockLoadCases = loadCases as jest.Mock;

const CurrentSearch = () => (
  <output data-testid="current-search">{useLocation().search}</output>
);

const renderPage = (url = '/insurance') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <InsuranceDeskPage />
      <CurrentSearch />
    </MemoryRouter>,
  );

const searchBox = () => screen.getByRole('searchbox', { name: 'Search cases' });

describe('InsuranceDeskPage', () => {
  beforeAll(() => {
    // jsdom does not implement scrollIntoView, which the Carbon dropdown calls.
    Element.prototype.scrollIntoView = jest.fn();
  });

  beforeEach(() => {
    mockLoadCases.mockReturnValue({ ok: true, cases: syntheticCases });
  });

  it('shows the heading and says the statuses are not payer confirmed', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Insurance desk' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Statuses are recorded by desk staff. A payer or TPA has not confirmed them here.',
      ),
    ).toBeInTheDocument();
  });

  it('labels the synthetic cases clearly', () => {
    renderPage();

    expect(
      screen.getByText(
        'Synthetic cases for development only. Not real patients, policies or claims.',
      ),
    ).toBeInTheDocument();
  });

  it('shows every case, most recently updated first', () => {
    renderPage();

    const cards = screen.getAllByRole('listitem');
    expect(cards).toHaveLength(12);
    expect(
      within(cards[0]).getByRole('heading', {
        name: 'Synthetic patient 0008',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('12 results')).toBeInTheDocument();
  });

  it('shows who recorded the status', () => {
    renderPage('/insurance?q=SYN-POL-0008');

    const [card] = screen.getAllByRole('listitem');
    expect(within(card).getByText('Settled')).toBeInTheDocument();
    expect(
      within(card).getByText(/^Recorded by Synthetic desk user, /),
    ).toBeInTheDocument();
  });

  it('does not show deducted TDS as money still due', () => {
    renderPage('/insurance?q=SYN-POL-0008');

    expect(screen.getByText('Outstanding from payer: ₹0')).toBeInTheDocument();
  });

  it('shows what is still due on a short-paid case', () => {
    renderPage('/insurance?q=SYN-POL-0009');

    expect(
      screen.getByText('Outstanding from payer: ₹30,000'),
    ).toBeInTheDocument();
  });

  it('shows no outstanding amount before anything is approved', () => {
    renderPage('/insurance?q=SYN-POL-0001');

    expect(
      screen.queryByText(/Outstanding from payer/),
    ).not.toBeInTheDocument();
  });

  it('flags only the cases with an open query', () => {
    renderPage();

    expect(screen.getAllByText('Open query')).toHaveLength(2);
  });

  it('filters the cards as the user types a search', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(searchBox(), 'SYN-POL-0009');

    const cards = screen.getAllByRole('listitem');
    expect(cards).toHaveLength(1);
    expect(screen.getByText('1 result')).toBeInTheDocument();
  });

  it('says so when no case matches the search', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(searchBox(), 'no such case');

    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    expect(screen.getByText('No matching cases.')).toBeInTheDocument();
  });

  it('filters by status', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('combobox', { name: 'Status' }));
    await user.click(screen.getByRole('option', { name: 'Denied' }));

    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByTestId('current-search')).toHaveTextContent(
      '?status=denied',
    );
  });

  it('filters by route', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('combobox', { name: 'Claim route' }));
    await user.click(screen.getByRole('option', { name: 'Reimbursement' }));

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('offers the payers from the data and filters by them', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('combobox', { name: 'Payer' }));
    await user.click(
      screen.getByRole('option', { name: 'Synthetic Insurer B' }),
    );

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('clears the search and every filter at once', async () => {
    const user = userEvent.setup();
    renderPage('/insurance?q=SYN-POL-0009&status=short_paid');

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(searchBox()).toHaveValue('');
    expect(screen.getAllByRole('listitem')).toHaveLength(12);
    expect(screen.getByTestId('current-search')).toBeEmptyDOMElement();
  });

  it('restores the search and filters from the URL', () => {
    renderPage('/insurance?q=synthetic&route=reimbursement');

    expect(searchBox()).toHaveValue('synthetic');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('keeps every character when the user types quickly', async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();

    await user.type(searchBox(), 'SYN-POL');

    expect(searchBox()).toHaveValue('SYN-POL');
    expect(screen.getByTestId('current-search')).toHaveTextContent(
      '?q=SYN-POL',
    );
  });

  it('tells the user when there are no cases', () => {
    mockLoadCases.mockReturnValue({ ok: true, cases: [] });

    renderPage();

    expect(screen.getByText('No cases to show yet.')).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('shows an error instead of a list when the cases are invalid', () => {
    mockLoadCases.mockReturnValue({
      ok: false,
      errors: ['Case 1: duplicate id "x".'],
    });

    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not load the insurance cases.',
    );
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
