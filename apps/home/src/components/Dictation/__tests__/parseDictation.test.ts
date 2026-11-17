import {
  allergyMatches,
  EXAMPLE_DICTATION,
  parseDictation,
  parseMedicineLine,
} from '../parseDictation';

describe('parseMedicineLine', () => {
  it('reads form, name, strength, dose pattern, duration and timing', () => {
    expect(
      parseMedicineLine('1. Tab Paracetamol 650 mg 1-0-1 x 5 days after food'),
    ).toEqual({
      raw: '1. Tab Paracetamol 650 mg 1-0-1 x 5 days after food',
      form: 'Tablet',
      name: 'Paracetamol',
      strength: '650 mg',
      pattern: ['1', '0', '1'],
      frequency: null,
      duration: { count: 5, unit: 'day' },
      timing: 'after_food',
      missing: [],
    });
  });

  it.each([
    ['Syp Ascoril 10 ml TDS for 5 days', 'TDS', { count: 5, unit: 'day' }],
    [
      'Cap Omeprazole 20 mg OD x 2 weeks before food',
      'OD',
      { count: 2, unit: 'week' },
    ],
    ['Tab Metformin 500 mg BD for 1 month', 'BD', { count: 1, unit: 'month' }],
    [
      'Tab Amlodipine 5 mg once a day 30 days',
      'OD',
      { count: 30, unit: 'day' },
    ],
    ['Tab Cetirizine 10 mg HS 5 दिन', 'HS', { count: 5, unit: 'day' }],
  ])('reads the frequency and duration of %j', (line, frequency, duration) => {
    expect(parseMedicineLine(line)).toMatchObject({
      frequency,
      duration,
      missing: [],
    });
  });

  it('reads half-tablet patterns', () => {
    expect(
      parseMedicineLine('Tab Propranolol 40 mg 1/2-0-1/2 x 1 month')?.pattern,
    ).toEqual(['1/2', '0', '1/2']);
  });

  it('needs no duration for a when-needed or one-off medicine', () => {
    expect(parseMedicineLine('Tab Ondansetron 4 mg SOS')).toMatchObject({
      name: 'Ondansetron',
      frequency: 'SOS',
      missing: [],
    });
    expect(parseMedicineLine('Inj Diclofenac 75 mg stat')?.missing).toEqual([]);
  });

  it('says what is missing instead of guessing', () => {
    expect(parseMedicineLine('Tab Azithromycin 500 mg')).toMatchObject({
      name: 'Azithromycin',
      missing: ['how_often', 'how_long'],
    });
    expect(parseMedicineLine('Tab Azithromycin 500 mg OD')?.missing).toEqual([
      'how_long',
    ]);
  });

  it('keeps a medicine without a form word, and does not take mg as months', () => {
    expect(
      parseMedicineLine('Pantoprazole 40 mg 1-0-0 x 7 days'),
    ).toMatchObject({
      form: null,
      name: 'Pantoprazole',
      strength: '40 mg',
      duration: { count: 7, unit: 'day' },
    });
  });

  it('does not mistake letters inside a name for an instruction', () => {
    expect(parseMedicineLine('Tab Ondansetron 4 mg 1-0-1 x 2 days')?.name).toBe(
      'Ondansetron',
    );
  });

  it('returns null for a line that names no medicine', () => {
    expect(parseMedicineLine('x 5 days')).toBeNull();
    expect(parseMedicineLine('1-0-1')).toBeNull();
  });
});

describe('parseDictation', () => {
  it('splits the example into note sections and medicines', () => {
    const draft = parseDictation(EXAMPLE_DICTATION);

    expect(draft.sections.complaints).toBe(
      'fever and body ache for 3 days, mild cough',
    );
    expect(draft.sections.findings).toMatch(/^Temp 101 F/);
    expect(draft.sections.diagnosis).toBe('Acute viral fever with pharyngitis');
    expect(draft.sections.advice).toMatch(/^Plenty of oral fluids/);
    expect(draft.medicines.map(({ name }) => name)).toEqual([
      'Paracetamol',
      'Cetirizine',
      'Ascoril',
      'Ondansetron',
    ]);
    expect(draft.unread).toEqual([]);
  });

  it('understands Hindi headings and full words', () => {
    const draft = parseDictation(
      'शिकायत: 2 दिन से बुखार\nनिदान - Viral fever\nदवा:\nTab Paracetamol 500 mg 1-1-1 x 2 days\nसलाह: आराम करें',
    );

    expect(draft.sections).toEqual({
      complaints: '2 दिन से बुखार',
      findings: '',
      diagnosis: 'Viral fever',
      advice: 'आराम करें',
    });
    expect(draft.medicines).toHaveLength(1);
  });

  it('treats text before any heading as complaints, and keeps several lines', () => {
    const draft = parseDictation(
      'Headache since morning\nNo vomiting\nDiagnosis: Tension headache',
    );

    expect(draft.sections.complaints).toBe(
      'Headache since morning\nNo vomiting',
    );
  });

  it('does not take an ordinary sentence for a heading', () => {
    const draft = parseDictation(
      'History of diabetes for 5 years\nPlan to review',
    );

    expect(draft.sections.complaints).toBe(
      'History of diabetes for 5 years\nPlan to review',
    );
    expect(draft.sections.advice).toBe('');
  });

  it('lists lines under Rx that are not medicines', () => {
    const draft = parseDictation(
      'Rx:\nTab Paracetamol 650 mg SOS\n--\nx 5 days',
    );

    expect(draft.medicines).toHaveLength(1);
    expect(draft.unread).toEqual(['--', 'x 5 days']);
  });

  it('returns an empty draft for empty text', () => {
    expect(parseDictation('  \n ')).toEqual({
      sections: { complaints: '', findings: '', diagnosis: '', advice: '' },
      medicines: [],
      unread: [],
    });
  });
});

describe('allergyMatches', () => {
  it('flags a recorded allergy named in the medicine, ignoring case', () => {
    const medicine = parseMedicineLine('Cap Amoxicillin 500 mg TDS x 5 days')!;

    expect(allergyMatches(medicine, ['amoxicillin', 'Dust'])).toEqual([
      'amoxicillin',
    ]);
    expect(allergyMatches(medicine, ['Penicillin'])).toEqual([]);
  });
});
