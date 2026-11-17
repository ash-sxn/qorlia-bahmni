import { EntryKind, ReferralEntry } from './types';

export interface ReferralFilters {
  query: string;
  speciality: string | 'all';
  kind: EntryKind | 'all';
}

export const DEFAULT_FILTERS: ReferralFilters = {
  query: '',
  speciality: 'all',
  kind: 'all',
};

/** The specialities present in the directory, in alphabetical order. */
export const specialities = (entries: readonly ReferralEntry[]): string[] =>
  [...new Set(entries.map(({ speciality }) => speciality))].sort((a, b) =>
    a.localeCompare(b),
  );

/** Every word typed must appear somewhere in the name, speciality, organisation, city or district. */
export const filterReferrals = (
  entries: readonly ReferralEntry[],
  { query, speciality, kind }: ReferralFilters,
): ReferralEntry[] => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);

  return entries.filter((entry) => {
    if (speciality !== 'all' && entry.speciality !== speciality) return false;
    if (kind !== 'all' && entry.kind !== kind) return false;
    const text = [
      entry.name,
      entry.speciality,
      entry.organisation,
      entry.city,
      entry.district,
    ]
      .join(' ')
      .toLowerCase();
    return words.every((word) => text.includes(word));
  });
};

/** By speciality, then by name. */
export const sortReferrals = (
  entries: readonly ReferralEntry[],
): ReferralEntry[] =>
  [...entries].sort(
    (a, b) =>
      a.speciality.localeCompare(b.speciality) || a.name.localeCompare(b.name),
  );
