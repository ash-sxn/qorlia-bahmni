import { getFormattedPatientById } from '@bahmni/services';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { syntheticReferrals } from '../__fixtures__/syntheticReferrals';
import { loadDirectory } from '../referralDirectory';
import { ReferralDirectoryPage } from '../ReferralDirectoryPage';

jest.mock('../../HomePageHeader', () => ({
  HomePageHeader: () => <div data-testid="home-page-header" />,
}));

jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  getFormattedPatientById: jest.fn(),
}));

jest.mock('../referralDirectory', () => ({
  loadDirectory: jest.fn(),
  usesSyntheticReferrals: true,
}));

const mockLoadDirectory = loadDirectory as jest.Mock;
const mockPatient = getFormattedPatientById as jest.Mock;

const renderPage = (url = '/referrals') =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[url]}>
        <ReferralDirectoryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const entries = () =>
  within(screen.getByRole('list', { name: 'Directory entries' })).getAllByRole(
    'listitem',
  );

describe('ReferralDirectoryPage', () => {
  beforeAll(() => {
    // jsdom does not implement scrollIntoView, which the Carbon dropdown calls.
    Element.prototype.scrollIntoView = jest.fn();
  });

  beforeEach(() => {
    mockLoadDirectory.mockReturnValue({
      ok: true,
      entries: syntheticReferrals,
    });
    mockPatient.mockResolvedValue({
      fullName: 'Brijesh Mishra',
      identifier: 'ABC200042',
    });
  });

  it('lists every entry by speciality and labels the synthetic examples', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Referral directory' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Review build: these entries are made-up examples, not real doctors or hospitals.',
      ),
    ).toBeInTheDocument();
    expect(entries()).toHaveLength(syntheticReferrals.length);
    expect(screen.getByRole('status')).toHaveTextContent('8 shown');
    expect(
      within(entries()[0]).getByRole('heading', { level: 2 }),
    ).toHaveTextContent('Dr. Example Cardiologist (synthetic)');
  });

  it('shows how to reach an entry, PM-JAY acceptance and who verified it', () => {
    renderPage();

    const first = within(entries()[0]);
    expect(first.getByText('Doctor')).toBeInTheDocument();
    expect(
      first.getByText(
        'Cardiology · Example Heart Centre (synthetic) · Gwalior',
      ),
    ).toBeInTheDocument();
    expect(
      first.getByRole('link', { name: '+91 00000 00001' }),
    ).toHaveAttribute('href', 'tel:+910000000001');
    expect(first.getByText('Accepted')).toBeInTheDocument();
    expect(
      first.getByText(/Verified on .*2026 by Synthetic example/),
    ).toBeInTheDocument();
    expect(
      first.getByRole('link', { name: 'Write referral letter' }),
    ).toHaveAttribute('href', '/referrals/example-cardiologist-gwalior/letter');
  });

  it('narrows the list as the user types', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(
      screen.getByRole('searchbox', { name: 'Search the directory' }),
      'morena',
    );

    expect(entries()).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('1 shown');
  });

  it('says when nothing matches', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(
      screen.getByRole('searchbox', { name: 'Search the directory' }),
      'zzz',
    );

    expect(
      screen.getByText('No entry matches. Change the search or the filters.'),
    ).toBeInTheDocument();
  });

  it('carries the chosen patient into the letter links', async () => {
    renderPage('/referrals?patient=patient-1');

    expect(
      await screen.findByText(
        'Referring Brijesh Mishra (ABC200042). Choose who to refer to, then write the letter.',
      ),
    ).toBeInTheDocument();
    expect(
      within(entries()[0]).getByRole('link', { name: 'Write referral letter' }),
    ).toHaveAttribute(
      'href',
      '/referrals/example-cardiologist-gwalior/letter?patient=patient-1',
    );
  });

  it('shows the empty and failed states', () => {
    mockLoadDirectory.mockReturnValue({ ok: true, entries: [] });
    const { unmount } = renderPage();
    expect(
      screen.getByText('The directory has no verified entries yet.'),
    ).toBeInTheDocument();
    unmount();

    mockLoadDirectory.mockReturnValue({ ok: false, errors: ['bad'] });
    renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The directory could not be shown because an entry failed its checks.',
    );
  });
});
