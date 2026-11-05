import { settledAmount } from '../caseFigures';
import { InsuranceCase } from '../types';
import { validateCases } from '../validateCases';

const settledCase: InsuranceCase = {
  id: 'synthetic-cashless-settled',
  isSynthetic: true,
  patientIdentifier: 'SYN-PAT-001',
  patientDisplayName: 'Synthetic patient A',
  visitReference: 'SYN-VISIT-001',
  claimRoute: 'cashless',
  admissionType: 'planned',
  payerName: 'Synthetic insurer',
  tpaName: 'Synthetic TPA',
  policyNumber: 'SYN-POL-001',
  payerReference: 'SYN-AUTH-001',
  invoiceReference: null,
  admittedAt: '2026-09-01T09:00:00+05:30',
  dischargedAt: '2026-09-05T11:00:00+05:30',
  status: 'settled',
  statusRecordedAt: '2026-09-28T10:00:00+05:30',
  statusRecordedBy: 'Synthetic desk user',
  amounts: {
    billed: 18000000,
    claimed: 18000000,
    approved: 16000000,
    patientResponsibility: 2000000,
    received: 14400000,
  },
  authorisations: [
    {
      kind: 'preauthorisation',
      requestedAmount: 15000000,
      requestedAt: '2026-09-01T10:00:00+05:30',
      decision: 'partly_approved',
      approvedAmount: 12000000,
      decidedAt: '2026-09-01T10:45:00+05:30',
    },
    {
      kind: 'final',
      requestedAmount: 18000000,
      requestedAt: '2026-09-05T08:00:00+05:30',
      decision: 'partly_approved',
      approvedAmount: 16000000,
      decidedAt: '2026-09-05T10:30:00+05:30',
    },
  ],
  deductions: [{ category: 'non_medical', amount: 2000000, note: null }],
  documents: [{ type: 'Discharge summary', stage: 'discharge', state: 'sent' }],
  queries: [
    {
      raisedAt: '2026-09-01T10:15:00+05:30',
      stage: 'preauthorisation',
      question: 'Synthetic query: please share the X-ray report.',
      owner: 'Synthetic desk user',
      answeredAt: '2026-09-01T10:40:00+05:30',
    },
  ],
  payments: [
    {
      receivedOn: '2026-09-28',
      amount: 14400000,
      taxDeductedAtSource: 1600000,
      bankReference: 'SYN-NEFT-001',
    },
  ],
  denialReason: null,
  closureNote: null,
};

const openCase: InsuranceCase = {
  ...settledCase,
  id: 'synthetic-cashless-open',
  dischargedAt: null,
  status: 'admitted',
  amounts: {
    billed: null,
    claimed: null,
    approved: null,
    patientResponsibility: null,
    received: null,
  },
  authorisations: [],
  deductions: [],
  payments: [],
};

const reimbursementCase: InsuranceCase = {
  ...openCase,
  id: 'synthetic-reimbursement',
  claimRoute: 'reimbursement',
  status: 'documents_handed_over',
  amounts: {
    billed: 6200000,
    claimed: null,
    approved: null,
    patientResponsibility: 6200000,
    received: null,
  },
};

const errorsFor = (candidate: unknown): string[] => {
  const result = validateCases([candidate]);
  return result.ok ? [] : result.errors;
};

const amounts = (changes: Partial<InsuranceCase['amounts']>) => ({
  amounts: { ...openCase.amounts, ...changes },
});

describe('validateCases', () => {
  it.each([
    ['a settled cashless case with TDS', settledCase],
    ['a newly admitted case', openCase],
    ['a reimbursement case', reimbursementCase],
  ])('accepts %s', (_case, candidate) => {
    expect(validateCases([candidate])).toEqual({
      ok: true,
      cases: [candidate],
    });
  });

  it('accepts an empty list', () => {
    expect(validateCases([])).toEqual({ ok: true, cases: [] });
  });

  it('rejects input that is not a list', () => {
    expect(validateCases({ cases: [] })).toEqual({
      ok: false,
      errors: ['The cases must be a list.'],
    });
  });

  describe('rule 1: fields and ids', () => {
    it('rejects a case that is not an object', () => {
      expect(errorsFor(null)).toEqual(['Case 1 must be an object.']);
    });

    it('rejects an unknown field', () => {
      expect(errorsFor({ ...openCase, statuss: 'admitted' })).toEqual([
        'Case 1: unknown field "statuss".',
      ]);
    });

    it('rejects a missing field', () => {
      const withoutReference = Object.fromEntries(
        Object.entries(openCase).filter(([key]) => key !== 'invoiceReference'),
      );

      expect(errorsFor(withoutReference)).toEqual([
        'Case 1: missing field "invoiceReference".',
      ]);
    });

    it('rejects a missing field inside a payment', () => {
      const payment = Object.fromEntries(
        Object.entries(settledCase.payments[0]).filter(
          ([key]) => key !== 'taxDeductedAtSource',
        ),
      );

      expect(errorsFor({ ...settledCase, payments: [payment] })).toEqual([
        'Case 1: payments 1: missing field "taxDeductedAtSource".',
      ]);
    });

    it('rejects an id that is not a lowercase slug', () => {
      expect(errorsFor({ ...openCase, id: 'Bad ID!' })).toEqual([
        'Case 1: id must be a lowercase slug (a-z, 0-9, -).',
      ]);
    });

    it('rejects duplicate ids', () => {
      expect(validateCases([openCase, openCase])).toEqual({
        ok: false,
        errors: ['Case 2: duplicate id "synthetic-cashless-open".'],
      });
    });

    it('rejects empty required text', () => {
      expect(errorsFor({ ...openCase, payerName: '   ' })).toEqual([
        'Case 1: payerName must be non-empty text.',
      ]);
    });
  });

  describe('rule 2: allowed values', () => {
    it.each([
      ['claimRoute', 'cash'],
      ['admissionType', 'walk_in'],
      ['status', 'paid'],
    ])('rejects an unknown %s', (field, value) => {
      expect(errorsFor({ ...openCase, [field]: value })).toEqual([
        `Case 1: ${field} must be an allowed value.`,
      ]);
    });

    it('rejects an unknown value inside a list', () => {
      const deductions = [{ category: 'misc', amount: 100, note: null }];

      expect(errorsFor({ ...openCase, deductions })).toEqual([
        'Case 1: deductions 1: category must be an allowed value.',
      ]);
    });

    it('rejects a cashless-only status on a reimbursement case', () => {
      expect(
        errorsFor({ ...reimbursementCase, status: 'claim_submitted' }),
      ).toEqual([
        'Case 1: status "claim_submitted" is not allowed for a reimbursement case.',
      ]);
    });

    it('rejects a reimbursement-only status on a cashless case', () => {
      expect(
        errorsFor({ ...openCase, status: 'documents_handed_over' }),
      ).toEqual([
        'Case 1: status "documents_handed_over" is not allowed for a cashless case.',
      ]);
    });
  });

  describe('rule 3: money', () => {
    it.each([
      ['a fraction', 100.5],
      ['a negative number', -1],
      ['text', '100'],
    ])('rejects an amount that is %s', (_case, billed) => {
      expect(
        errorsFor({ ...openCase, ...amounts({ billed } as never) }),
      ).toEqual([
        'Case 1: amounts: billed must be whole paise, zero or more, or null.',
      ]);
    });

    it('rejects a null TDS, because zero is how no TDS is recorded', () => {
      const payments = [
        { ...settledCase.payments[0], taxDeductedAtSource: null },
      ];

      expect(errorsFor({ ...settledCase, payments })).toEqual([
        'Case 1: payments 1: taxDeductedAtSource must be whole paise, zero or more.',
      ]);
    });
  });

  describe('rule 4: amounts agree', () => {
    it('rejects claimed above billed', () => {
      expect(
        errorsFor({ ...openCase, ...amounts({ billed: 100, claimed: 200 }) }),
      ).toEqual(['Case 1: claimed must not be more than billed.']);
    });

    it('rejects approved above claimed', () => {
      expect(
        errorsFor({
          ...openCase,
          ...amounts({ billed: 300, claimed: 100, approved: 200 }),
        }),
      ).toEqual(['Case 1: approved must not be more than claimed.']);
    });

    it('rejects approved plus patient responsibility above billed', () => {
      expect(
        errorsFor({
          ...openCase,
          ...amounts({
            billed: 100,
            claimed: 100,
            approved: 80,
            patientResponsibility: 30,
          }),
        }),
      ).toEqual([
        'Case 1: approved plus patient responsibility must not be more than billed.',
      ]);
    });
  });

  describe('rule 5: received and settled', () => {
    it('counts both the bank amount and the TDS as settled', () => {
      expect(settledAmount(settledCase.payments)).toBe(16000000);
    });

    it('adds up every payment', () => {
      const payments = [
        { ...settledCase.payments[0], amount: 100, taxDeductedAtSource: 10 },
        { ...settledCase.payments[0], amount: 200, taxDeductedAtSource: 0 },
      ];

      expect(settledAmount(payments)).toBe(310);
    });

    it('rejects received that does not match the bank amounts', () => {
      expect(
        errorsFor({
          ...settledCase,
          amounts: { ...settledCase.amounts, received: 16000000 },
        }),
      ).toEqual([
        'Case 1: received must equal the sum of the payment amounts.',
      ]);
    });

    it('rejects payments on a case with null received', () => {
      expect(
        errorsFor({
          ...settledCase,
          amounts: { ...settledCase.amounts, received: null },
        }),
      ).toEqual([
        'Case 1: received must equal the sum of the payment amounts.',
      ]);
    });

    it('rejects settled above approved', () => {
      expect(
        errorsFor({
          ...settledCase,
          status: 'claim_submitted',
          amounts: { ...settledCase.amounts, received: 16000000 },
          payments: [{ ...settledCase.payments[0], amount: 16000000 }],
        }),
      ).toEqual(['Case 1: settled must not be more than approved.']);
    });
  });

  describe('rule 6: deductions', () => {
    it('rejects final approval when deductions do not explain the difference', () => {
      expect(errorsFor({ ...settledCase, deductions: [] })).toEqual([
        'Case 1: deductions must add up to claimed minus approved.',
      ]);
    });

    it('rejects final approval without claimed and approved amounts', () => {
      expect(
        errorsFor({
          ...settledCase,
          status: 'final_approved',
          amounts: {
            ...settledCase.amounts,
            claimed: null,
            approved: null,
            received: null,
          },
          payments: [],
        }),
      ).toEqual(['Case 1: final approval needs claimed and approved amounts.']);
    });
  });

  describe('rule 7: status evidence', () => {
    it('rejects preauthorisation_approved without an approved request', () => {
      expect(
        errorsFor({ ...openCase, status: 'preauthorisation_approved' }),
      ).toEqual([
        'Case 1: status "preauthorisation_approved" needs an approved preauthorisation.',
      ]);
    });

    it('rejects a settled status without a final approval', () => {
      const authorisations = settledCase.authorisations.filter(
        ({ kind }) => kind !== 'final',
      );

      expect(errorsFor({ ...settledCase, authorisations })).toEqual([
        'Case 1: status "settled" needs an approved final authorisation.',
      ]);
    });

    it.each(['final_approved', 'claim_submitted', 'settled'])(
      'rejects %s without a discharge time',
      (status) => {
        expect(
          errorsFor({ ...settledCase, status, dischargedAt: null }),
        ).toEqual([`Case 1: status "${status}" needs a discharge time.`]);
      },
    );

    it('treats TDS as settled, so a case with TDS is not short paid', () => {
      expect(errorsFor({ ...settledCase, status: 'short_paid' })).toEqual([
        'Case 1: status "short_paid" needs settled above zero and below approved.',
      ]);
    });

    it('rejects settled when the bank amount and TDS fall short', () => {
      expect(
        errorsFor({
          ...settledCase,
          payments: [{ ...settledCase.payments[0], taxDeductedAtSource: 0 }],
        }),
      ).toEqual(['Case 1: status "settled" needs settled equal to approved.']);
    });

    it('accepts short_paid when settled is below approved', () => {
      expect(
        errorsFor({
          ...settledCase,
          status: 'short_paid',
          amounts: { ...settledCase.amounts, received: 12000000 },
          payments: [{ ...settledCase.payments[0], amount: 12000000 }],
        }),
      ).toEqual([]);
    });

    it('rejects short_paid with nothing settled', () => {
      expect(
        errorsFor({
          ...settledCase,
          status: 'short_paid',
          amounts: { ...settledCase.amounts, received: 0 },
          payments: [],
        }),
      ).toEqual([
        'Case 1: status "short_paid" needs settled above zero and below approved.',
      ]);
    });

    it('rejects denied without a reason', () => {
      expect(errorsFor({ ...openCase, status: 'denied' })).toEqual([
        'Case 1: status "denied" needs a denialReason.',
      ]);
    });

    it('rejects closing a case with money outstanding and no note', () => {
      const closed = {
        ...openCase,
        status: 'closed',
        ...amounts({ billed: 100, claimed: 100, approved: 100 }),
      };

      expect(errorsFor(closed)).toEqual([
        'Case 1: status "closed" with money outstanding needs a closureNote.',
      ]);
      expect(
        errorsFor({ ...closed, closureNote: 'Synthetic write-off note.' }),
      ).toEqual([]);
    });

    it('does not count deducted TDS as outstanding when closing', () => {
      expect(errorsFor({ ...settledCase, status: 'closed' })).toEqual([]);
    });
  });

  describe('rule 8: times', () => {
    it.each([
      ['an impossible day', '2026-02-30T09:00:00+05:30'],
      ['no time zone', '2026-09-01T09:00:00'],
      ['a date only', '2026-09-01'],
      ['an impossible hour', '2026-09-01T25:00:00+05:30'],
    ])('rejects a date-time with %s', (_case, admittedAt) => {
      expect(errorsFor({ ...openCase, admittedAt })).toEqual([
        'Case 1: admittedAt must be a date-time with a time zone.',
      ]);
    });

    it('rejects a payment date that is not a calendar date', () => {
      const payments = [
        { ...settledCase.payments[0], receivedOn: '2026-09-31' },
      ];

      expect(errorsFor({ ...settledCase, payments })).toEqual([
        'Case 1: payments 1: receivedOn must be a YYYY-MM-DD calendar date.',
      ]);
    });

    it('rejects discharge before admission', () => {
      expect(
        errorsFor({ ...openCase, dischargedAt: '2026-08-31T09:00:00+05:30' }),
      ).toEqual(['Case 1: dischargedAt must not be before admittedAt.']);
    });

    it('compares times across time zones', () => {
      expect(
        errorsFor({
          ...openCase,
          admittedAt: '2026-09-01T09:00:00+05:30',
          dischargedAt: '2026-09-01T04:00:00Z',
        }),
      ).toEqual([]);
    });

    it('rejects a decision before its request', () => {
      const authorisations = [
        {
          ...settledCase.authorisations[0],
          decidedAt: '2026-09-01T09:30:00+05:30',
        },
        settledCase.authorisations[1],
      ];

      expect(errorsFor({ ...settledCase, authorisations })).toEqual([
        'Case 1: authorisations 1: decidedAt must not be before requestedAt.',
      ]);
    });

    it('rejects an answer before its query', () => {
      const queries = [
        { ...settledCase.queries[0], answeredAt: '2026-09-01T10:00:00+05:30' },
      ];

      expect(errorsFor({ ...settledCase, queries })).toEqual([
        'Case 1: queries 1: answeredAt must not be before raisedAt.',
      ]);
    });
  });

  describe('rule 9: reimbursement', () => {
    it('rejects payments on a reimbursement case', () => {
      expect(
        errorsFor({
          ...reimbursementCase,
          amounts: {
            billed: 14400000,
            claimed: null,
            approved: 14400000,
            patientResponsibility: 0,
            received: 14400000,
          },
          payments: [{ ...settledCase.payments[0], taxDeductedAtSource: 0 }],
        }),
      ).toEqual(['Case 1: a reimbursement case must not have payments.']);
    });

    it('rejects an approved authorisation on a reimbursement case', () => {
      expect(
        errorsFor({
          ...reimbursementCase,
          authorisations: [settledCase.authorisations[0]],
        }),
      ).toEqual([
        'Case 1: a reimbursement case may only keep denied authorisations.',
      ]);
    });

    it('keeps the denial when a denied cashless case moves to reimbursement', () => {
      expect(
        errorsFor({
          ...reimbursementCase,
          authorisations: [
            {
              ...settledCase.authorisations[0],
              decision: 'denied',
              approvedAmount: null,
            },
          ],
        }),
      ).toEqual([]);
    });
  });

  describe('rule 10: synthetic only', () => {
    it('rejects a case that is not marked synthetic', () => {
      expect(errorsFor({ ...openCase, isSynthetic: false })).toEqual([
        'Case 1: isSynthetic must be true.',
      ]);
    });

    it('rejects a policy number without the SYN- prefix', () => {
      expect(errorsFor({ ...openCase, policyNumber: 'POL-001' })).toEqual([
        'Case 1: policyNumber must be text starting with SYN-.',
      ]);
    });
  });
});
