import { parseDictation } from '../parseDictation';
import { appendSpoken, formatSpokenText } from '../spokenDictation';

describe('formatSpokenText', () => {
  it('puts spoken headings and sentences on their own lines', () => {
    expect(
      formatSpokenText(
        'Chief complaints of fever and body ache for 3 days. On examination temperature 101 F, throat congested. Diagnosis viral fever. Medicines Paracetamol 650 mg twice a day for 5 days after food. Pantoprazole 40 mg once a day before food for 5 days. Advice plenty of fluids, review after 3 days.',
      ),
    ).toBe(
      [
        'Chief complaints: fever and body ache for 3 days',
        'On examination: temperature 101 F, throat congested',
        'Diagnosis: viral fever',
        'Medicines: Paracetamol 650 mg twice a day for 5 days after food',
        'Pantoprazole 40 mg once a day before food for 5 days',
        'Advice: plenty of fluids, review after 3 days',
      ].join('\n'),
    );
  });

  it('finds clear headings even without punctuation', () => {
    expect(
      formatSpokenText('fever for two days diagnosis viral fever advice rest'),
    ).toBe('fever for 2 days\nDiagnosis: viral fever\nAdvice: rest');
  });

  it('leaves everyday words alone inside a sentence', () => {
    expect(formatSpokenText('patient had a full examination last week')).toBe(
      'patient had a full examination last week',
    );
  });

  it('writes spoken dose patterns, durations and milligrams as doctors type them', () => {
    expect(
      formatSpokenText(
        'Tab Amoxicillin 500 milligram one zero one for five days',
      ),
    ).toBe('Tab Amoxicillin 500 mg 1-0-1 for 5 days');
    expect(formatSpokenText('Tab Cetirizine 10 mg 0 0 1 x 5 days')).toBe(
      'Tab Cetirizine 10 mg 0-0-1 x 5 days',
    );
  });

  it('keeps decimal strengths intact', () => {
    expect(formatSpokenText('Tab Clonazepam 0.5 mg at bedtime')).toBe(
      'Tab Clonazepam 0.5 mg at bedtime',
    );
  });

  it('starts a new line when the doctor says next line or next medicine', () => {
    expect(
      formatSpokenText(
        'Paracetamol 650 mg BD x 3 days next medicine Cetirizine 10 mg HS x 3 days',
      ),
    ).toBe('Paracetamol 650 mg BD x 3 days\nCetirizine 10 mg HS x 3 days');
  });

  it('understands Hindi headings', () => {
    expect(formatSpokenText('तीन दिन से बुखार। निदान viral fever।')).toBe(
      'तीन दिन से बुखार।\nनिदान: viral fever।',
    );
  });

  it('returns nothing for silence', () => {
    expect(formatSpokenText('  ')).toBe('');
  });
});

describe('appendSpoken', () => {
  it('adds new speech on a new line', () => {
    expect(
      appendSpoken('Diagnosis: viral fever', 'medicines Dolo 650 SOS'),
    ).toBe('Diagnosis: viral fever\nMedicines: Dolo 650 SOS');
  });

  it('keeps the box unchanged when nothing was heard', () => {
    expect(appendSpoken('C/o fever', '')).toBe('C/o fever');
  });

  it('gives the prescription reader a note it can read', () => {
    const spoken = [
      'Chief complaints of cough and cold for 4 days.',
      'Diagnosis upper respiratory tract infection.',
      'Medicines Tab Azithromycin 500 mg once a day for three days after food.',
      'Syrup Ambroxol 5 ml three times a day for five days.',
      'Advice steam inhalation.',
    ];
    const text = spoken.reduce(appendSpoken, '');
    const draft = parseDictation(text);

    expect(draft.sections.complaints).toContain('cough and cold');
    expect(draft.sections.diagnosis).toContain('respiratory tract infection');
    expect(draft.sections.advice).toContain('steam inhalation');
    expect(draft.medicines).toHaveLength(2);
    expect(draft.medicines[0]).toMatchObject({
      name: 'Azithromycin',
      frequency: 'OD',
      duration: { count: 3, unit: 'day' },
      timing: 'after_food',
      missing: [],
    });
    expect(draft.medicines[1]).toMatchObject({
      frequency: 'TDS',
      duration: { count: 5, unit: 'day' },
    });
    expect(draft.unread).toEqual([]);
  });
});
