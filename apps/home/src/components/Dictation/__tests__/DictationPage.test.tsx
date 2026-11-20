import {
  getFormattedAllergies,
  getFormattedPatientById,
} from '@bahmni/services';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DictationPage } from '../DictationPage';
import { saveNoteToRecord, SaveNoteError } from '../saveNote';

jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  getFormattedPatientById: jest.fn(),
  getFormattedAllergies: jest.fn(),
}));

jest.mock('../saveNote', () => ({
  ...jest.requireActual('../saveNote'),
  saveNoteToRecord: jest.fn(),
}));

const mockSave = saveNoteToRecord as jest.Mock;
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
  await user.click(screen.getByRole('button', { name: 'Turn into a note' }));
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

  it('starts with nothing written and says the note is made on this computer', async () => {
    renderPage();

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Dictate note and prescription',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Nothing written yet')).toBeInTheDocument();
    expect(
      screen.getByText(/made on this computer by fixed rules/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Turn into a note' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Save to record' }),
    ).toBeDisabled();
  });

  it('drafts the note and the prescription from the example', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole('button', { name: 'Show an example' }),
    );
    await user.click(screen.getByRole('button', { name: 'Turn into a note' }));

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

  it('saves the checked note to the open visit and updates it after a change', async () => {
    mockSave.mockReset();
    mockSave.mockImplementation(async (_patient, text, previous) => ({
      encounterUuid: 'enc-1',
      observationUuid: 'obs-1',
      visitType: 'OPD',
      text,
      savedAt: new Date(2026, 10, 18, 10, 30),
      previous,
    }));
    renderPage();
    const user = await dictate(
      'C/o fever\nDx: Viral fever\nRx\nTab Paracetamol 650 mg 1-0-1 x 5 days after food',
    );

    await user.click(screen.getByRole('button', { name: 'Save to record' }));

    expect(mockSave).toHaveBeenCalledWith(
      'patient-1',
      [
        'Complaints: fever',
        'Diagnosis: Viral fever',
        'Medicines:\n1. Tablet Paracetamol 650 mg, 1-0-1 (morning, night), 5 days, After food',
      ].join('\n\n'),
      undefined,
    );
    expect(
      await screen.findByText(/^Saved to the record at/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Medicines are saved as lines in the note/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    await user.type(
      note().getByLabelText('Advice, tests and follow-up'),
      'Plenty of fluids',
    );
    expect(
      screen.getByText('Changed since saving, not saved'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(mockSave).toHaveBeenLastCalledWith(
      'patient-1',
      expect.stringContaining('Advice, tests and follow-up: Plenty of fluids'),
      expect.objectContaining({
        encounterUuid: 'enc-1',
        observationUuid: 'obs-1',
      }),
    );
  });

  it('explains why a note was not saved', async () => {
    mockSave.mockReset();
    mockSave.mockRejectedValue(new SaveNoteError('no_visit'));
    renderPage();
    const user = await dictate('C/o fever');

    await user.click(screen.getByRole('button', { name: 'Save to record' }));

    expect(
      await screen.findByText(/this patient has no open visit/),
    ).toHaveAttribute('role', 'alert');
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
