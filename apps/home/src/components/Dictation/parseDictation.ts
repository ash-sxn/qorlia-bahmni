import { hasDevanagari, normaliseHindiMedicineLine } from './hindiMedicine';

/**
 * Turns a doctor's typed shorthand into a draft note and prescription. It runs in the
 * browser and follows fixed rules: it understands common Indian prescription shorthand,
 * and anything it cannot read is listed for the doctor instead of being guessed.
 */

export const NOTE_SECTIONS = [
  'complaints',
  'findings',
  'diagnosis',
  'advice',
] as const;
export type NoteSection = (typeof NOTE_SECTIONS)[number];
type Section = NoteSection | 'medicines';

export const FREQUENCIES = [
  'OD',
  'BD',
  'TDS',
  'QID',
  'HS',
  'SOS',
  'STAT',
] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const TIMINGS = ['after_food', 'before_food', 'empty_stomach'] as const;
export type Timing = (typeof TIMINGS)[number];

export type DurationUnit = 'day' | 'week' | 'month';

/** Morning, afternoon and night doses as written, for example ["1", "0", "1"]. */
export type DosePattern = readonly [string, string, string];

export interface MedicineLine {
  /** The line as the doctor typed it. */
  raw: string;
  form: string | null;
  name: string;
  strength: string | null;
  pattern: DosePattern | null;
  frequency: Frequency | null;
  duration: { count: number; unit: DurationUnit } | null;
  timing: Timing | null;
  /** What a prescription needs but this line does not say. */
  missing: ('how_often' | 'how_long')[];
}

export interface DictationDraft {
  sections: Record<NoteSection, string>;
  medicines: MedicineLine[];
  /** Lines under the medicines heading that do not read as a medicine. */
  unread: string[];
}

// A heading starts a line and is followed by a colon or a dash, or by a space for the
// short forms doctors write without one (C/o, O/E, Rx, Dx, Adv).
const HEADINGS: [string[], Section][] = [
  [
    [
      'chief complaints',
      'presenting complaints',
      'complaints',
      'complaint',
      'history',
      'c/o',
      'शिकायत',
      'शिकायतें',
      'तकलीफ',
    ],
    'complaints',
  ],
  [
    [
      'on examination',
      'examination',
      'findings',
      'vitals',
      'o/e',
      'जांच',
      'जाँच',
    ],
    'findings',
  ],
  [
    ['provisional diagnosis', 'diagnosis', 'impression', 'dx', 'imp', 'निदान'],
    'diagnosis',
  ],
  [
    [
      'medicines',
      'medications',
      'prescription',
      'rx',
      'दवाइयाँ',
      'दवाइयां',
      'दवाई',
      'दवा',
    ],
    'medicines',
  ],
  [
    [
      'investigations',
      'follow up',
      'follow-up',
      'advice',
      'adv',
      'plan',
      'सलाह',
    ],
    'advice',
  ],
];
const SHORT_FORMS = new Set(['c/o', 'o/e', 'rx', 'dx', 'adv', 'imp']);

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const HEADING_PATTERNS = HEADINGS.flatMap(([words, section]) =>
  words.map((word) => ({
    section,
    pattern: new RegExp(
      `^${escape(word)}(?:\\s*[:\\-–]\\s*|${SHORT_FORMS.has(word) ? '\\s+' : '(?!)'}|\\s*$)`,
      'i',
    ),
  })),
);

const readHeading = (
  line: string,
): { section: Section; rest: string } | null => {
  for (const { section, pattern } of HEADING_PATTERNS) {
    const match = pattern.exec(line);
    if (match) {
      return { section, rest: line.slice(match[0].length).trim() };
    }
  }
  return null;
};

const FORMS: Record<string, string> = {
  tab: 'Tablet',
  tablet: 'Tablet',
  cap: 'Capsule',
  capsule: 'Capsule',
  syp: 'Syrup',
  syrup: 'Syrup',
  susp: 'Suspension',
  inj: 'Injection',
  injection: 'Injection',
  oint: 'Ointment',
  ointment: 'Ointment',
  cream: 'Cream',
  gel: 'Gel',
  drop: 'Drops',
  drops: 'Drops',
  inhaler: 'Inhaler',
  sachet: 'Sachet',
  powder: 'Powder',
};

// Text after a match must end there: a space, punctuation or the end of the line.
// JavaScript's \b does not work next to Devanagari letters, so this is spelt out.
const END = '(?=$|[\\s,.;:)\\]।])';
const DOSE = '(?:\\d+(?:\\.\\d+)?|\\d\\/\\d|½)';
// "250 mg per 5 ml" is one strength: a syrup's concentration.
const STRENGTH = new RegExp(
  `(\\d+(?:\\.\\d+)?)\\s?(mg|mcg|g|ml|iu|%)(?:\\s?(?:\\/|per)\\s?(\\d+(?:\\.\\d+)?)\\s?ml)?${END}`,
  'i',
);
const PATTERN = new RegExp(
  `(${DOSE})\\s?-\\s?(${DOSE})\\s?-\\s?(${DOSE})${END}`,
);
const FREQUENCY_WORDS: [RegExp, Frequency][] = [
  [new RegExp(`(?:^|\\s)(?:od|once (?:a |daily|a day))${END}`, 'i'), 'OD'],
  [new RegExp(`(?:^|\\s)(?:bd|bid|twice (?:a |daily|a day))${END}`, 'i'), 'BD'],
  [
    new RegExp(
      `(?:^|\\s)(?:tds|tid|thrice (?:a |daily|a day)|three times (?:a day|daily))${END}`,
      'i',
    ),
    'TDS',
  ],
  [new RegExp(`(?:^|\\s)(?:qid|four times (?:a day|daily))${END}`, 'i'), 'QID'],
  [new RegExp(`(?:^|\\s)(?:hs|at bedtime|at night)${END}`, 'i'), 'HS'],
  [new RegExp(`(?:^|\\s)(?:sos|prn|when needed|if needed)${END}`, 'i'), 'SOS'],
  [new RegExp(`(?:^|\\s)stat${END}`, 'i'), 'STAT'],
];
const DURATION = new RegExp(
  `(?:^|\\s)(?:x|×|for)?\\s*(\\d+)\\s*(days?|d|din|दिन|weeks?|wks?|w|months?|mo|महीने|महीना)${END}`,
  'i',
);
const TIMING_WORDS: [RegExp, Timing][] = [
  [
    /(?:^|\s)(?:after food|after meals?|af|pc|खाने के बाद)(?=$|[\s,.;)।])/i,
    'after_food',
  ],
  [
    /(?:^|\s)(?:before food|before meals?|bf|ac|खाने से पहले)(?=$|[\s,.;)।])/i,
    'before_food',
  ],
  [/(?:^|\s)(?:empty stomach|खाली पेट)(?=$|[\s,.;)।])/i, 'empty_stomach'],
];

const unitOf = (word: string): DurationUnit => {
  const lower = word.toLowerCase();
  if (/^(w|wk|wks|week|weeks)$/.test(lower)) return 'week';
  if (/^(mo|month|months|महीने|महीना)$/.test(lower)) return 'month';
  return 'day';
};

const firstMatch = <T>(text: string, rules: [RegExp, T][]) => {
  for (const [pattern, value] of rules) {
    const match = pattern.exec(text);
    if (match) return { value, index: match.index };
  }
  return null;
};

// Words that start the dose rather than continue the name ("ORS sachet one litre",
// "Saline nasal two drops").
const NAME_STOPS = new Set([
  ...Object.keys(FORMS),
  'per',
  'zero',
  'half',
  'one',
  'two',
  'three',
  'four',
  'five',
  'ek',
  'do',
  'teen',
  'char',
  'paanch',
  'aadha',
]);

const trimName = (name: string) => {
  const words = name.split(',')[0].trim().split(/\s+/);
  const stop = words.findIndex(
    (word, index) =>
      index > 0 &&
      (NAME_STOPS.has(word.toLowerCase()) ||
        /^\d+(?:\.\d+)?$/.test(word) ||
        // A Hindi instruction after a name the reader turned into English.
        hasDevanagari(word) !== hasDevanagari(words[0])),
  );
  return (stop === -1 ? words : words.slice(0, stop)).join(' ');
};

/** Reads one prescription line. Returns null when the line names no medicine at all. */
export const parseMedicineLine = (line: string): MedicineLine | null => {
  const raw = line.trim();
  const text = normaliseHindiMedicineLine(raw).replace(
    /^(?:\d+[.)]|[-•*])\s*/,
    '',
  );
  const [firstWord = '', ...others] = text.split(/\s+/);
  const form = FORMS[firstWord.toLowerCase().replace(/\.$/, '')] ?? null;
  const rest = form ? others.join(' ') : text;

  const strength = STRENGTH.exec(rest);
  const pattern = PATTERN.exec(rest);
  const frequency = firstMatch(rest, FREQUENCY_WORDS);
  const duration = DURATION.exec(rest);
  const timing = firstMatch(rest, TIMING_WORDS);

  // The name is whatever comes before the first dose, strength or instruction.
  const cut = Math.min(
    ...[
      strength?.index,
      pattern?.index,
      frequency?.index,
      duration?.index,
      timing?.index,
    ].filter((index): index is number => index !== undefined),
    rest.length,
  );
  const name = trimName(
    rest
      .slice(0, cut)
      .replace(/[\s,;:-]+$/, '')
      .trim(),
  );
  if (!name || !/\p{L}/u.test(name)) {
    return null;
  }

  const missing: MedicineLine['missing'] = [];
  if (!pattern && !frequency) missing.push('how_often');
  const needsDuration =
    frequency?.value !== 'SOS' && frequency?.value !== 'STAT';
  if (!duration && needsDuration) missing.push('how_long');

  return {
    raw,
    form,
    name,
    strength: strength
      ? `${strength[1]} ${strength[2].toLowerCase()}${strength[3] ? `/${strength[3]} ml` : ''}`
      : null,
    pattern: pattern ? [pattern[1], pattern[2], pattern[3]] : null,
    frequency: frequency?.value ?? null,
    duration: duration
      ? { count: Number(duration[1]), unit: unitOf(duration[2]) }
      : null,
    timing: timing?.value ?? null,
    missing,
  };
};

/**
 * Splits the dictation by its headings. Text before the first heading counts as
 * complaints, because that is how most dictations begin.
 */
export const parseDictation = (dictation: string): DictationDraft => {
  const collected: Record<Section, string[]> = {
    complaints: [],
    findings: [],
    diagnosis: [],
    medicines: [],
    advice: [],
  };
  let current: Section = 'complaints';

  for (const rawLine of dictation.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const heading = readHeading(line);
    if (heading) {
      current = heading.section;
      if (heading.rest) collected[current].push(heading.rest);
    } else {
      collected[current].push(line);
    }
  }

  const medicines: MedicineLine[] = [];
  const unread: string[] = [];
  for (const line of collected.medicines) {
    const medicine = parseMedicineLine(line);
    if (medicine) medicines.push(medicine);
    else unread.push(line);
  }

  return {
    sections: Object.fromEntries(
      NOTE_SECTIONS.map((section) => [section, collected[section].join('\n')]),
    ) as Record<NoteSection, string>,
    medicines,
    unread,
  };
};

/** Recorded allergies whose name appears in the medicine's name. A prompt to check, not a safety check. */
export const allergyMatches = (
  medicine: MedicineLine,
  allergies: readonly string[],
): string[] =>
  allergies.filter((allergy) => {
    const word = allergy.trim().toLowerCase();
    return word.length >= 3 && medicine.name.toLowerCase().includes(word);
  });

/** An example in the format the page understands. Made up; no real patient. */
export const EXAMPLE_DICTATION = `C/o fever and body ache for 3 days, mild cough
O/E: Temp 101 F, pulse 96, BP 124/80, throat congested, chest clear
Dx: Acute viral fever with pharyngitis
Rx:
1. Tab Paracetamol 650 mg 1-1-1 x 3 days after food
2. Tab Cetirizine 10 mg 0-0-1 x 5 days
3. Syp Ascoril 10 ml TDS for 5 days
4. Tab Ondansetron 4 mg SOS
Adv: Plenty of oral fluids, rest. CBC if fever continues after 3 days. Review after 5 days.`;
