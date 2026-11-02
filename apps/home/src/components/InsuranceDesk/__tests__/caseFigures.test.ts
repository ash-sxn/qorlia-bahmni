import { syntheticCases } from '../__fixtures__/syntheticCases';
import {
  formatRupees,
  hasOpenQuery,
  outstandingAmount,
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
