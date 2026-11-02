import { CasePayment, InsuranceCase, IsoDateTime, Paise } from './types';

export const sum = (values: readonly Paise[]): Paise =>
  values.reduce((total, value) => total + value, 0);

/** What a payer has settled against the approval: the bank amount plus the tax it deducted. */
export const settledAmount = (payments: readonly CasePayment[]): Paise =>
  sum(payments.map((payment) => payment.amount + payment.taxDeductedAtSource));

/** Approved minus settled, so deducted tax is not shown as money still due. Null until approved. */
export const outstandingAmount = ({
  amounts,
  payments,
}: InsuranceCase): Paise | null =>
  amounts.approved === null ? null : amounts.approved - settledAmount(payments);

export const hasOpenQuery = ({ queries }: InsuranceCase): boolean =>
  queries.some(({ answeredAt }) => answeredAt === null);

/** Always Indian digit grouping, because the amounts are rupees whatever the UI language is. */
export const formatRupees = (value: Paise): string =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value / 100);

export const formatCaseDateTime = (
  value: IsoDateTime,
  locale?: string,
): string =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
