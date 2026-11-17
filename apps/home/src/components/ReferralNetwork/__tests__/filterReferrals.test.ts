import { syntheticReferrals } from '../__fixtures__/syntheticReferrals';
import {
  DEFAULT_FILTERS,
  filterReferrals,
  sortReferrals,
  specialities,
} from '../filterReferrals';

const ids = (entries: { id: string }[]) => entries.map(({ id }) => id);

describe('filterReferrals', () => {
  it('returns everything with the default filters', () => {
    expect(filterReferrals(syntheticReferrals, DEFAULT_FILTERS)).toHaveLength(
      syntheticReferrals.length,
    );
  });

  it('needs every typed word, in any of name, speciality, organisation or city', () => {
    expect(
      ids(
        filterReferrals(syntheticReferrals, {
          ...DEFAULT_FILTERS,
          query: '  gwalior   EYE ',
        }),
      ),
    ).toEqual(['example-eye-hospital-gwalior']);
  });

  it('filters by speciality and by doctor or hospital', () => {
    expect(
      ids(
        filterReferrals(syntheticReferrals, {
          ...DEFAULT_FILTERS,
          speciality: 'Cardiology',
        }),
      ),
    ).toEqual(['example-cardiologist-gwalior']);
    expect(
      filterReferrals(syntheticReferrals, {
        ...DEFAULT_FILTERS,
        kind: 'hospital',
      }).every(({ kind }) => kind === 'hospital'),
    ).toBe(true);
  });
});

describe('specialities and sortReferrals', () => {
  it('lists each speciality once, alphabetically', () => {
    const list = specialities(syntheticReferrals);

    expect(list).toEqual([...new Set(list)].sort());
    expect(list).toContain('Ophthalmology');
  });

  it('sorts by speciality, then by name', () => {
    const sorted = sortReferrals(syntheticReferrals);

    expect(sorted[0].speciality).toBe('Cardiology');
    expect(sorted.map(({ speciality }) => speciality)).toEqual(
      sorted.map(({ speciality }) => speciality).sort(),
    );
  });
});
