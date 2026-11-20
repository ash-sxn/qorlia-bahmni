import samples from '../__fixtures__/issue38Samples.json';
import { parseDictation } from '../parseDictation';
import { appendSpoken } from '../spokenDictation';

interface Comparable {
  name?: string | null;
  strength?: string | null;
  pattern?: readonly string[] | null;
  frequency?: string | null;
  duration?: { count: number; unit: string } | null;
  timing?: string | null;
}

/** What a prescription line must get right; the form's spelling is left out. */
const essentials = (medicine: Comparable) => ({
  name: medicine.name?.toLowerCase(),
  strength: medicine.strength ?? null,
  pattern: medicine.pattern ?? null,
  frequency: medicine.frequency ?? null,
  duration: medicine.duration ?? null,
  timing: medicine.timing ?? null,
});

// Aniket's 20 synthetic dictations from issue #38: English, Hinglish and Hindi.
describe.each(samples.samples.map((sample) => [sample.id, sample] as const))(
  'issue #38 sample %s',
  (_id, sample) => {
    it('reads every medicine the doctor dictated', () => {
      const draft = parseDictation(appendSpoken('', sample.dictation));
      expect(draft.medicines.map(essentials)).toEqual(
        sample.medicines.map(essentials),
      );
    });
  },
);
