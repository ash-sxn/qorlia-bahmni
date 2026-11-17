import {
  DirectoryResult,
  ENTRY_KINDS,
  PMJAY_ANSWERS,
  ReferralEntry,
} from './types';

const KNOWN_FIELDS: readonly (keyof ReferralEntry)[] = [
  'id',
  'name',
  'kind',
  'speciality',
  'organisation',
  'city',
  'district',
  'phone',
  'timings',
  'acceptsPmjay',
  'sourceUrl',
  'verifiedOn',
  'verifiedBy',
];
const REQUIRED_TEXT = [
  'name',
  'speciality',
  'city',
  'district',
  'verifiedBy',
] as const;
const OPTIONAL_TEXT = ['organisation', 'timings'] as const;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Digits with optional +, spaces and hyphens: 7 to 15 digits in all. */
const PHONE_PATTERN = /^\+?[0-9][0-9 -]*$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

const isCalendarDate = (value: unknown): value is string => {
  const match = typeof value === 'string' && ISO_DATE_PATTERN.exec(value);
  if (!match) {
    return false;
  }
  const [year, month, day] = [match[1], match[2], match[3]].map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const isPhone = (value: unknown): boolean => {
  if (typeof value !== 'string' || !PHONE_PATTERN.test(value)) {
    return false;
  }
  const digits = value.replace(/\D/g, '').length;
  return digits >= 7 && digits <= 15;
};

const isHttpsUrl = (value: unknown): boolean => {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

const entryErrors = (
  entry: Record<string, unknown>,
  label: string,
  today: string,
): string[] => {
  const errors: string[] = [];
  const fail = (message: string) => errors.push(`${label}: ${message}`);

  for (const field of Object.keys(entry)) {
    if (!KNOWN_FIELDS.includes(field as keyof ReferralEntry)) {
      fail(`unknown field "${field}"`);
    }
  }
  for (const field of REQUIRED_TEXT) {
    if (!isText(entry[field])) {
      fail(`"${field}" must be text`);
    }
  }
  for (const field of OPTIONAL_TEXT) {
    if (entry[field] !== null && !isText(entry[field])) {
      fail(`"${field}" must be text or null`);
    }
  }
  if (!ENTRY_KINDS.includes(entry.kind as never)) {
    fail(`"kind" must be one of ${ENTRY_KINDS.join(', ')}`);
  }
  if (entry.kind === 'doctor' && !isText(entry.organisation)) {
    fail('a doctor needs an "organisation" (the hospital or clinic)');
  }
  if (!PMJAY_ANSWERS.includes(entry.acceptsPmjay as never)) {
    fail(`"acceptsPmjay" must be one of ${PMJAY_ANSWERS.join(', ')}`);
  }
  if (!isPhone(entry.phone)) {
    fail('"phone" must be a phone number with 7 to 15 digits');
  }
  if (entry.sourceUrl !== null && !isHttpsUrl(entry.sourceUrl)) {
    fail('"sourceUrl" must be an https link or null');
  }
  if (!isCalendarDate(entry.verifiedOn)) {
    fail('"verifiedOn" must be a real date as YYYY-MM-DD');
  } else if (entry.verifiedOn > today) {
    fail('"verifiedOn" cannot be in the future');
  }
  return errors;
};

/**
 * Checks the directory before anything is shown. One bad entry rejects the whole
 * directory: a wrong phone number or an unverified entry must not reach a referral.
 */
export const validateDirectory = (
  data: unknown,
  today: Date = new Date(),
): DirectoryResult => {
  if (!Array.isArray(data)) {
    return { ok: false, errors: ['The directory must be a list of entries.'] };
  }

  const todayIso = today.toISOString().slice(0, 10);
  const errors: string[] = [];
  const seen = new Set<string>();

  data.forEach((entry, index) => {
    if (!isRecord(entry)) {
      errors.push(`Entry ${index + 1}: must be an object`);
      return;
    }
    const id = entry.id;
    const label = isText(id) ? `Entry "${id}"` : `Entry ${index + 1}`;
    if (!isText(id) || !SLUG_PATTERN.test(id)) {
      errors.push(`${label}: "id" must be lower-case words joined by hyphens`);
    } else if (seen.has(id)) {
      errors.push(`${label}: the id is used more than once`);
    } else {
      seen.add(id);
    }
    errors.push(...entryErrors(entry, label, todayIso));
  });

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, entries: data as ReferralEntry[] };
};
