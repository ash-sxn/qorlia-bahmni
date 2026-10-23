import { PolicyEntry } from '../types.js';
import { validateCatalogue } from '../validateCatalogue';

const APPROVED_HOSTS = ['www.example.org'];

const validEntry: PolicyEntry = {
  id: 'synthetic-mp-digital-health',
  title: 'Synthetic example: MP digital health record guidance',
  authority: 'Synthetic example authority',
  jurisdiction: 'madhya_pradesh',
  category: 'digital_health',
  summary: 'Synthetic test text. Not real guidance.',
  applicabilityNote: null,
  sourceUrl: 'https://www.example.org/synthetic/mp-digital-health',
  publishedOn: '2026-03-12',
  effectiveOn: null,
  sourceCheckedOn: '2026-10-01',
  reviewStatus: 'reviewed',
  reviewedOn: '2026-10-02',
  reviewDueOn: '2027-04-02',
  reviewer: 'Synthetic reviewer',
};

describe('validateCatalogue', () => {
  it('accepts a valid catalogue', () => {
    const result = validateCatalogue([validEntry], APPROVED_HOSTS);

    expect(result).toEqual({ ok: true, entries: [validEntry] });
  });

  it('rejects a catalogue that is not an array', () => {
    const result = validateCatalogue({ entries: [] }, APPROVED_HOSTS);

    expect(result.ok).toBe(false);
  });
  it('rejects an entry that is not an object', () => {
    const result = validateCatalogue([null], APPROVED_HOSTS);

    expect(result).toEqual({
      ok: false,
      errors: ['Entry 1: must be an object.'],
    });
  });

  it('rejects an id that is not a lowercase slug', () => {
    const result = validateCatalogue(
      [{ ...validEntry, id: 'Bad ID!' }],
      APPROVED_HOSTS,
    );

    expect(result).toEqual({
      ok: false,
      errors: ['Entry 1: id must be a lowercase slug (a-z, 0-9, -).'],
    });
  });

  it('rejects duplicate ids', () => {
    const result = validateCatalogue([validEntry, validEntry], APPROVED_HOSTS);

    expect(result).toEqual({
      ok: false,
      errors: ['Entry 2: duplicate id "synthetic-mp-digital-health".'],
    });
  });

  it.each([
    ['text that is not a url', 'not-a-url'],
    ['http instead of https', 'http://www.example.org/x'],
    ['a look-alike host', 'https://www.example.org.fake.com/x'],
    ['a javascript url', 'javascript:alert(1)'],
    ['a username and password', 'https://user:pass@www.example.org/x'],
  ])('rejects a source url with %s', (_case, sourceUrl) => {
    const result = validateCatalogue(
      [{ ...validEntry, sourceUrl }],
      APPROVED_HOSTS,
    );

    expect(result).toEqual({
      ok: false,
      errors: [
        'Entry 1: sourceUrl must be an https link to an approved source host.',
      ],
    });
  });

  it.each(['title', 'authority', 'summary'])('rejects an empty %s', (field) => {
    const result = validateCatalogue(
      [{ ...validEntry, [field]: '   ' }],
      APPROVED_HOSTS,
    );

    expect(result).toEqual({
      ok: false,
      errors: [`Entry 1: ${field} must be non-empty text.`],
    });
  });

  it.each([
    ['jurisdiction', 'delhi'],
    ['category', 'sports'],
    ['reviewStatus', 'reviwed'],
  ])('rejects an unknown %s value', (field, value) => {
    const result = validateCatalogue(
      [{ ...validEntry, [field]: value }],
      APPROVED_HOSTS,
    );

    expect(result).toEqual({
      ok: false,
      errors: [`Entry 1: ${field} "${value}" is not an allowed value.`],
    });
  });
  it.each([
    ['an impossible day', '2026-02-30'],
    ['an impossible month', '2026-13-01'],
    ['29 February in a non-leap year', '2026-02-29'],
    ['a day-first format', '12/03/2026'],
    ['a time as well as a date', '2026-03-12T10:00:00Z'],
  ])('rejects a publishedOn date with %s', (_case, publishedOn) => {
    const result = validateCatalogue(
      [{ ...validEntry, publishedOn }],
      APPROVED_HOSTS,
    );

    expect(result).toEqual({
      ok: false,
      errors: [
        'Entry 1: publishedOn must be a YYYY-MM-DD calendar date or null.',
      ],
    });
  });

  it('accepts 29 February in a leap year', () => {
    const result = validateCatalogue(
      [{ ...validEntry, publishedOn: '2028-02-29' }],
      APPROVED_HOSTS,
    );

    expect(result.ok).toBe(true);
  });
});
