import { getFormattedPatientById, getPatientDiagnoses } from '@bahmni/services';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PreauthWorksheetPage } from '../PreauthWorksheetPage';

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

const renderPage = (url = '/preauthorisation?patient=patient-1') =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[url]}>
        <PreauthWorksheetPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const worksheet = async () =>
  within(
    await screen.findByRole('article', { name: 'Pre-authorisation worksheet' }),
  );

describe('PreauthWorksheetPage', () => {
  beforeEach(() => {
    mockPatient.mockReset();
    mockPatient.mockResolvedValue({
      fullName: 'Mahesh Kushwah',
      identifier: 'ABC200036',
      gender: 'M',
      birthDate: '1971-01-01',
    });
    mockDiagnoses.mockResolvedValue([
      { id: 'd1', display: 'Acute appendicitis', recordedDate: '2026-11-13' },
      { id: 'd2', display: 'Acute appendicitis', recordedDate: '2026-11-14' },
    ]);
  });

  it('starts from the patient and says nothing is saved or sent', async () => {
    renderPage();

    const page = await worksheet();
    expect(page.getByText('Mahesh Kushwah')).toBeInTheDocument();
    expect(page.getByText(/ABC200036 · M · \d+ years/)).toBeInTheDocument();
    expect(
      screen.getByText(
        /This worksheet is not saved and is not sent to any insurer or TPA\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to the chart' }),
    ).toHaveAttribute('href', '/home/records/patient-1');
  });

  it('suggests the diagnoses on record, each once, without filling the box', async () => {
    renderPage();

    await worksheet();
    expect(
      await screen.findByText('Diagnoses on record: Acute appendicitis'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Provisional diagnosis')).toHaveValue('');
  });

  it('adds up the estimate as amounts are typed', async () => {
    const user = userEvent.setup();
    renderPage();

    await worksheet();
    const total = screen.getByRole('status', { name: 'Total estimate' });
    expect(total).toHaveTextContent('₹0');

    await user.type(screen.getByLabelText('Room rent and nursing'), '12,000');
    await user.type(
      screen.getByLabelText('Operation theatre charges'),
      '30000',
    );

    expect(total).toHaveTextContent('₹42,000');
  });

  it('blocks printing while an amount is not whole rupees', async () => {
    const user = userEvent.setup();
    renderPage();

    await worksheet();
    await user.type(screen.getByLabelText('ICU charges'), '45.50');

    expect(
      screen.getByRole('status', { name: 'Total estimate' }),
    ).toHaveTextContent('Correct the amounts above');
    expect(screen.getAllByText('Whole rupees only')).not.toHaveLength(0);
    expect(
      screen.getByRole('button', { name: 'Print worksheet' }),
    ).toBeDisabled();
  });

  it('prints what was typed and which papers are attached', async () => {
    const user = userEvent.setup();
    const print = jest.spyOn(window, 'print').mockImplementation(() => {});
    renderPage();

    const page = await worksheet();
    await user.type(screen.getByLabelText('Insurer or TPA'), 'Example TPA');
    await user.type(screen.getByLabelText('Date of admission'), '2026-11-13');
    await user.click(screen.getByLabelText('Health card or policy copy'));
    await user.click(screen.getByRole('button', { name: 'Print worksheet' }));

    expect(page.getByText('Example TPA')).toBeInTheDocument();
    // Whatever the machine's date format, the sheet shows the date as people write it.
    expect(
      page.getByText(
        new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(
          new Date('2026-11-13T12:00:00'),
        ),
      ),
    ).toBeInTheDocument();
    expect(
      page.getByText(/\[x\]\s+Health card or policy copy/),
    ).toBeInTheDocument();
    expect(page.getByText(/\[ \]\s+Investigation reports/)).toBeInTheDocument();
    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
  });

  it('asks for a patient when none was chosen', () => {
    renderPage('/preauthorisation');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Choose the patient first',
    );
    expect(
      screen.getByRole('link', { name: 'Find a patient' }),
    ).toHaveAttribute('href', '/home/records');
    expect(mockPatient).not.toHaveBeenCalled();
  });

  it('shows an error when the patient cannot be loaded', async () => {
    mockPatient.mockRejectedValue(new Error('404'));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This patient could not be loaded.',
    );
  });

  it('follows IRDAI Part C: codes, line of treatment and admission type', async () => {
    const user = userEvent.setup();
    renderPage();

    const page = await worksheet();
    await user.type(
      screen.getByLabelText('Hospital Rohini ID'),
      'SYN-ROHINI-1',
    );
    await user.type(
      screen.getByLabelText('ICD-10 code for the diagnosis'),
      'K35.8',
    );
    await user.click(screen.getByLabelText('Surgical management'));
    await user.click(screen.getByLabelText('Emergency'));
    await user.type(screen.getByLabelText('Days in ICU'), '1');

    expect(page.getByText('SYN-ROHINI-1')).toBeInTheDocument();
    expect(page.getByText('K35.8')).toBeInTheDocument();
    expect(page.getByText('Surgical management')).toBeInTheDocument();
    expect(page.getByText('Emergency')).toBeInTheDocument();
  });

  it('asks for injury and maternity details only when they apply', async () => {
    const user = userEvent.setup();
    renderPage();

    const page = await worksheet();
    expect(screen.queryByLabelText('How the injury happened')).toBeNull();
    expect(screen.queryByLabelText('Expected date of delivery')).toBeNull();

    await user.click(screen.getByLabelText('This is an injury or accident'));
    await user.click(screen.getByLabelText('Road traffic accident'));
    await user.type(
      screen.getByLabelText('How the injury happened'),
      'Fell from a bike',
    );
    await user.click(
      screen.getByLabelText('This is a delivery or maternity case'),
    );

    expect(page.getByText('Fell from a bike')).toBeInTheDocument();
    expect(
      within(
        page
          .getByRole('heading', { name: 'Injury details' })
          .closest('section') as HTMLElement,
      ).getByText('Yes'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Expected date of delivery'),
    ).toBeInTheDocument();
  });

  it('prints the chronic illness history Part C asks for', async () => {
    const user = userEvent.setup();
    renderPage();

    const page = await worksheet();
    expect(page.getByText('None declared')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Diabetes'));
    await user.type(screen.getByLabelText('Since when (Diabetes)'), '03/2021');

    expect(page.queryByText('None declared')).toBeNull();
    expect(page.getByText('since 03/2021')).toBeInTheDocument();
  });
});
