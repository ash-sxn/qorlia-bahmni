import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { syntheticCases } from '../__fixtures__/syntheticCases';
import { loadCases } from '../caseCatalogue';
import { CaseDetailPage } from '../CaseDetailPage';
import { InsuranceCase } from '../types';

jest.mock('../../HomePageHeader', () => ({
  HomePageHeader: () => <div data-testid="home-page-header" />,
}));

jest.mock('../caseCatalogue', () => ({
  loadCases: jest.fn(),
  usesSyntheticCases: true,
}));

const mockLoadCases = loadCases as jest.Mock;

const SETTLED_CASE = 'synthetic-cashless-settled-with-tds';
const SHORT_PAID_CASE = 'synthetic-cashless-short-paid-with-tds';
const REIMBURSEMENT_CASE = 'synthetic-reimbursement-documents-handed-over';

const caseById = (id: string) =>
  syntheticCases.find((candidate) => candidate.id === id)!;

const renderDetail = (caseId: string) =>
  render(
    <MemoryRouter initialEntries={[`/insurance/${caseId}`]}>
      <Routes>
        <Route path="/insurance/:caseId" element={<CaseDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

/** The value shown next to a label in the given section. */
const factIn = (container: HTMLElement, label: string) =>
  within(container).getByText(label).nextElementSibling;

const sectionAfter = (name: string) =>
  screen.getByRole('heading', { level: 2, name })
    .nextElementSibling as HTMLElement;

describe('CaseDetailPage', () => {
  beforeEach(() => {
    mockLoadCases.mockReturnValue({ ok: true, cases: syntheticCases });
  });

  it('shows the patient, the status and who recorded it', () => {
    renderDetail(SETTLED_CASE);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Synthetic patient 0008',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Settled')).toBeInTheDocument();
    expect(
      screen.getByText(/^Recorded by Synthetic desk user, /),
    ).toBeInTheDocument();
  });

  it('says the statuses are not payer confirmed and the data is synthetic', () => {
    renderDetail(SETTLED_CASE);

    expect(
      screen.getByText(
        'Statuses are recorded by desk staff. A payer or TPA has not confirmed them here.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Synthetic cases for development only. Not real patients, policies or claims.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the case details', () => {
    renderDetail(SETTLED_CASE);

    const details = sectionAfter('Case details');
    expect(factIn(details, 'Patient identifier')).toHaveTextContent(
      'SYN-PAT-0008',
    );
    expect(factIn(details, 'Claim route')).toHaveTextContent('Cashless');
    expect(factIn(details, 'Admission type')).toHaveTextContent('Planned');
    expect(factIn(details, 'Payer')).toHaveTextContent('Synthetic Insurer A');
    expect(factIn(details, 'TPA')).toHaveTextContent('Synthetic TPA One');
    expect(factIn(details, 'Policy number')).toHaveTextContent('SYN-POL-0008');
    expect(factIn(details, 'Payer reference')).toHaveTextContent(
      'SYN-AUTH-0008',
    );
    expect(factIn(details, 'Invoice reference')).toHaveTextContent(
      'Not recorded',
    );
  });

  it('says when a payer handles the case without a TPA', () => {
    renderDetail(SHORT_PAID_CASE);

    expect(factIn(sectionAfter('Case details'), 'TPA')).toHaveTextContent(
      'None, handled by the payer',
    );
  });

  it('shows the five amounts separately', () => {
    renderDetail(SETTLED_CASE);

    const amounts = sectionAfter('Amounts');
    expect(factIn(amounts, 'Billed')).toHaveTextContent('₹1,80,000');
    expect(factIn(amounts, 'Claimed')).toHaveTextContent('₹1,80,000');
    expect(factIn(amounts, 'Approved')).toHaveTextContent('₹1,60,000');
    expect(factIn(amounts, 'Patient responsibility')).toHaveTextContent(
      '₹20,000',
    );
    expect(factIn(amounts, 'Received in bank')).toHaveTextContent('₹1,44,000');
  });

  it('shows received, TDS and settled as three separate lines', () => {
    renderDetail(SETTLED_CASE);

    const amounts = sectionAfter('Amounts');
    expect(factIn(amounts, 'Received in bank')).toHaveTextContent('₹1,44,000');
    expect(factIn(amounts, 'TDS deducted')).toHaveTextContent('₹16,000');
    expect(factIn(amounts, 'Settled against approval')).toHaveTextContent(
      '₹1,60,000',
    );
    expect(factIn(amounts, 'Outstanding from payer')).toHaveTextContent('₹0');
  });

  it('shows what is still due on a short-paid case', () => {
    renderDetail(SHORT_PAID_CASE);

    expect(
      factIn(sectionAfter('Amounts'), 'Outstanding from payer'),
    ).toHaveTextContent('₹30,000');
  });

  it('adds up TDS and settled across every payment, with each bank reference', () => {
    const base = caseById(SHORT_PAID_CASE);
    const twoPayments: InsuranceCase = {
      ...base,
      payments: [
        ...base.payments,
        {
          receivedOn: '2026-10-29',
          amount: 2000000,
          taxDeductedAtSource: 200000,
          bankReference: 'SYN-NEFT-0009-B',
        },
      ],
    };
    mockLoadCases.mockReturnValue({ ok: true, cases: [twoPayments] });

    renderDetail(SHORT_PAID_CASE);

    const amounts = sectionAfter('Amounts');
    expect(factIn(amounts, 'TDS deducted')).toHaveTextContent('₹17,000');
    expect(factIn(amounts, 'Settled against approval')).toHaveTextContent(
      '₹1,72,000',
    );
    const payments = within(sectionAfter('Payments')).getAllByRole('listitem');
    expect(payments).toHaveLength(2);
    expect(within(payments[0]).getByText('SYN-NEFT-0009')).toBeInTheDocument();
    expect(
      within(payments[1]).getByText('SYN-NEFT-0009-B'),
    ).toBeInTheDocument();
    expect(factIn(payments[1], 'Received in bank')).toHaveTextContent(
      '₹20,000',
    );
    expect(factIn(payments[1], 'TDS deducted')).toHaveTextContent('₹2,000');
    expect(factIn(payments[1], 'Settled against approval')).toHaveTextContent(
      '₹22,000',
    );
  });

  it('shows the payment date without shifting the day', () => {
    renderDetail(SETTLED_CASE);

    expect(screen.getByText('Received Oct 28, 2026')).toBeInTheDocument();
  });

  it('leaves out the payer money lines on a reimbursement case', () => {
    renderDetail(REIMBURSEMENT_CASE);

    const amounts = sectionAfter('Amounts');
    expect(factIn(amounts, 'Billed')).toHaveTextContent('₹62,000');
    expect(factIn(amounts, 'Approved')).toHaveTextContent('Not recorded');
    expect(factIn(amounts, 'Received in bank')).toHaveTextContent(
      'Not applicable',
    );
    expect(screen.queryByText('TDS deducted')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Outstanding from payer'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Payments' }),
    ).not.toBeInTheDocument();
  });

  it('says not recorded on a cashless case with no bank receipt yet', () => {
    const unpaidCase = syntheticCases.find(
      ({ claimRoute, amounts }) =>
        claimRoute === 'cashless' && amounts.received === null,
    )!;
    renderDetail(unpaidCase.id);

    expect(
      factIn(sectionAfter('Amounts'), 'Received in bank'),
    ).toHaveTextContent('Not recorded');
  });

  it('shows the authorisation history in order', () => {
    renderDetail(SETTLED_CASE);

    const items = within(sectionAfter('Authorisation history')).getAllByRole(
      'listitem',
    );
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText('Pre-authorisation')).toBeInTheDocument();
    expect(within(items[0]).getByText('Partly approved')).toBeInTheDocument();
    expect(
      within(items[0]).getByText('Approved ₹1,20,000'),
    ).toBeInTheDocument();
    expect(
      within(items[0]).getByText(/^Requested ₹1,50,000, /),
    ).toBeInTheDocument();
    expect(
      within(items[1]).getByText('Final authorisation'),
    ).toBeInTheDocument();
  });

  it('flags a late decision and says it is based on recorded times', () => {
    renderDetail(SHORT_PAID_CASE);

    const items = within(sectionAfter('Authorisation history')).getAllByRole(
      'listitem',
    );
    expect(
      within(items[1]).getByText(
        'Decision took more than 3 hours, based on recorded times.',
      ),
    ).toBeInTheDocument();
    expect(
      within(items[0]).queryByText(/based on recorded times/),
    ).not.toBeInTheDocument();
  });

  it('flags a pending pre-authorisation past its limit as overdue', () => {
    const now = jest
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse('2026-10-01T11:01:00+05:30'));

    renderDetail('synthetic-cashless-preauthorisation-pending');

    expect(
      screen.getByText(
        'Overdue: no decision within 1 hour, based on recorded times.',
      ),
    ).toBeInTheDocument();
    now.mockRestore();
  });

  it('does not flag a pending pre-authorisation inside its limit', () => {
    const now = jest
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse('2026-10-01T10:30:00+05:30'));

    renderDetail('synthetic-cashless-preauthorisation-pending');

    expect(screen.queryByText(/^Overdue:/)).not.toBeInTheDocument();
    now.mockRestore();
  });

  it('shows the deductions with their notes', () => {
    renderDetail(SETTLED_CASE);

    const [deduction] = within(sectionAfter('Deductions')).getAllByRole(
      'listitem',
    );
    expect(
      within(deduction).getByText('Non-medical items'),
    ).toBeInTheDocument();
    expect(within(deduction).getByText('₹20,000')).toBeInTheDocument();
    expect(
      within(deduction).getByText('Synthetic note: non-medical items.'),
    ).toBeInTheDocument();
  });

  it('shows the document checklist with stage and state', () => {
    renderDetail('synthetic-cashless-discharge-pending');

    const items = within(sectionAfter('Document checklist')).getAllByRole(
      'listitem',
    );
    expect(items).toHaveLength(3);
    expect(
      within(items[2]).getByText('Synthetic pharmacy bill'),
    ).toBeInTheDocument();
    expect(within(items[2]).getByText('Pending')).toBeInTheDocument();
    expect(within(items[2]).getByText('Discharge')).toBeInTheDocument();
  });

  it('shows an open query in the log and as a flag', () => {
    renderDetail('synthetic-cashless-discharge-pending');

    expect(screen.getByText('Open query')).toBeInTheDocument();
    const [query] = within(sectionAfter('Query log')).getAllByRole('listitem');
    expect(
      within(query).getByText(
        'Synthetic query: please share the itemised pharmacy bill.',
      ),
    ).toBeInTheDocument();
    expect(
      within(query).getByText('Owner: Synthetic billing user'),
    ).toBeInTheDocument();
    expect(within(query).getByText('Not answered')).toBeInTheDocument();
  });

  it('shows when an answered query was answered', () => {
    renderDetail(SETTLED_CASE);

    expect(screen.queryByText('Open query')).not.toBeInTheDocument();
    expect(screen.getByText(/^Answered /)).toBeInTheDocument();
  });

  it('says so when a section has no records', () => {
    renderDetail('synthetic-cashless-admitted');

    expect(screen.getAllByText('None recorded.')).toHaveLength(4);
  });

  it('shows the denial reason', () => {
    renderDetail('synthetic-cashless-denied');

    expect(
      screen.getByText(
        'Denial reason: Synthetic reason: waiting period not completed.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the closure note', () => {
    renderDetail('synthetic-reimbursement-closed-after-denial');

    expect(
      screen.getByText(
        'Closure note: Synthetic note: patient claimed reimbursement directly.',
      ),
    ).toBeInTheDocument();
  });

  it('links back to the insurance desk', () => {
    renderDetail(SETTLED_CASE);

    expect(
      screen.getByRole('link', { name: 'Back to insurance desk' }),
    ).toHaveAttribute('href', '/home/insurance');
  });

  it('links back to the list with the search and filters the user had', () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: `/insurance/${SETTLED_CASE}`,
            state: { deskSearch: '?q=synthetic&status=settled' },
          },
        ]}
      >
        <Routes>
          <Route path="/insurance/:caseId" element={<CaseDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('link', { name: 'Back to insurance desk' }),
    ).toHaveAttribute('href', '/home/insurance?q=synthetic&status=settled');
  });

  it('shows a useful not-found state for an unknown id', () => {
    renderDetail('does-not-exist');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Case not found' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to insurance desk' }),
    ).toBeInTheDocument();
  });

  it('shows an error when the cases are invalid', () => {
    mockLoadCases.mockReturnValue({ ok: false, errors: ['x'] });

    renderDetail(SETTLED_CASE);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not load the insurance cases.',
    );
  });
});
