import {
  CatalogueResult,
  Jurisdiction,
  PolicyCategory,
  PolicyEntry,
  ReviewStatus,
} from './types';

const KNOWN_FIELDS: readonly (keyof PolicyEntry)[] = [
  'id',
  'title',
  'authority',
  'jurisdiction',
  'category',
  'summary',
  'applicabilityNote',
  'sourceUrl',
  'publishedOn',
  'effectiveOn',
  'sourceCheckedOn',
  'reviewStatus',
  'reviewedOn',
  'reviewDueOn',
  'reviewer',
];

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TEXT_FIELDS = ['title', 'authority', 'summary'] as const;
const DATE_FIELDS = [
  'publishedOn',
  'effectiveOn',
  'sourceCheckedOn',
  'reviewedOn',
  'reviewDueOn',
] as const;
const REVIEWED_REQUIRED_FIELDS = [
  'reviewedOn',
  'sourceCheckedOn',
  'reviewer',
] as const;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const JURISDICTIONS: readonly Jurisdiction[] = ['central', 'madhya_pradesh'];
const CATEGORIES: readonly PolicyCategory[] = [
  'digital_health',
  'data_protection',
  'government_schemes',
  'facility_registration',
];
const REVIEW_STATUSES: readonly ReviewStatus[] = [
  'draft',
  'reviewed',
  'needs_review',
];

const ALLOWED_VALUES: Record<string, readonly string[]> = {
  jurisdiction: JURISDICTIONS,
  category: CATEGORIES,
  reviewStatus: REVIEW_STATUSES,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCalendarDate = (value: string): boolean => {
  const match = ISO_DATE_PATTERN.exec(value);
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

const isApprovedSourceUrl = (
  value: unknown,
  approvedHosts: readonly string[],
): boolean => {
  if (typeof value !== 'string') {
    return false;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  return (
    url.protocol === 'https:' &&
    url.username === '' &&
    url.password === '' &&
    approvedHosts.includes(url.hostname)
  );
};

export const validateCatalogue = (
  input: unknown,
  approvedHosts: readonly string[],
): CatalogueResult => {
  if (!Array.isArray(input)) {
    return { ok: false, errors: ['The catalogue must be a list of entries.'] };
  }

  const errors: string[] = [];
  const seenIds = new Set<string>();

  input.forEach((entry, index) => {
    const label = `Entry ${index + 1}`;

    if (!isRecord(entry)) {
      errors.push(`${label}: must be an object.`);
      return;
    }
    Object.keys(entry).forEach((key) => {
      if (!(KNOWN_FIELDS as readonly string[]).includes(key)) {
        errors.push(`${label}: unknown field "${key}".`);
      }
    });

    KNOWN_FIELDS.forEach((field) => {
      if (!(field in entry)) {
        errors.push(`${label}: missing field "${field}".`);
      }
    });

    const { id } = entry;
    if (typeof id !== 'string' || !SLUG_PATTERN.test(id)) {
      errors.push(`${label}: id must be a lowercase slug (a-z, 0-9, -).`);
    } else if (seenIds.has(id)) {
      errors.push(`${label}: duplicate id "${id}".`);
    } else {
      seenIds.add(id);
    }

    if (!isApprovedSourceUrl(entry.sourceUrl, approvedHosts)) {
      errors.push(
        `${label}: sourceUrl must be an https link to an approved source host.`,
      );
    }

    TEXT_FIELDS.forEach((field) => {
      const value = entry[field];
      if (typeof value !== 'string' || value.trim() === '') {
        errors.push(`${label}: ${field} must be non-empty text.`);
      }
    });

    Object.entries(ALLOWED_VALUES).forEach(([field, allowed]) => {
      const value = entry[field];
      if (typeof value !== 'string' || !allowed.includes(value)) {
        errors.push(
          `${label}: ${field} "${String(value)}" is not an allowed value.`,
        );
      }
    });

    DATE_FIELDS.forEach((field) => {
      const value = entry[field];
      if (
        value !== null &&
        (typeof value !== 'string' || !isCalendarDate(value))
      ) {
        errors.push(
          `${label}: ${field} must be a YYYY-MM-DD calendar date or null.`,
        );
      }
    });

    if (entry.reviewStatus === 'reviewed') {
      REVIEWED_REQUIRED_FIELDS.forEach((field) => {
        const value = entry[field];
        if (typeof value !== 'string' || value.trim() === '') {
          errors.push(`${label}: a reviewed entry must have ${field}.`);
        }
      });
    }

    const { reviewedOn, reviewDueOn } = entry;
    if (
      typeof reviewedOn === 'string' &&
      typeof reviewDueOn === 'string' &&
      isCalendarDate(reviewedOn) &&
      isCalendarDate(reviewDueOn) &&
      reviewDueOn < reviewedOn
    ) {
      errors.push(`${label}: reviewDueOn must not be before reviewedOn.`);
    }
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, entries: input as PolicyEntry[] };
};
