import { claimScenarios } from '../__fixtures__/claimScenarios';
import { syntheticCases } from '../__fixtures__/syntheticCases';
import { exceededDecisionLimit, settledAmount } from '../caseFigures';
import { validateCases } from '../validateCases';

const scenario = (slug: string) =>
  claimScenarios.find(({ id }) => id === `synthetic-scenario-${slug}`)!;

describe('claimScenarios', () => {
  it('passes the case validator', () => {
    expect(validateCases(claimScenarios)).toEqual({
      ok: true,
      cases: claimScenarios,
    });
  });

  it('has the five scenarios from issue #42, all marked synthetic', () => {
    expect(claimScenarios.map(({ id }) => id)).toEqual([
      'synthetic-scenario-planned-surgery',
      'synthetic-scenario-emergency',
      'synthetic-scenario-maternity',
      'synthetic-scenario-pmjay',
      'synthetic-scenario-reimbursement',
    ]);
    claimScenarios.forEach((candidate) => {
      expect(candidate.isSynthetic).toBe(true);
      expect(candidate.patientDisplayName).toMatch(/^Synthetic /);
    });
  });

  it('does not reuse an id of the existing synthetic cases', () => {
    const existing = new Set(syntheticCases.map(({ id }) => id));
    claimScenarios.forEach(({ id }) => expect(existing.has(id)).toBe(false));
  });

  it('covers both claim routes and both admission types', () => {
    expect(scenario('emergency').admissionType).toBe('emergency');
    expect(scenario('planned-surgery').admissionType).toBe('planned');
    expect(scenario('reimbursement').claimRoute).toBe('reimbursement');
    expect(scenario('pmjay').claimRoute).toBe('cashless');
  });

  it('keeps every authorisation decision within the IRDAI time limits', () => {
    claimScenarios.forEach(({ authorisations }) =>
      authorisations.forEach((authorisation) =>
        expect(exceededDecisionLimit(authorisation)).toBeNull(),
      ),
    );
  });

  it('settles a PM-JAY package in full with nothing for the patient to pay', () => {
    const pmjay = scenario('pmjay');

    expect(pmjay.status).toBe('settled');
    expect(pmjay.tpaName).toBeNull();
    expect(pmjay.amounts.patientResponsibility).toBe(0);
    expect(settledAmount(pmjay.payments)).toBe(pmjay.amounts.approved);
  });

  it('applies the maternity sub-limit as the only deduction', () => {
    const { deductions, amounts } = scenario('maternity');

    expect(deductions.map(({ category }) => category)).toEqual(['sub_limit']);
    expect(amounts.claimed! - amounts.approved!).toBe(deductions[0].amount);
  });

  it('lists the claim documents a hospital sends at discharge', () => {
    const discharge = scenario('planned-surgery')
      .documents.filter(({ stage }) => stage === 'discharge')
      .map(({ type }) => type);

    expect(discharge).toEqual(
      expect.arrayContaining([
        'Synthetic discharge summary',
        'Synthetic final itemised bill',
        'Synthetic pharmacy bills with prescriptions',
        'Synthetic investigation reports and receipts',
        "Synthetic surgeon's certificate and bill",
      ]),
    );
  });

  it('records the police papers for the road accident', () => {
    const types = scenario('emergency').documents.map(({ type }) => type);

    expect(types).toContain('Synthetic MLC and FIR copy');
  });

  it('hands the papers to the patient in the reimbursement case and takes no payment', () => {
    const reimbursement = scenario('reimbursement');

    expect(reimbursement.status).toBe('documents_handed_over');
    expect(reimbursement.payments).toEqual([]);
    expect(reimbursement.authorisations).toEqual([]);
  });
});
