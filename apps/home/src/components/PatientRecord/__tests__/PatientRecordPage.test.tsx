import {
  getFormattedAllergies,
  getFormattedPatientById,
  getPatientDiagnoses,
  getPatientMedications,
} from '@bahmni/services';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PatientRecordPage } from '../PatientRecordPage';
import { getPatientLabResults, getPatientVisits } from '../recordService';

jest.mock('../../HomePageHeader', () => ({
  HomePageHeader: () => <div data-testid="home-page-header" />,
}));

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
}));

const mockPatient = getFormattedPatientById as jest.Mock;
const mockDiagnoses = getPatientDiagnoses as jest.Mock;
const mockMedicines = getPatientMedications as jest.Mock;
const mockAllergies = getFormattedAllergies as jest.Mock;
const mockVisits = getPatientVisits as jest.Mock;
const mockLabs = getPatientLabResults as jest.Mock;

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/records/patient-1']}>
        <Routes>
          <Route path="/records/:patientUuid" element={<PatientRecordPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('PatientRecordPage', () => {
  beforeEach(() => {
    mockPatient.mockResolvedValue({
      fullName: 'Brijesh Mishra',
      identifier: 'ABC200042',
      gender: 'M',
      birthDate: '1980-01-01',
    });
    mockVisits.mockResolvedValue([
      {
        uuid: 'open',
        startDatetime: '2026-11-13T04:00:00.000Z',
        stopDatetime: null,
        visitType: { display: 'OPD' },
        location: { display: 'OPD-1' },
      },
      {
        uuid: 'old',
        startDatetime: '2026-10-01T04:00:00.000Z',
        stopDatetime: '2026-10-01T10:00:00.000Z',
        visitType: { display: 'IPD' },
        location: null,
      },
    ]);
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
        orderDate: '2026-11-13T06:40:00.000Z',
        startDate: '2026-11-13T06:40:00.000Z',
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

  it('shows who the patient is, their active allergies and the totals', async () => {
    renderPage();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Brijesh Mishra' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/ABC200042 · M · \d+ years/)).toBeInTheDocument();
    expect(await screen.findByText(/Penicillin/)).toBeInTheDocument();
    expect(screen.queryByText(/Dust/)).not.toBeInTheDocument();
    expect(
      await screen.findByText(
        '2 visits, 1 diagnoses, 1 medicines, 1 lab results',
      ),
    ).toBeInTheDocument();
    expect(mockVisits).toHaveBeenCalledWith('patient-1');
  });

  it('groups the history by visit, newest first, and marks the open visit and abnormal results', async () => {
    renderPage();

    const visits = await screen.findAllByRole('region');
    expect(visits).toHaveLength(2);

    const open = within(visits[0]);
    expect(open.getByRole('heading', { level: 2 })).toHaveTextContent(
      /OPD · OPD-1/,
    );
    expect(open.getByText('Open visit')).toBeInTheDocument();
    expect(open.getByText('Hypertension')).toBeInTheDocument();
    expect(open.getByText('Confirmed, Dr. Neha Anand')).toBeInTheDocument();
    expect(open.getByText('Amlodipine 5 mg')).toBeInTheDocument();

    const old = within(visits[1]);
    expect(old.getByRole('heading', { level: 2 })).toHaveTextContent(/IPD/);
    expect(old.getByText('Haemoglobin')).toBeInTheDocument();
    expect(old.getByText('9.5 g/dL')).toBeInTheDocument();
    expect(old.getByText('Outside normal range')).toBeInTheDocument();
  });

  it('hides a kind when its filter is switched off', async () => {
    const user = userEvent.setup();
    renderPage();

    const filters = within(
      await screen.findByRole('group', { name: 'Show in the record' }),
    );
    const medicine = filters.getByRole('button', { name: 'Medicine' });
    expect(medicine).toHaveAttribute('aria-pressed', 'true');

    await user.click(medicine);

    expect(medicine).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText('Amlodipine 5 mg')).not.toBeInTheDocument();
    expect(screen.getByText('Hypertension')).toBeInTheDocument();
  });

  it('prints the record', async () => {
    const user = userEvent.setup();
    const print = jest.spyOn(window, 'print').mockImplementation(() => {});
    renderPage();

    await user.click(
      await screen.findByRole('button', { name: 'Print record' }),
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
    expect(screen.getByText('Hypertension')).toBeInTheDocument();
    expect(screen.getByText('Haemoglobin')).toBeInTheDocument();
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
    expect(screen.getByText(/None recorded/)).toBeInTheDocument();
  });

  it('shows an error and a way back when the patient cannot be loaded', async () => {
    mockPatient.mockRejectedValue(new Error('404'));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This patient could not be loaded.',
    );
    expect(
      screen.getByRole('link', { name: 'Find another patient' }),
    ).toHaveAttribute('href', '/records');
  });
});
