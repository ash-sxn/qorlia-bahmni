import {
  getFormattedAllergies,
  getFormattedPatientById,
} from '@bahmni/services';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DictationPage } from '../DictationPage';

jest.mock('../../HomePageHeader', () => ({
  HomePageHeader: () => <div data-testid="home-page-header" />,
}));

jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  getFormattedPatientById: jest.fn(),
  getFormattedAllergies: jest.fn(),
}));

const SAID =
  'metformin 500 subah shaam continue, glimepiride 1 mg naashte se pehle, ek mahine ke liye. telmisartan 40 raat ko.';
const TIDIED =
  'Dx: Diabetes mellitus\nRx\nMetformin 500 mg 1-0-1 x 1 month\nGlimepiride 1 mg before food x 1 month\nTelmisartan 40 mg HS\nUnclear: pichli baar wali dawai';

const reply = (status: number, body?: unknown) =>
  Promise.resolve({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  } as Response);

let tidyConsented: boolean;
let fetchMock: jest.Mock;

const config = (tidy = true) => ({
  enabled: true,
  consentVersion: 'v1',
  consented: true,
  tidy,
  tidyConsented,
  tidyService: {
    name: 'Sarvam AI',
    country: 'India',
    policyUrl: 'https://example.test/privacy',
  },
  service: {
    name: 'Sarvam AI',
    country: 'India',
    policyUrl: null,
    outside: true,
  },
  languages: [{ code: 'en-IN', label: 'English' }],
});

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/dictation?patient=patient-1']}>
        <DictationPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  tidyConsented = false;
  (getFormattedPatientById as jest.Mock).mockResolvedValue({
    fullName: 'Test Patient',
    identifier: 'ABC1',
    gender: 'F',
    birthDate: '1970-01-01',
  });
  (getFormattedAllergies as jest.Mock).mockResolvedValue([]);
  fetchMock = jest.fn((url: string) => {
    if (url === '/openmrs/qorlia-voice/config') return reply(200, config());
    if (url === '/openmrs/qorlia-voice/consent') {
      tidyConsented = true;
      return reply(204);
    }
    if (url === '/openmrs/qorlia-voice/tidy') {
      return reply(200, { text: TIDIED });
    }
    return reply(404, { error: 'not_found' });
  });
  global.fetch = fetchMock;
});

describe('Tidy with AI on the dictation page', () => {
  it('asks first, sends only the dictation, and marks what was not said', async () => {
    const user = userEvent.setup();
    renderPage();
    const box = await screen.findByLabelText('Dictation');
    await user.click(box);
    await user.paste(SAID);

    await user.click(
      await screen.findByRole('button', { name: 'Tidy with AI (Sarvam AI)' }),
    );
    expect(
      screen.getByText(/the text in the dictation box is sent to Sarvam AI/),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/tidy'))).toBe(
      false,
    );
    await user.click(
      screen.getByLabelText(
        'I have read this and agree to send the dictation text to be tidied.',
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Agree and tidy' }));

    const kept = TIDIED.replace('\nUnclear: pichli baar wali dawai', '');
    await waitFor(() => expect(box).toHaveValue(kept));
    expect(
      screen.getByText(
        'The AI could not understand these parts. Add them yourself if needed:',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('pichli baar wali dawai')).toBeInTheDocument();
    const consent = fetchMock.mock.calls.find(([url]) =>
      url.endsWith('/consent'),
    );
    expect(JSON.parse(consent[1].body)).toMatchObject({ scope: 'tidy' });
    const tidy = fetchMock.mock.calls.find(([url]) => url.endsWith('/tidy'));
    expect(JSON.parse(tidy[1].body)).toEqual({ text: SAID });

    const note = within(
      screen.getByRole('article', { name: 'OPD note and prescription' }),
    );
    const rows = note.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Not in what you said: how long');
    expect(rows[1]).not.toHaveTextContent('Not in what you said');
    expect(rows[2]).not.toHaveTextContent('Not in what you said');
    expect(screen.getByText(/you did not name it/)).toBeInTheDocument();
    expect(screen.getByText(SAID)).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Undo: go back to what you said' }),
    );
    expect(box).toHaveValue(SAID);
    expect(screen.queryByText(/Not in what you said/)).not.toBeInTheDocument();
  });

  it('does not offer tidying where the server has it switched off', async () => {
    fetchMock.mockImplementation((url: string) =>
      url === '/openmrs/qorlia-voice/config'
        ? reply(200, config(false))
        : reply(404, { error: 'not_found' }),
    );
    renderPage();
    await screen.findByRole('button', { name: 'Dictate by voice' });
    expect(
      screen.queryByRole('button', { name: /Tidy with AI/ }),
    ).not.toBeInTheDocument();
  });
});
