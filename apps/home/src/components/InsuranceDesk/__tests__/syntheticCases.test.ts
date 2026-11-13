import { syntheticCases } from '../__fixtures__/syntheticCases';
import { CASE_STATUSES } from '../types';
import { validateCases } from '../validateCases';

describe('syntheticCases', () => {
  it('passes the validator', () => {
    expect(validateCases(syntheticCases)).toEqual({
      ok: true,
      cases: syntheticCases,
    });
  });

  it('includes every status, so every status filter shows a result', () => {
    const statuses = syntheticCases.map(({ status }) => status);

    expect([...statuses].sort()).toEqual([...CASE_STATUSES].sort());
  });

  it('includes a case with tax deducted at source', () => {
    const payments = syntheticCases.flatMap((candidate) => candidate.payments);

    expect(
      payments.some(({ taxDeductedAtSource }) => taxDeductedAtSource > 0),
    ).toBe(true);
  });

  it('labels every patient and policy as synthetic', () => {
    syntheticCases.forEach((candidate) => {
      expect(candidate.patientDisplayName).toMatch(/^Synthetic /);
      expect(candidate.patientIdentifier).toMatch(/^SYN-/);
      expect(candidate.policyNumber).toMatch(/^SYN-/);
    });
  });
});
