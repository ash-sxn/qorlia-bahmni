import { settledAmount, sum } from './caseFigures';
import {
  ADMISSION_TYPES,
  Authorisation,
  AUTHORISATION_DECISIONS,
  AUTHORISATION_KINDS,
  AuthorisationKind,
  CASE_STAGES,
  CASE_STATUSES,
  CaseAmounts,
  CaseDocument,
  CaseListResult,
  CasePayment,
  CaseQuery,
  CaseStatus,
  CLAIM_ROUTES,
  ClaimRoute,
  Deduction,
  DEDUCTION_CATEGORIES,
  DOCUMENT_STATES,
  InsuranceCase,
} from './types';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_TIME_PATTERN =
  /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/;

const REIMBURSEMENT_STATUSES: readonly CaseStatus[] = [
  'admitted',
  'documents_handed_over',
  'closed',
];

const STATUSES_BY_ROUTE: Record<ClaimRoute, readonly CaseStatus[]> = {
  cashless: CASE_STATUSES.filter(
    (status) => status !== 'documents_handed_over',
  ),
  reimbursement: REIMBURSEMENT_STATUSES,
};

const AFTER_FINAL_APPROVAL_STATUSES: readonly CaseStatus[] = [
  'final_approved',
  'claim_submitted',
  'settled',
  'short_paid',
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isText = (value: unknown): boolean =>
  typeof value === 'string' && value.trim() !== '';

const isPaise = (value: unknown): boolean =>
  Number.isSafeInteger(value) && (value as number) >= 0;

const isCalendarDate = (value: unknown): boolean => {
  const match = typeof value === 'string' && ISO_DATE_PATTERN.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const isDateTime = (value: unknown): boolean => {
  const match = typeof value === 'string' && ISO_DATE_TIME_PATTERN.exec(value);

  return (
    !!match &&
    isCalendarDate(match[1]) &&
    !Number.isNaN(Date.parse(value as string))
  );
};

const isOneOf =
  (allowed: readonly string[]) =>
  (value: unknown): boolean =>
    typeof value === 'string' && allowed.includes(value);

/** Checks one value and returns the problems found, each starting with its label. */
type Check = (value: unknown, label: string) => string[];

const must =
  (isValid: (value: unknown) => boolean, rule: string): Check =>
  (value, label) =>
    isValid(value) ? [] : [`${label} must be ${rule}.`];

const mustOrNull = (
  isValid: (value: unknown) => boolean,
  rule: string,
): Check =>
  must((value) => value === null || isValid(value), `${rule}, or null`);

const objectOf =
  <T>(shape: Record<keyof T & string, Check>): Check =>
  (value, label) => {
    if (!isRecord(value)) {
      return [`${label} must be an object.`];
    }

    const known = Object.keys(shape);
    const fieldErrors = [
      ...Object.keys(value)
        .filter((key) => !known.includes(key))
        .map((key) => `${label}: unknown field "${key}".`),
      ...known
        .filter((key) => !Object.keys(value).includes(key))
        .map((key) => `${label}: missing field "${key}".`),
    ];
    if (fieldErrors.length > 0) {
      return fieldErrors;
    }

    return Object.entries<Check>(shape).flatMap(([field, check]) =>
      check(value[field], `${label}: ${field}`),
    );
  };

const listOf =
  (check: Check): Check =>
  (value, label) =>
    Array.isArray(value)
      ? value.flatMap((item, index) => check(item, `${label} ${index + 1}`))
      : [`${label} must be a list.`];

const TEXT = must(isText, 'non-empty text');
const OPTIONAL_TEXT = mustOrNull(isText, 'non-empty text');
const PAISE = must(isPaise, 'whole paise, zero or more');
const OPTIONAL_PAISE = mustOrNull(isPaise, 'whole paise, zero or more');
const DATE_TIME = must(isDateTime, 'a date-time with a time zone');
const OPTIONAL_DATE_TIME = mustOrNull(
  isDateTime,
  'a date-time with a time zone',
);

const allowed = (values: readonly string[]): Check =>
  must(isOneOf(values), 'an allowed value');

const checkCaseShape = objectOf<InsuranceCase>({
  id: must(
    (value) => typeof value === 'string' && SLUG_PATTERN.test(value),
    'a lowercase slug (a-z, 0-9, -)',
  ),
  isSynthetic: must((value) => value === true, 'true'),
  patientIdentifier: TEXT,
  patientDisplayName: TEXT,
  visitReference: OPTIONAL_TEXT,
  claimRoute: allowed(CLAIM_ROUTES),
  admissionType: allowed(ADMISSION_TYPES),
  payerName: TEXT,
  tpaName: OPTIONAL_TEXT,
  policyNumber: must(
    (value) => isText(value) && (value as string).startsWith('SYN-'),
    'text starting with SYN-',
  ),
  payerReference: OPTIONAL_TEXT,
  invoiceReference: OPTIONAL_TEXT,
  admittedAt: DATE_TIME,
  dischargedAt: OPTIONAL_DATE_TIME,
  status: allowed(CASE_STATUSES),
  statusRecordedAt: DATE_TIME,
  statusRecordedBy: TEXT,
  amounts: objectOf<CaseAmounts>({
    billed: OPTIONAL_PAISE,
    claimed: OPTIONAL_PAISE,
    approved: OPTIONAL_PAISE,
    patientResponsibility: OPTIONAL_PAISE,
    received: OPTIONAL_PAISE,
  }),
  authorisations: listOf(
    objectOf<Authorisation>({
      kind: allowed(AUTHORISATION_KINDS),
      requestedAmount: PAISE,
      requestedAt: DATE_TIME,
      decision: allowed(AUTHORISATION_DECISIONS),
      approvedAmount: OPTIONAL_PAISE,
      decidedAt: OPTIONAL_DATE_TIME,
    }),
  ),
  deductions: listOf(
    objectOf<Deduction>({
      category: allowed(DEDUCTION_CATEGORIES),
      amount: PAISE,
      note: OPTIONAL_TEXT,
    }),
  ),
  documents: listOf(
    objectOf<CaseDocument>({
      type: TEXT,
      stage: allowed(CASE_STAGES),
      state: allowed(DOCUMENT_STATES),
    }),
  ),
  queries: listOf(
    objectOf<CaseQuery>({
      raisedAt: DATE_TIME,
      stage: allowed(CASE_STAGES),
      question: TEXT,
      owner: TEXT,
      answeredAt: OPTIONAL_DATE_TIME,
    }),
  ),
  payments: listOf(
    objectOf<CasePayment>({
      receivedOn: must(isCalendarDate, 'a YYYY-MM-DD calendar date'),
      amount: PAISE,
      taxDeductedAtSource: PAISE,
      bankReference: TEXT,
    }),
  ),
  denialReason: OPTIONAL_TEXT,
  closureNote: OPTIONAL_TEXT,
});

const hasApproved = (
  { authorisations }: InsuranceCase,
  kind: AuthorisationKind,
): boolean =>
  authorisations.some(
    (authorisation) =>
      authorisation.kind === kind &&
      (authorisation.decision === 'approved' ||
        authorisation.decision === 'partly_approved'),
  );

const isBefore = (later: string, earlier: string): boolean =>
  Date.parse(later) < Date.parse(earlier);

const amountErrors = (
  { amounts, payments }: InsuranceCase,
  label: string,
): string[] => {
  const { billed, claimed, approved, patientResponsibility, received } =
    amounts;
  const errors: string[] = [];

  if (claimed !== null && billed !== null && claimed > billed) {
    errors.push(`${label}: claimed must not be more than billed.`);
  }
  if (approved !== null && claimed !== null && approved > claimed) {
    errors.push(`${label}: approved must not be more than claimed.`);
  }
  if (
    approved !== null &&
    patientResponsibility !== null &&
    billed !== null &&
    approved + patientResponsibility > billed
  ) {
    errors.push(
      `${label}: approved plus patient responsibility must not be more than billed.`,
    );
  }
  if ((received ?? 0) !== sum(payments.map(({ amount }) => amount))) {
    errors.push(
      `${label}: received must equal the sum of the payment amounts.`,
    );
  }
  if (settledAmount(payments) > (approved ?? 0)) {
    errors.push(`${label}: settled must not be more than approved.`);
  }

  return errors;
};

const deductionErrors = (
  insuranceCase: InsuranceCase,
  label: string,
): string[] => {
  if (!hasApproved(insuranceCase, 'final')) {
    return [];
  }

  const { claimed, approved } = insuranceCase.amounts;
  if (claimed === null || approved === null) {
    return [`${label}: final approval needs claimed and approved amounts.`];
  }

  const deducted = sum(insuranceCase.deductions.map(({ amount }) => amount));
  return deducted === claimed - approved
    ? []
    : [`${label}: deductions must add up to claimed minus approved.`];
};

const statusEvidenceErrors = (
  insuranceCase: InsuranceCase,
  label: string,
): string[] => {
  const { status, amounts, payments, dischargedAt } = insuranceCase;
  const approved = amounts.approved ?? 0;
  const settled = settledAmount(payments);
  const statusLabel = `${label}: status "${status}"`;
  const errors: string[] = [];

  if (
    status === 'preauthorisation_approved' &&
    !hasApproved(insuranceCase, 'preauthorisation')
  ) {
    errors.push(`${statusLabel} needs an approved preauthorisation.`);
  }
  if (AFTER_FINAL_APPROVAL_STATUSES.includes(status)) {
    if (!hasApproved(insuranceCase, 'final')) {
      errors.push(`${statusLabel} needs an approved final authorisation.`);
    }
    if (dischargedAt === null) {
      errors.push(`${statusLabel} needs a discharge time.`);
    }
  }
  if (status === 'settled' && settled !== approved) {
    errors.push(`${statusLabel} needs settled equal to approved.`);
  }
  if (status === 'short_paid' && !(settled > 0 && settled < approved)) {
    errors.push(`${statusLabel} needs settled above zero and below approved.`);
  }
  if (status === 'denied' && insuranceCase.denialReason === null) {
    errors.push(`${statusLabel} needs a denialReason.`);
  }
  if (
    status === 'closed' &&
    approved > settled &&
    insuranceCase.closureNote === null
  ) {
    errors.push(`${statusLabel} with money outstanding needs a closureNote.`);
  }

  return errors;
};

const timeErrors = (
  { admittedAt, dischargedAt, authorisations, queries }: InsuranceCase,
  label: string,
): string[] => [
  ...(dischargedAt !== null && isBefore(dischargedAt, admittedAt)
    ? [`${label}: dischargedAt must not be before admittedAt.`]
    : []),
  ...authorisations.flatMap(({ requestedAt, decidedAt }, index) =>
    decidedAt !== null && isBefore(decidedAt, requestedAt)
      ? [
          `${label}: authorisations ${index + 1}: decidedAt must not be before requestedAt.`,
        ]
      : [],
  ),
  ...queries.flatMap(({ raisedAt, answeredAt }, index) =>
    answeredAt !== null && isBefore(answeredAt, raisedAt)
      ? [
          `${label}: queries ${index + 1}: answeredAt must not be before raisedAt.`,
        ]
      : [],
  ),
];

/**
 * A denied cashless case can move to reimbursement and keeps its denial as
 * history, so denied authorisations are the only ones allowed here.
 */
const reimbursementErrors = (
  { claimRoute, authorisations, payments }: InsuranceCase,
  label: string,
): string[] => {
  if (claimRoute !== 'reimbursement') {
    return [];
  }

  return [
    ...(payments.length > 0
      ? [`${label}: a reimbursement case must not have payments.`]
      : []),
    ...(authorisations.some(({ decision }) => decision !== 'denied')
      ? [`${label}: a reimbursement case may only keep denied authorisations.`]
      : []),
  ];
};

const validateCase = (
  candidate: unknown,
  label: string,
  seenIds: Set<string>,
): string[] => {
  const shapeErrors = checkCaseShape(candidate, label);
  if (shapeErrors.length > 0) {
    return shapeErrors;
  }

  const insuranceCase = candidate as InsuranceCase;
  const { id, status, claimRoute } = insuranceCase;

  if (seenIds.has(id)) {
    return [`${label}: duplicate id "${id}".`];
  }
  seenIds.add(id);

  if (!STATUSES_BY_ROUTE[claimRoute].includes(status)) {
    return [
      `${label}: status "${status}" is not allowed for a ${claimRoute} case.`,
    ];
  }

  return [
    ...amountErrors(insuranceCase, label),
    ...deductionErrors(insuranceCase, label),
    ...statusEvidenceErrors(insuranceCase, label),
    ...timeErrors(insuranceCase, label),
    ...reimbursementErrors(insuranceCase, label),
  ];
};

export const validateCases = (input: unknown): CaseListResult => {
  if (!Array.isArray(input)) {
    return { ok: false, errors: ['The cases must be a list.'] };
  }

  const seenIds = new Set<string>();
  const errors = input.flatMap((candidate, index) =>
    validateCase(candidate, `Case ${index + 1}`, seenIds),
  );

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, cases: input as InsuranceCase[] };
};
