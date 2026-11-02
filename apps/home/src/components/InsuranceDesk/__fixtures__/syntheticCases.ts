import { InsuranceCase, IsoDateTime, Paise } from '../types';

const rupees = (value: number): Paise => value * 100;

const october = (day: number, time = '10:00'): IsoDateTime =>
  `2026-10-${String(day).padStart(2, '0')}T${time}:00+05:30`;

const makeCase = (
  number: string,
  slug: string,
  changes: Partial<InsuranceCase>,
): InsuranceCase => ({
  id: `synthetic-${slug}`,
  isSynthetic: true,
  patientIdentifier: `SYN-PAT-${number}`,
  patientDisplayName: `Synthetic patient ${number}`,
  visitReference: `SYN-VISIT-${number}`,
  claimRoute: 'cashless',
  admissionType: 'planned',
  payerName: 'Synthetic Insurer A',
  tpaName: 'Synthetic TPA One',
  policyNumber: `SYN-POL-${number}`,
  payerReference: null,
  invoiceReference: null,
  admittedAt: october(1, '09:00'),
  dischargedAt: null,
  status: 'admitted',
  statusRecordedAt: october(1),
  statusRecordedBy: 'Synthetic desk user',
  amounts: {
    billed: null,
    claimed: null,
    approved: null,
    patientResponsibility: null,
    received: null,
  },
  authorisations: [],
  deductions: [],
  documents: [
    { type: 'Synthetic health card', stage: 'admission', state: 'received' },
  ],
  queries: [],
  payments: [],
  denialReason: null,
  closureNote: null,
  ...changes,
});

const approvedPreauthorisation = (requested: number, approved: number) => ({
  kind: 'preauthorisation' as const,
  requestedAmount: rupees(requested),
  requestedAt: october(1, '10:00'),
  decision:
    requested === approved
      ? ('approved' as const)
      : ('partly_approved' as const),
  approvedAmount: rupees(approved),
  decidedAt: october(1, '10:45'),
});

const approvedFinal = (requested: number, approved: number) => ({
  kind: 'final' as const,
  requestedAmount: rupees(requested),
  requestedAt: october(5, '08:00'),
  decision:
    requested === approved
      ? ('approved' as const)
      : ('partly_approved' as const),
  approvedAmount: rupees(approved),
  decidedAt: october(5, '10:30'),
});

/**
 * SYNTHETIC cases for tests and local development only. Every name, number and
 * amount is invented. One case per status, so every status filter shows a result.
 */
export const syntheticCases: InsuranceCase[] = [
  makeCase('0001', 'cashless-admitted', {
    statusRecordedAt: october(20),
  }),
  makeCase('0002', 'cashless-preauthorisation-pending', {
    status: 'preauthorisation_pending',
    statusRecordedAt: october(19),
    authorisations: [
      {
        kind: 'preauthorisation',
        requestedAmount: rupees(85000),
        requestedAt: october(1, '10:00'),
        decision: 'pending',
        approvedAmount: null,
        decidedAt: null,
      },
    ],
    queries: [
      {
        raisedAt: october(1, '10:30'),
        stage: 'preauthorisation',
        question: 'Synthetic query: please share the X-ray report.',
        owner: 'Synthetic desk user',
        answeredAt: null,
      },
    ],
  }),
  makeCase('0003', 'cashless-preauthorisation-approved', {
    status: 'preauthorisation_approved',
    statusRecordedAt: october(18),
    admissionType: 'emergency',
    payerName: 'Synthetic Insurer B',
    tpaName: null,
    payerReference: 'SYN-AUTH-0003',
    authorisations: [approvedPreauthorisation(60000, 60000)],
  }),
  makeCase('0004', 'cashless-enhancement-pending', {
    status: 'enhancement_pending',
    statusRecordedAt: october(17),
    payerName: 'Synthetic Insurer B',
    tpaName: null,
    payerReference: 'SYN-AUTH-0004',
    authorisations: [
      approvedPreauthorisation(90000, 70000),
      {
        kind: 'enhancement',
        requestedAmount: rupees(30000),
        requestedAt: october(3),
        decision: 'pending',
        approvedAmount: null,
        decidedAt: null,
      },
    ],
  }),
  makeCase('0005', 'cashless-discharge-pending', {
    status: 'discharge_pending',
    statusRecordedAt: october(16),
    payerReference: 'SYN-AUTH-0005',
    amounts: {
      billed: rupees(95000),
      claimed: rupees(95000),
      approved: null,
      patientResponsibility: null,
      received: null,
    },
    authorisations: [
      approvedPreauthorisation(80000, 80000),
      {
        kind: 'final',
        requestedAmount: rupees(95000),
        requestedAt: october(5, '08:00'),
        decision: 'pending',
        approvedAmount: null,
        decidedAt: null,
      },
    ],
    queries: [
      {
        raisedAt: october(5, '09:00'),
        stage: 'discharge',
        question: 'Synthetic query: please share the itemised pharmacy bill.',
        owner: 'Synthetic billing user',
        answeredAt: null,
      },
    ],
  }),
  makeCase('0006', 'cashless-final-approved', {
    status: 'final_approved',
    statusRecordedAt: october(15),
    dischargedAt: october(5, '11:00'),
    payerName: 'Synthetic Insurer C',
    tpaName: 'Synthetic TPA Two',
    payerReference: 'SYN-AUTH-0006',
    amounts: {
      billed: rupees(120000),
      claimed: rupees(120000),
      approved: rupees(110000),
      patientResponsibility: rupees(10000),
      received: null,
    },
    authorisations: [
      approvedPreauthorisation(100000, 100000),
      approvedFinal(120000, 110000),
    ],
    deductions: [
      { category: 'room_rent', amount: rupees(6000), note: null },
      { category: 'co_pay', amount: rupees(4000), note: null },
    ],
  }),
  makeCase('0007', 'cashless-claim-submitted', {
    status: 'claim_submitted',
    statusRecordedAt: october(14),
    dischargedAt: october(5, '11:00'),
    payerName: 'Synthetic Insurer C',
    tpaName: 'Synthetic TPA Two',
    payerReference: 'SYN-AUTH-0007',
    amounts: {
      billed: rupees(75000),
      claimed: rupees(75000),
      approved: rupees(75000),
      patientResponsibility: 0,
      received: null,
    },
    authorisations: [
      approvedPreauthorisation(70000, 70000),
      approvedFinal(75000, 75000),
    ],
  }),
  makeCase('0008', 'cashless-settled-with-tds', {
    status: 'settled',
    statusRecordedAt: october(28),
    dischargedAt: october(5, '11:00'),
    payerReference: 'SYN-AUTH-0008',
    amounts: {
      billed: rupees(180000),
      claimed: rupees(180000),
      approved: rupees(160000),
      patientResponsibility: rupees(20000),
      received: rupees(144000),
    },
    authorisations: [
      approvedPreauthorisation(150000, 120000),
      approvedFinal(180000, 160000),
    ],
    deductions: [
      {
        category: 'non_medical',
        amount: rupees(20000),
        note: 'Synthetic note: non-medical items.',
      },
    ],
    queries: [
      {
        raisedAt: october(1, '10:15'),
        stage: 'preauthorisation',
        question: 'Synthetic query: please share the blood report.',
        owner: 'Synthetic desk user',
        answeredAt: october(1, '10:40'),
      },
    ],
    payments: [
      {
        receivedOn: '2026-10-28',
        amount: rupees(144000),
        taxDeductedAtSource: rupees(16000),
        bankReference: 'SYN-NEFT-0008',
      },
    ],
  }),
  makeCase('0009', 'cashless-short-paid-with-tds', {
    status: 'short_paid',
    statusRecordedAt: october(27),
    dischargedAt: october(5, '11:00'),
    payerName: 'Synthetic Insurer B',
    tpaName: null,
    payerReference: 'SYN-AUTH-0009',
    amounts: {
      billed: rupees(200000),
      claimed: rupees(200000),
      approved: rupees(180000),
      patientResponsibility: rupees(20000),
      received: rupees(135000),
    },
    authorisations: [
      approvedPreauthorisation(150000, 150000),
      approvedFinal(200000, 180000),
    ],
    deductions: [{ category: 'sub_limit', amount: rupees(20000), note: null }],
    payments: [
      {
        receivedOn: '2026-10-27',
        amount: rupees(135000),
        taxDeductedAtSource: rupees(15000),
        bankReference: 'SYN-NEFT-0009',
      },
    ],
  }),
  makeCase('0010', 'cashless-denied', {
    status: 'denied',
    statusRecordedAt: october(13),
    authorisations: [
      {
        kind: 'preauthorisation',
        requestedAmount: rupees(50000),
        requestedAt: october(1, '10:00'),
        decision: 'denied',
        approvedAmount: null,
        decidedAt: october(1, '10:50'),
      },
    ],
    denialReason: 'Synthetic reason: waiting period not completed.',
  }),
  makeCase('0011', 'reimbursement-documents-handed-over', {
    claimRoute: 'reimbursement',
    status: 'documents_handed_over',
    statusRecordedAt: october(12),
    admissionType: 'emergency',
    dischargedAt: october(4, '12:00'),
    payerName: 'Synthetic Insurer C',
    tpaName: null,
    amounts: {
      billed: rupees(62000),
      claimed: null,
      approved: null,
      patientResponsibility: rupees(62000),
      received: null,
    },
    documents: [
      { type: 'Synthetic itemised bill', stage: 'discharge', state: 'sent' },
      {
        type: 'Synthetic hospital claim form',
        stage: 'claim_submission',
        state: 'sent',
      },
    ],
  }),
  makeCase('0012', 'reimbursement-closed-after-denial', {
    claimRoute: 'reimbursement',
    status: 'closed',
    statusRecordedAt: october(11),
    dischargedAt: october(3, '12:00'),
    amounts: {
      billed: rupees(40000),
      claimed: null,
      approved: null,
      patientResponsibility: rupees(40000),
      received: null,
    },
    authorisations: [
      {
        kind: 'preauthorisation',
        requestedAmount: rupees(40000),
        requestedAt: october(1, '10:00'),
        decision: 'denied',
        approvedAmount: null,
        decidedAt: october(1, '10:50'),
      },
    ],
    closureNote: 'Synthetic note: patient claimed reimbursement directly.',
  }),
];
