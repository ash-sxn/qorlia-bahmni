import { syntheticCases } from '../__fixtures__/syntheticCases';
import {
  exceededDecisionLimit,
  formatCaseDate,
  formatRupees,
  hasOpenQuery,
  outstandingAmount,
  overdueDecisionLimit,
  settledAmount,
} from '../caseFigures';

const caseById = (id: string) =>
  syntheticCases.find((candidate) => candidate.id === id)!;

describe('caseFigures', () => {
  describe('settledAmount', () => {
    it('counts both the bank amount and the TDS', () => {
      const { payments } = caseById('synthetic-cashless-settled-with-tds');

      expect(settledAmount(payments)).toBe(16000000);
    });

    it('is zero without payments', () => {
      expect(settledAmount([])).toBe(0);
    });
  });

  describe('outstandingAmount', () => {
    it('does not count deducted TDS as money still due', () => {
      expect(
        outstandingAmount(caseById('synthetic-cashless-settled-with-tds')),
      ).toBe(0);
    });

    it('is approved minus settled on a short-paid case', () => {
      expect(
        outstandingAmount(caseById('synthetic-cashless-short-paid-with-tds')),
      ).toBe(3000000);
    });

    it('is null before anything is approved', () => {
      expect(
        outstandingAmount(caseById('synthetic-cashless-admitted')),
      ).toBeNull();
    });
  });

  describe('hasOpenQuery', () => {
    it('is true when a query has no answer', () => {
      expect(
        hasOpenQuery(caseById('synthetic-cashless-preauthorisation-pending')),
      ).toBe(true);
    });

    it('is false when every query is answered', () => {
      expect(
        hasOpenQuery(caseById('synthetic-cashless-settled-with-tds')),
      ).toBe(false);
    });
  });

  describe('exceededDecisionLimit', () => {
    const decision = (
      kind: 'preauthorisation' | 'enhancement' | 'final',
      decidedAt: string | null,
    ) => ({
      kind,
      requestedAmount: 100,
      requestedAt: '2026-10-01T10:00:00+05:30',
      decision:
        decidedAt === null ? ('pending' as const) : ('approved' as const),
      approvedAmount: decidedAt === null ? null : 100,
      decidedAt,
    });

    it.each([
      ['preauthorisation', '2026-10-01T11:00:00+05:30', null],
      ['preauthorisation', '2026-10-01T11:01:00+05:30', 1],
      ['final', '2026-10-01T13:00:00+05:30', null],
      ['final', '2026-10-01T13:01:00+05:30', 3],
      ['enhancement', '2026-10-02T10:00:00+05:30', null],
      ['final', null, null],
    ] as const)('%s decided at %s gives %s', (kind, decidedAt, expected) => {
      expect(exceededDecisionLimit(decision(kind, decidedAt))).toBe(expected);
    });
  });

  describe('overdueDecisionLimit', () => {
    const request = (
      kind: 'preauthorisation' | 'enhancement' | 'final',
      decidedAt: string | null = null,
    ) => ({
      kind,
      requestedAmount: 100,
      requestedAt: '2026-10-01T10:00:00+05:30',
      decision:
        decidedAt === null ? ('pending' as const) : ('approved' as const),
      approvedAmount: decidedAt === null ? null : 100,
      decidedAt,
    });

    it.each([
      ['preauthorisation', '2026-10-01T11:00:00+05:30', null],
      ['preauthorisation', '2026-10-01T11:01:00+05:30', 1],
      ['final', '2026-10-01T13:00:00+05:30', null],
      ['final', '2026-10-01T13:01:00+05:30', 3],
      ['enhancement', '2026-10-02T10:00:00+05:30', null],
    ] as const)('pending %s at %s gives %s', (kind, now, expected) => {
      expect(overdueDecisionLimit(request(kind), Date.parse(now))).toBe(
        expected,
      );
    });

    it('does not flag a request that already has a decision', () => {
      expect(
        overdueDecisionLimit(
          request('preauthorisation', '2026-10-01T10:30:00+05:30'),
          Date.parse('2026-10-02T10:00:00+05:30'),
        ),
      ).toBeNull();
    });
  });

  describe('formatCaseDate', () => {
    it('keeps the calendar day', () => {
      expect(formatCaseDate('2026-10-28', 'en-US')).toBe('Oct 28, 2026');
    });
  });

  describe('formatRupees', () => {
    it.each([
      [16000000, '₹1,60,000'],
      [0, '₹0'],
      [12345, '₹123.45'],
    ])('formats %i paise as %s', (paise, expected) => {
      expect(formatRupees(paise)).toBe(expected);
    });
  });
});
