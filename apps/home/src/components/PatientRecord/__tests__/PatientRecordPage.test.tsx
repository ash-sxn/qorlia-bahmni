import {
  getFormattedAllergies,
  getFormattedPatientById,
  getPatientDiagnoses,
  getPatientMedications,
} from '@bahmni/services';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { PatientRecordPage } from '../PatientRecordPage';
import {
  getPatientLabResults,
  getPatientNotes,
  getPatientVisits,
} from '../recordService';

jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  getFormattedPatientById: jest.fn(),
  getPatientDiagnoses: jest.fn(),
  getPatientMedications: jest.fn(),
  getFormattedAllergies: jest.fn(),
}));

jest.mock('../recordService', () => ({
  getPatientVisits: jest.fn(),
  getPatientLabResults: jest.fn(),
  getPatientNotes: jest.fn(),
}));

const mockPatient = getFormattedPatientById as jest.Mock;
const mockDiagnoses = getPatientDiagnoses as jest.Mock;
const mockMedicines = getPatientMedications as jest.Mock;
const mockAllergies = getFormattedAllergies as jest.Mock;
const mockVisits = getPatientVisits as jest.Mock;
const mockLabs = getPatientLabResults as jest.Mock;
const mockNotes = getPatientNotes as jest.Mock;

const Elsewhere = () => {
  const location = useLocation();
  return <p>{`Opened ${location.pathname}${location.search}`}</p>;
};

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/records/patient-1']}>
        <Routes>
          <Route path="/records/:patientUuid" element={<PatientRecordPage />} />
          <Route path="*" element={<Elsewhere />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

const visit = (
  uuid: string,
  start: string,
  stop: string | null,
  type = 'OPD',
) => ({
  uuid,
  startDatetime: start,
  stopDatetime: stop,
  visitType: { display: type },
  location: { display: 'OPD-1' },
});

const history = () => within(screen.getByRole('region', { name: 'History' }));

describe('PatientRecordPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPatient.mockResolvedValue({
      fullName: 'Brijesh Mishra',
      identifier: 'ABC200042',
      gender: 'M',
      birthDate: '1980-01-01',
    });
    mockVisits.mockResolvedValue([
      visit('open', '2026-11-13T04:00:00.000Z', null),
      visit(
        'old',
        '2026-10-01T04:00:00.000Z',
        '2026-10-01T10:00:00.000Z',
        'IPD',
      ),
    ]);
    mockNotes.mockResolvedValue([]);
    mockDiagnoses.mockResolvedValue([
      {
        id: 'd1',
        display: 'Hypertension',
        certainty: { display: 'Confirmed' },
        recordedDate: '2026-11-13T06:30:00.000Z',
        recorder: 'Dr. Neha Anand',
      },
    ]);
    mockMedicines.mockResolvedValue([
      {
        id: 'm1',
        name: 'Amlodipine 5 mg',
        frequency: 'Once a day',
        status: 'active',
        orderDate: '2026-11-13T06:40:00.000Z',
        startDate: '2026-11-13T06:40:00.000Z',
        orderedBy: '',
      },
      {
        id: 'm2',
        name: 'Paracetamol 650 mg',
        status: 'completed',
        orderDate: '2026-10-01T06:40:00.000Z',
        startDate: '2026-10-01T06:40:00.000Z',
        orderedBy: '',
      },
    ]);
    mockLabs.mockResolvedValue([
      {
        testName: 'Haemoglobin',
        result: '9.5',
        testUnitOfMeasurement: 'g/dL',
        abnormal: true,
        resultDateTime: '2026-10-01T06:00:00.000Z',
      },
    ]);
    mockAllergies.mockResolvedValue([
      { id: 'a1', display: 'Penicillin', status: 'Active' },
      { id: 'a2', display: 'Dust', status: 'Inactive' },
    ]);
  });

  it('shows who the patient is, their active allergies and the open visit', async () => {
    renderPage();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Brijesh Mishra' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/\d+ years, M · ABC200042/)).toBeInTheDocument();
    expect(
      await screen.findByText('Allergies: Penicillin'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Dust/)).not.toBeInTheDocument();
    expect(screen.getByText(/^OPD visit open since/)).toBeInTheDocument();
  });

  it('makes starting a consultation the main action', async () => {
    renderPage();

    const starts = await screen.findAllByRole('link', {
      name: 'Start consultation',
    });
    for (const link of starts) {
      expect(link).toHaveAttribute('href', '/home/dictation?patient=patient-1');
    }
  });

  it('opens a document for the patient from one menu', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole('button', { name: 'Create a document' }),
    );
    expect(
      screen.getByRole('menuitem', { name: 'Insurance pre-authorisation' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Treatment cost estimate' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Referral letter' }));

    expect(
      await screen.findByText('Opened /home/referrals?patient=patient-1'),
    ).toBeInTheDocument();
  });

  it('sums up diagnoses, current medicines and recent lab results', async () => {
    renderPage();

    const glance = within(
      await screen.findByRole('complementary', { name: 'At a glance' }),
    );
    expect(await glance.findByText('Hypertension')).toBeInTheDocument();
    expect(glance.getByText('Amlodipine 5 mg')).toBeInTheDocument();
    expect(glance.queryByText('Paracetamol 650 mg')).not.toBeInTheDocument();
    expect(glance.getByText('Haemoglobin')).toBeInTheDocument();
    expect(glance.getByText('Abnormal')).toBeInTheDocument();
  });

  it('groups the history by visit, newest first, and asks for a note in the open visit', async () => {
    renderPage();

    await screen.findByRole('heading', { level: 3, name: /OPD/ });
    const visits = history().getAllByRole('heading', { level: 3 });
    expect(visits[0]).toHaveTextContent('OPD');
    expect(visits[1]).toHaveTextContent('IPD');
    expect(history().getByText('Visit open')).toBeInTheDocument();
    expect(
      history().getByText('No consultation note yet for this visit.'),
    ).toBeInTheDocument();
    expect(history().getByText('Outside normal range')).toBeInTheDocument();
    expect(history().getByText('9.5 g/dL')).toBeInTheDocument();
  });

  it('shows saved consultation notes in their visit', async () => {
    mockNotes.mockResolvedValue([
      {
        uuid: 'n1',
        value: 'Complaints: fever\n\nDiagnosis: Viral fever',
        obsDatetime: '2026-11-13T05:00:00.000Z',
        encounter: {
          visit: { startDatetime: '2026-11-13T04:00:00.000Z' },
          encounterProviders: [
            { provider: { display: 'doctor - Neha Anand' } },
          ],
        },
      },
    ]);
    renderPage();

    await screen.findByRole('region', { name: 'History' });
    expect(await history().findByText(/Complaints: fever/)).toBeInTheDocument();
    expect(history().getByText('By Neha Anand')).toBeInTheDocument();
    expect(
      history().queryByText('No consultation note yet for this visit.'),
    ).not.toBeInTheDocument();
  });

  it('shows one kind of entry at a time', async () => {
    const user = userEvent.setup();
    renderPage();

    const filters = within(
      await screen.findByRole('group', { name: 'Show in the record' }),
    );
    await history().findByText('Amlodipine 5 mg');
    await user.click(filters.getByRole('button', { name: /^Medicines/ }));

    expect(filters.getByRole('button', { name: /^Medicines/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(history().getByText('Amlodipine 5 mg')).toBeInTheDocument();
    expect(history().queryByText('Hypertension')).not.toBeInTheDocument();
  });

  it('folds older visits away on screen', async () => {
    const user = userEvent.setup();
    mockVisits.mockResolvedValue(
      Array.from({ length: 6 }, (_, index) =>
        visit(
          `v${index}`,
          `2026-0${index + 1}-01T04:00:00.000Z`,
          `2026-0${index + 1}-01T08:00:00.000Z`,
        ),
      ),
    );
    mockMedicines.mockResolvedValue([]);
    mockLabs.mockResolvedValue([]);
    mockDiagnoses.mockResolvedValue(
      Array.from({ length: 6 }, (_, index) => ({
        id: `d${index}`,
        display: `Diagnosis ${index}`,
        certainty: { display: 'Confirmed' },
        recordedDate: `2026-0${index + 1}-01T05:00:00.000Z`,
        recorder: 'Dr. Neha Anand',
      })),
    );
    renderPage();

    await screen.findAllByText('Diagnosis 5');
    await user.click(
      await screen.findByRole('button', { name: 'Show 2 older visits' }),
    );
    expect(
      screen.getByRole('button', { name: 'Show recent visits only' }),
    ).toBeInTheDocument();
  });

  it('prints the record', async () => {
    const user = userEvent.setup();
    const print = jest.spyOn(window, 'print').mockImplementation(() => {});
    renderPage();

    await user.click(
      await screen.findByRole('button', { name: 'Print the record' }),
    );

    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
  });

  it('still shows the rest of the record when one source fails', async () => {
    mockMedicines.mockRejectedValue(new Error('500'));
    mockAllergies.mockRejectedValue(new Error('500'));
    renderPage();

    expect(
      await screen.findByText(
        'Medicines could not be loaded. The rest of the record is shown.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Allergies could not be loaded\./),
    ).toBeInTheDocument();
    expect(history().getByText('Hypertension')).toBeInTheDocument();
    expect(history().getByText('Haemoglobin')).toBeInTheDocument();
  });

  it('says so when nothing is recorded yet', async () => {
    mockVisits.mockResolvedValue([]);
    mockDiagnoses.mockResolvedValue([]);
    mockMedicines.mockResolvedValue([]);
    mockLabs.mockResolvedValue([]);
    mockAllergies.mockResolvedValue([]);
    renderPage();

    expect(
      await screen.findByText(
        'Nothing has been recorded for this patient yet.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('No allergies recorded')).toBeInTheDocument();
  });

  it('shows an error and a way back when the patient cannot be loaded', async () => {
    mockPatient.mockRejectedValue(new Error('404'));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This patient could not be loaded.',
    );
    expect(
      screen.getByRole('link', { name: 'Find another patient' }),
    ).toHaveAttribute('href', '/home/records');
  });
});
