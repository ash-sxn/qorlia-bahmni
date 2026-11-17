import { syntheticReferrals } from '../__fixtures__/syntheticReferrals';
import { validateDirectory } from '../validateDirectory';

const TODAY = new Date('2026-11-16T12:00:00Z');
const valid = syntheticReferrals[0];
const errorsFor = (entry: unknown) => {
  const result = validateDirectory([entry], TODAY);
  return result.ok ? [] : result.errors;
};

describe('validateDirectory', () => {
  it('accepts the synthetic directory and an empty one', () => {
    expect(validateDirectory(syntheticReferrals, TODAY)).toEqual({
      ok: true,
      entries: syntheticReferrals,
    });
    expect(validateDirectory([], TODAY)).toEqual({ ok: true, entries: [] });
  });

  it('rejects anything that is not a list of objects', () => {
    expect(validateDirectory({ entries: [] }, TODAY).ok).toBe(false);
    expect(errorsFor('text')).toEqual(['Entry 1: must be an object']);
  });

  it('rejects the whole directory when one entry is wrong', () => {
    const result = validateDirectory(
      [valid, { ...syntheticReferrals[1], phone: '12' }],
      TODAY,
    );

    expect(result.ok).toBe(false);
  });

  it.each([
    [{ id: 'Not A Slug' }, '"id" must be lower-case words joined by hyphens'],
    [{ name: ' ' }, '"name" must be text'],
    [{ speciality: 5 }, '"speciality" must be text'],
    [{ kind: 'clinic' }, '"kind" must be one of doctor, hospital'],
    [{ organisation: null }, 'a doctor needs an "organisation"'],
    [{ timings: '' }, '"timings" must be text or null'],
    [
      { acceptsPmjay: 'maybe' },
      '"acceptsPmjay" must be one of yes, no, unknown',
    ],
    [{ phone: 'call reception' }, '"phone" must be a phone number'],
    [{ phone: '12345' }, '"phone" must be a phone number'],
    [
      { sourceUrl: 'http://example.org' },
      '"sourceUrl" must be an https link or null',
    ],
    [{ verifiedOn: '2026-02-30' }, '"verifiedOn" must be a real date'],
    [{ verifiedOn: '2026-11-17' }, '"verifiedOn" cannot be in the future'],
    [{ verifiedBy: '' }, '"verifiedBy" must be text'],
    [{ rating: 5 }, 'unknown field "rating"'],
  ])('rejects %j', (change, message) => {
    expect(errorsFor({ ...valid, ...change }).join('\n')).toContain(message);
  });

  it('accepts a hospital without an organisation and an https source', () => {
    expect(
      validateDirectory(
        [
          {
            ...valid,
            kind: 'hospital',
            organisation: null,
            sourceUrl: 'https://example.org/hospital',
          },
        ],
        TODAY,
      ).ok,
    ).toBe(true);
  });

  it('rejects an id that is used twice', () => {
    const result = validateDirectory([valid, valid], TODAY);

    expect(result.ok ? [] : result.errors).toEqual([
      `Entry "${valid.id}": the id is used more than once`,
    ]);
  });
});
