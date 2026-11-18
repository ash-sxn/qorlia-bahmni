/**
 * Checks a medicine line written by the AI tidy against what the doctor actually
 * said. The tidy may only rewrite; anything on the line that cannot be found in the
 * part of the dictation about that medicine is reported, so the doctor looks at it.
 */
import type { MedicineLine } from './parseDictation';

export type UnsupportedPart =
  | 'name'
  | 'strength'
  | 'how_often'
  | 'how_long'
  | 'when';

const NUMBER_WORDS: Record<string, string[]> = {
  '1': ['one', 'ek', 'एक', 'once'],
  '2': ['two', 'do', 'दो', 'twice'],
  '3': ['three', 'teen', 'तीन', 'thrice'],
  '4': ['four', 'char', 'chaar', 'चार'],
  '5': ['five', 'paanch', 'panch', 'पांच', 'पाँच'],
  '6': ['six', 'chhe', 'che', 'chah', 'छह', 'छः'],
  '7': ['seven', 'saat', 'सात'],
  '8': ['eight', 'aath', 'आठ'],
  '9': ['nine', 'nau', 'नौ'],
  '10': ['ten', 'das', 'दस'],
  '14': ['fourteen', 'chaudah', 'चौदह'],
  '15': ['fifteen', 'pandrah', 'पंद्रह'],
  '20': ['twenty', 'bees', 'बीस'],
  '30': ['thirty', 'tees', 'तीस'],
};

const WHEN_WORDS: Record<string, RegExp> = {
  after_food:
    /after (food|meals?|breakfast|lunch|dinner)|khane ke baad|khana khane ke baad|nashte ke baad|naashte ke baad|खाने के बाद/iu,
  before_food:
    /before (food|meals?|breakfast|lunch|dinner)|khane se pehle|naashte se pehle|nashte se pehle|खाने से पहले/iu,
  empty_stomach: /empty stomach|khali pet|खाली पेट/iu,
};

// The stretch is compared as words, so a spoken 1-0-1 reads "1 0 1" here.
const HOW_OFTEN_WORDS =
  /\b\d+ \d+ \d+\b|\b(od|bd|bid|tds|tid|qid|hs|sos|stat)\b|once|twice|thrice|times|daily|morning|afternoon|evening|night|bedtime|needed|subah|shaam|sham|dopahar|raat|baar|roz|jab|zarurat|turant|सुबह|शाम|रात|बार|रोज़|रोज/iu;

const DURATION_WORDS =
  /days?|weeks?|months?|din|hafte|hafta|mahine|mahina|दिन|हफ्ते|महीने/iu;

const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

const distance = (a: string, b: string) => {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previous = current;
    }
  }
  return row[b.length];
};

/** Where in the dictation a name was said, allowing small speech-recognition slips. */
const findName = (name: string, said: string[]) => {
  const target = words(name).join('');
  if (!target) return -1;
  const allowed = Math.max(1, Math.floor(target.length / 4));
  for (let index = 0; index < said.length; index++) {
    for (const span of [1, 2]) {
      const candidate = said.slice(index, index + span).join('');
      if (candidate && distance(candidate, target) <= allowed) return index;
    }
  }
  return -1;
};

const hasNumber = (value: string, segment: string[]) =>
  segment.some(
    (word) =>
      word === value ||
      word.replace(/\D/g, '') === value ||
      (NUMBER_WORDS[value] ?? []).includes(word),
  );

/**
 * Compares each medicine line with the stretch of the dictation that starts where
 * that medicine was named and ends at the next medicine or the end of the sentence.
 */
export const checkAgainstDictation = (
  medicines: MedicineLine[],
  dictation: string,
): UnsupportedPart[][] => {
  const said = words(dictation);
  const starts = medicines.map(({ name }) => findName(name, said));
  // Sentence ends, as word positions, so a stretch does not run into the advice.
  const sentenceEnds: number[] = [];
  let position = 0;
  for (const piece of dictation.toLowerCase().split(/([.।\n])/u)) {
    if (/^[.।\n]$/u.test(piece)) sentenceEnds.push(position);
    else position += words(piece).length;
  }

  return medicines.map((medicine, index) => {
    const start = starts[index];
    if (start < 0) return ['name'];
    const end = Math.min(
      ...starts.filter((other) => other > start),
      ...sentenceEnds.filter((stop) => stop > start),
      said.length,
    );
    const segment = said.slice(start, end);
    const stretch = segment.join(' ');
    const problems: UnsupportedPart[] = [];

    const strength = medicine.strength?.match(/\d+(?:\.\d+)?/)?.[0];
    if (strength && !hasNumber(strength.replace(/\.0+$/, ''), segment)) {
      problems.push('strength');
    }
    if (
      (medicine.pattern || medicine.frequency) &&
      !HOW_OFTEN_WORDS.test(stretch)
    ) {
      problems.push('how_often');
    }
    if (
      medicine.duration &&
      (!DURATION_WORDS.test(stretch) ||
        !hasNumber(String(medicine.duration.count), segment))
    ) {
      problems.push('how_long');
    }
    if (medicine.timing && !WHEN_WORDS[medicine.timing].test(stretch)) {
      problems.push('when');
    }
    return problems;
  });
};
