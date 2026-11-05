import {
  Authorisation,
  AuthorisationKind,
  CasePayment,
  InsuranceCase,
  IsoDate,
  IsoDateTime,
  Paise,
} from './types';

/** Hours allowed for a decision under IRDAI Master Circular 2024, paras 15(b) and 16(a). */
const DECISION_LIMIT_HOURS: Partial<Record<AuthorisationKind, number>> = {
  preauthorisation: 1,
  final: 3,
};

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

/** The limit in hours when the recorded times show it was passed, otherwise null. */
export const exceededDecisionLimit = ({
  kind,
  requestedAt,
  decidedAt,
}: Authorisation): number | null => {
  const limit = DECISION_LIMIT_HOURS[kind];
  if (limit === undefined || decidedAt === null) {
    return null;
  }

  const elapsed =
    new Date(decidedAt).getTime() - new Date(requestedAt).getTime();
  return elapsed > limit * 60 * 60 * 1000 ? limit : null;
};

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

/** Formatted in UTC so a YYYY-MM-DD date never shifts to a neighbouring day in local time. */
export const formatCaseDate = (value: IsoDate, locale?: string): string =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
