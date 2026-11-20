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
import { syntheticReferrals } from '../__fixtures__/syntheticReferrals';
import { loadDirectory } from '../referralDirectory';
import { ReferralLetterPage } from '../ReferralLetterPage';

jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  getFormattedPatientById: jest.fn(),
  getPatientDiagnoses: jest.fn(),
  getPatientMedications: jest.fn(),
  getFormattedAllergies: jest.fn(),
}));

jest.mock('../referralDirectory', () => ({
  loadDirectory: jest.fn(),
}));

const mockPatient = getFormattedPatientById as jest.Mock;
const mockDiagnoses = getPatientDiagnoses as jest.Mock;
const mockMedicines = getPatientMedications as jest.Mock;
const mockAllergies = getFormattedAllergies as jest.Mock;

const renderPage = (
  url = '/referrals/example-cardiologist-gwalior/letter?patient=patient-1',
) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="/referrals/:entryId/letter"
            element={<ReferralLetterPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

const letter = async () =>
  within(await screen.findByRole('article', { name: 'Referral letter' }));

describe('ReferralLetterPage', () => {
  beforeEach(() => {
    mockPatient.mockClear();
    (loadDirectory as jest.Mock).mockReturnValue({
      ok: true,
      entries: syntheticReferrals,
    });
    mockPatient.mockResolvedValue({
      fullName: 'Brijesh Mishra',
      identifier: 'ABC200042',
      gender: 'M',
      birthDate: '1980-01-01',
    });
    mockDiagnoses.mockResolvedValue([
      { id: 'd1', display: 'Old fever', recordedDate: '2026-01-01T06:00:00Z' },
      {
        id: 'd2',
        display: 'Hypertension',
        recordedDate: '2026-11-13T06:00:00Z',
      },
    ]);
    mockMedicines.mockResolvedValue([
      {
        id: 'm1',
        name: 'Amlodipine 5 mg',
        frequency: 'Once a day',
        orderDate: '2026-11-13T06:40:00Z',
      },
    ]);
    mockAllergies.mockResolvedValue([
      { id: 'a1', display: 'Penicillin', status: 'Active' },
      { id: 'a2', display: 'Dust', status: 'Inactive' },
    ]);
  });

  it('addresses the letter to the chosen entry and names the patient', async () => {
    renderPage();

    const page = await letter();
    expect(
      page.getByText('Dr. Example Cardiologist (synthetic)'),
    ).toBeInTheDocument();
    expect(
      page.getByText(/Cardiology, Example Heart Centre \(synthetic\), Gwalior/),
    ).toBeInTheDocument();
    expect(page.getByText('Brijesh Mishra')).toBeInTheDocument();
    expect(page.getByText(/ABC200042 · M · \d+ years/)).toBeInTheDocument();
    expect(mockPatient).toHaveBeenCalledWith('patient-1');
  });

  it('fills in recent diagnoses newest first, medicines and active allergies', async () => {
    renderPage();

    const page = await letter();
    const diagnoses = await page.findAllByText(/Hypertension|Old fever/);
    expect(diagnoses.map((item) => item.textContent)).toEqual([
      'Hypertension',
      'Old fever',
    ]);
    expect(page.getByText('Amlodipine 5 mg, Once a day')).toBeInTheDocument();
    expect(page.getByText('Penicillin')).toBeInTheDocument();
    expect(page.queryByText('Dust')).not.toBeInTheDocument();
  });

  it('prints what the doctor typed and says the letter is not saved', async () => {
    const user = userEvent.setup();
    const print = jest.spyOn(window, 'print').mockImplementation(() => {});
    renderPage();

    await user.type(
      await screen.findByLabelText(
        'What you want the specialist to assess or do',
      ),
      'Chest pain on exertion',
    );
    await user.type(
      screen.getByLabelText("Referring doctor's name and registration number"),
      'Dr. Neha Anand',
    );
    await user.click(screen.getByRole('button', { name: 'Print letter' }));

    const page = await letter();
    expect(page.getAllByText('Chest pain on exertion')).not.toHaveLength(0);
    expect(page.getByText('Dr. Neha Anand')).toBeInTheDocument();
    expect(
      screen.getByText(/This letter is not saved in Bahmni\./),
    ).toBeInTheDocument();
    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
  });

  it('says what to do when part of the record cannot be loaded, or is empty', async () => {
    mockMedicines.mockRejectedValue(new Error('500'));
    mockAllergies.mockResolvedValue([]);
    renderPage();

    const page = await letter();
    expect(
      await page.findByText(
        'This could not be loaded. Write it by hand on the printed letter.',
      ),
    ).toBeInTheDocument();
    expect(await page.findByText('None recorded')).toBeInTheDocument();
  });

  it('asks for a patient when none was chosen', () => {
    renderPage('/referrals/example-cardiologist-gwalior/letter');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Choose the patient first',
    );
    expect(
      screen.getByRole('link', { name: 'Find a patient' }),
    ).toHaveAttribute('href', '/home/records');
    expect(mockPatient).not.toHaveBeenCalled();
  });

  it('shows an error for an entry that is not in the directory', () => {
    renderPage('/referrals/removed-entry/letter?patient=patient-1');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'This directory entry was not found.',
    );
    expect(
      screen.getByRole('link', { name: 'Back to the referral directory' }),
    ).toHaveAttribute('href', '/home/referrals?patient=patient-1');
  });
});
