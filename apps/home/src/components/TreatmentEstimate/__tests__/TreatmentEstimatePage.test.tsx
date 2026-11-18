import { getFormattedPatientById, getPatientDiagnoses } from '@bahmni/services';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TreatmentEstimatePage } from '../TreatmentEstimatePage';

// The patient banner asks for visits; these pages do not depend on them.
jest.mock('../../PatientRecord/recordService', () => ({
  getPatientVisits: jest.fn().mockResolvedValue([]),
}));

jest.mock('@bahmni/services', () => ({
  ...jest.requireActual('@bahmni/services'),
  getFormattedPatientById: jest.fn(),
  getPatientDiagnoses: jest.fn(),
}));

const mockPatient = getFormattedPatientById as jest.Mock;
const mockDiagnoses = getPatientDiagnoses as jest.Mock;

const renderPage = (url = '/estimate?patient=patient-1') =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[url]}>
        <TreatmentEstimatePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const estimate = async () =>
  within(
    await screen.findByRole('article', {
      name: 'Treatment plan and cost estimate',
    }),
  );

describe('TreatmentEstimatePage', () => {
  beforeEach(() => {
    mockPatient.mockReset();
    mockPatient.mockResolvedValue({
      fullName: 'Mahesh Kushwah',
      identifier: 'ABC200036',
      gender: 'M',
      birthDate: '1971-01-01',
    });
    mockDiagnoses.mockResolvedValue([
      { id: 'd1', display: 'Gallstones', recordedDate: '2026-11-13' },
    ]);
  });

  it('names the patient, says it is an estimate and that nothing is saved', async () => {
    renderPage();

    const page = await estimate();
    expect(page.getByText('Mahesh Kushwah')).toBeInTheDocument();
    expect(
      await screen.findByText('Diagnoses on record: Gallstones'),
    ).toBeInTheDocument();
    expect(
      page.getByText(
        /This is an estimate based on the treatment planned today, not a bill\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/This estimate is not saved in Bahmni\./),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to the chart' }),
    ).toHaveAttribute('href', '/home/records/patient-1');
  });

  it('asks for passport details only for an international patient', async () => {
    const user = userEvent.setup();
    renderPage();

    const page = await estimate();
    expect(screen.queryByLabelText('Passport number')).not.toBeInTheDocument();
    expect(page.queryByText('Nationality')).not.toBeInTheDocument();

    await user.click(
      screen.getByLabelText(
        'International patient: add passport details for the visa papers',
      ),
    );
    await user.type(screen.getByLabelText('Passport number'), 'X0000000');

    expect(screen.getByLabelText('Nationality')).toBeInTheDocument();
    expect(page.getByText('X0000000')).toBeInTheDocument();
  });

  it('adds up the cost and prints the plan that was typed', async () => {
    const user = userEvent.setup();
    const print = jest.spyOn(window, 'print').mockImplementation(() => {});
    renderPage();

    const page = await estimate();
    await user.type(
      screen.getByLabelText('Proposed treatment plan'),
      'Laparoscopic cholecystectomy',
    );
    await user.type(
      screen.getByLabelText('Operation theatre charges'),
      '35,000',
    );
    await user.type(screen.getByLabelText('Room rent and nursing'), '6000');
    await user.click(screen.getByRole('button', { name: 'Print estimate' }));

    expect(
      screen.getByRole('status', { name: 'Total estimate' }),
    ).toHaveTextContent('₹41,000');
    expect(page.getByText('Laparoscopic cholecystectomy')).toBeInTheDocument();
    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
  });

  it('blocks printing while an amount is not whole rupees', async () => {
    const user = userEvent.setup();
    renderPage();

    await estimate();
    await user.type(screen.getByLabelText('ICU charges'), 'about 5000');

    expect(
      screen.getByRole('button', { name: 'Print estimate' }),
    ).toBeDisabled();
  });

  it('asks for a patient when none was chosen, and reports a patient that cannot be loaded', async () => {
    const { unmount } = renderPage('/estimate');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Choose the patient first',
    );
    expect(
      screen.getByRole('link', { name: 'Find a patient' }),
    ).toHaveAttribute('href', '/home/records');
    expect(mockPatient).not.toHaveBeenCalled();
    unmount();

    mockPatient.mockRejectedValue(new Error('404'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This patient could not be loaded.',
    );
  });
});
