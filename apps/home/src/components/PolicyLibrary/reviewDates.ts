import { IsoDate } from './types';

/** The user's local calendar day as YYYY-MM-DD. */
export const toIsoDate = (date: Date): IsoDate =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');

/**
 * Our editorial review is overdue once its due date has passed. This says
 * nothing about whether the policy itself is still in force.
 */
export const isReviewOverdue = (
  reviewDueOn: IsoDate | null,
  today: IsoDate,
): boolean => reviewDueOn !== null && reviewDueOn < today;
