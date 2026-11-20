/**
 * Speech comes back as running sentences, while the dictation reader expects one
 * heading or medicine per line. These rules put the spoken headings and sentences on
 * their own lines and write spoken numbers the way doctors type them. They only
 * change layout and number words; the doctor still sees and can edit everything.
 */

// Headings a doctor would not say in the middle of a sentence start a new line anywhere.
const CLEAR_HEADINGS = [
  'chief complaints?(?: of)?',
  'presenting complaints?(?: of)?',
  'on examination',
  'provisional diagnosis',
  'diagnosis',
  'prescription',
  'advice',
  'शिकायतें',
  'शिकायत',
  'निदान',
  'दवाइयाँ',
  'दवाइयां',
  'सलाह',
];
// These words also appear inside sentences, so they count only after a full stop or comma.
const OTHER_HEADINGS = [
  'complaints?(?: of)?',
  'examination',
  'findings',
  'vitals',
  'impression',
  'investigations',
  'follow up',
  // "Do not stop medicines on your own" is advice, not a new heading.
  'medicines',
  'medications',
  'तकलीफ',
  'जांच',
  'जाँच',
  'दवाई',
];

const AFTER = '(?=[\\s:.,\\-–]|$)[\\s:.,\\-–]*';
const CLEAR_HEADING = new RegExp(
  `(^|[.!?।,;]?\\s+|\\n)(${CLEAR_HEADINGS.join('|')})${AFTER}`,
  'giu',
);
const OTHER_HEADING = new RegExp(
  `(^|[.!?।,;]\\s*|\\n)(${OTHER_HEADINGS.join('|')})${AFTER}`,
  'giu',
);

const LINE_BREAK =
  /\s*\b(?:new line|next line|next medicine)\b[.,:;-]?\s*|\s*(?:नई लाइन|अगली दवा|अगली दवाई)[.,:;।-]?\s*/giu;

// Sentence ends, but not decimal points such as 0.5 mg.
const SENTENCE_END = /([.!?।])\s+(?=\S)/gu;

const NUMBER_WORDS: Record<string, string> = {
  zero: '0',
  half: '½',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  fourteen: '14',
  fifteen: '15',
  twenty: '20',
  thirty: '30',
};
const NUMBER_WORD = Object.keys(NUMBER_WORDS).join('|');

// "one zero one" and "1 0 1" are the morning-afternoon-night dose pattern.
const DOSE_WORDS = new RegExp(
  `\\b(zero|half|one|two) (zero|half|one|two) (zero|half|one|two)\\b`,
  'giu',
);
const DOSE_DIGITS =
  /(^|[^\d.])([0-2](?:\.5)?|½) ([0-2](?:\.5)?|½) ([0-2](?:\.5)?|½)(?![\d.])/gu;
const DURATION_WORDS = new RegExp(
  `\\b(${NUMBER_WORD}) (days?|weeks?|months?)\\b`,
  'giu',
);
const MILLIGRAM = /(\d)\s*(?:milligrams?|mgs?)\b\.?/giu;

const capitalise = (word: string) =>
  word.charAt(0).toLocaleUpperCase() + word.slice(1);

const startHeading = (_: string, lead: string, heading: string) =>
  `${/[.!?।]/.test(lead) ? lead.trim() : ''}\n${capitalise(
    heading.replace(/ of$/i, ''),
  )}: `;

/** Lays out one piece of transcribed speech for the dictation reader. */
export const formatSpokenText = (spoken: string): string => {
  let text = spoken.replace(/\s+/g, ' ').trim();
  if (!text) return '';

  text = text
    .replace(DOSE_WORDS, (_, a: string, b: string, c: string) =>
      [a, b, c].map((word) => NUMBER_WORDS[word.toLowerCase()]).join('-'),
    )
    .replace(
      DOSE_DIGITS,
      (_, lead: string, a: string, b: string, c: string) =>
        `${lead}${a}-${b}-${c}`,
    )
    .replace(
      DURATION_WORDS,
      (_, count: string, unit: string) =>
        `${NUMBER_WORDS[count.toLowerCase()]} ${unit}`,
    )
    .replace(MILLIGRAM, '$1 mg');

  text = text
    .replace(LINE_BREAK, '\n')
    .replace(SENTENCE_END, '$1\n')
    .replace(CLEAR_HEADING, startHeading)
    .replace(OTHER_HEADING, startHeading);

  return text
    .split('\n')
    .map((line) => line.trim().replace(/[.,;]$/, ''))
    .filter(Boolean)
    .join('\n');
};

/** Adds a new piece of speech to what is already in the box, on a new line. */
export const appendSpoken = (current: string, spoken: string): string => {
  const addition = formatSpokenText(spoken);
  if (!addition) return current;
  if (!current.trim()) return addition;
  return `${current.replace(/\s+$/, '')}\n${addition}`;
};
