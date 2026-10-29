import { isReviewOverdue, toIsoDate } from '../reviewDates';

describe('toIsoDate', () => {
  it('uses the local calendar day', () => {
    expect(toIsoDate(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});

describe('isReviewOverdue', () => {
  it('is overdue when the review due date has passed', () => {
    expect(isReviewOverdue('2026-06-02', '2026-06-03')).toBe(true);
  });

  it('is not overdue on the due date itself or before it', () => {
    expect(isReviewOverdue('2026-06-02', '2026-06-02')).toBe(false);
    expect(isReviewOverdue('2026-06-02', '2026-06-01')).toBe(false);
  });

  it('is not overdue when no review due date is set', () => {
    expect(isReviewOverdue(null, '2026-06-03')).toBe(false);
  });
});
