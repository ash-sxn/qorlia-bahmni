import {
  getFormattedAllergies,
  getFormattedPatientById,
} from '@bahmni/services';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
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

const mockPatient = getFormattedPatientById as jest.Mock;
const mockAllergies = getFormattedAllergies as jest.Mock;

const renderPage = (url = '/dictation?patient=patient-1') =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[url]}>
        <DictationPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const dictate = async (text: string) => {
  const user = userEvent.setup();
  const box = await screen.findByLabelText('Dictation');
  await user.click(box);
  await user.paste(text);
  await user.click(screen.getByRole('button', { name: 'Make draft' }));
  return user;
};

const note = () =>
  within(screen.getByRole('article', { name: 'OPD note and prescription' }));

describe('DictationPage', () => {
  beforeEach(() => {
    mockPatient.mockReset();
    mockPatient.mockResolvedValue({
      fullName: 'Brijesh Mishra',
      identifier: 'ABC200042',
      gender: 'M',
      birthDate: '1980-01-01',
    });
    mockAllergies.mockResolvedValue([
      { id: 'a1', display: 'Amoxicillin', status: 'Active' },
    ]);
  });

  it('says the draft stays on this computer and is not saved', async () => {
    renderPage();

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Dictate note and prescription',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Nothing is saved in Bahmni\. Typed text is not sent anywhere/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Make draft' })).toBeDisabled();
  });

  it('drafts the note and the prescription from the example', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole('button', { name: 'Show an example' }),
    );
    await user.click(screen.getByRole('button', { name: 'Make draft' }));

    expect(note().getByText('Brijesh Mishra')).toBeInTheDocument();
    expect(note().getByLabelText('Diagnosis')).toHaveValue(
      'Acute viral fever with pharyngitis',
    );
    const rows = note().getAllByRole('row').slice(1);
    expect(rows).toHaveLength(4);
    expect(
      within(rows[0]).getByText('Tablet Paracetamol 650 mg'),
    ).toBeInTheDocument();
    expect(
      within(rows[0]).getByText('1-1-1 (morning, afternoon, night)'),
    ).toBeInTheDocument();
    expect(within(rows[0]).getByText('3 days')).toBeInTheDocument();
    expect(within(rows[0]).getByText('After food')).toBeInTheDocument();
    expect(within(rows[3]).getByText('When needed')).toBeInTheDocument();
  });

  it('flags missing parts and a medicine matching a recorded allergy', async () => {
    renderPage();
    await dictate('Rx:\nCap Amoxicillin 500 mg TDS');

    expect(note().getByText('Allergies: Amoxicillin')).toBeInTheDocument();
    expect(
      note().getByText('Recorded allergy: Amoxicillin'),
    ).toBeInTheDocument();
    expect(note().getByText('Check: how long')).toBeInTheDocument();
    expect(
      note().getByText('As typed: Cap Amoxicillin 500 mg TDS'),
    ).toBeInTheDocument();
  });

  it('lists lines under Rx it could not read', async () => {
    renderPage();
    await dictate('Rx:\nTab Paracetamol 650 mg SOS\nx 5 days');

    // Carbon text areas add empty live regions of their own, so find the notice by its text.
    const notice = screen
      .getByText(/could not be read as medicines/)
      .closest('[role="alert"]');
    expect(notice).toHaveTextContent('x 5 days');
  });

  it('lets the doctor correct a section and prints the result', async () => {
    const print = jest.spyOn(window, 'print').mockImplementation(() => {});
    renderPage();
    const user = await dictate('C/o fever\nDx: Viral fever');

    const diagnosis = note().getByLabelText('Diagnosis');
    await user.clear(diagnosis);
    await user.type(diagnosis, 'Dengue fever, to rule out');
    await user.click(
      screen.getByRole('button', { name: 'Print note and prescription' }),
    );

    expect(note().getAllByText('Dengue fever, to rule out')).not.toHaveLength(
      0,
    );
    expect(
      note().getByText('No medicines in the dictation.'),
    ).toBeInTheDocument();
    expect(note().getAllByText('Not in the dictation.')).toHaveLength(2);
    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
  });

  it('asks for a patient when none was chosen', () => {
    renderPage('/dictation');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Choose the patient first',
    );
    expect(
      screen.getByRole('link', { name: 'Find a patient' }),
    ).toHaveAttribute('href', '/home/records');
    expect(mockPatient).not.toHaveBeenCalled();
  });
});
