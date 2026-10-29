import { formatPolicyDate } from '../formatPolicyDate';

describe('formatPolicyDate', () => {
  it('formats a calendar date for display', () => {
    expect(formatPolicyDate('2026-03-12', 'en-GB')).toBe('12 Mar 2026');
  });

  it('never moves a date to the previous or next day', () => {
    expect(formatPolicyDate('2026-01-01', 'en-GB')).toBe('1 Jan 2026');
    expect(formatPolicyDate('2026-12-31', 'en-GB')).toBe('31 Dec 2026');
  });

  it('returns null for a missing date', () => {
    expect(formatPolicyDate(null, 'en-GB')).toBeNull();
  });
});
