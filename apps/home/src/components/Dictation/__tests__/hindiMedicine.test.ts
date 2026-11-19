import { normaliseHindiMedicineLine } from '../hindiMedicine';
import { parseMedicineLine } from '../parseDictation';

describe('normaliseHindiMedicineLine', () => {
  it('leaves lines without Devanagari alone', () => {
    expect(normaliseHindiMedicineLine('Tab Paracetamol 650 mg 1-0-1')).toBe(
      'Tab Paracetamol 650 mg 1-0-1',
    );
  });

  it('writes form, name, dose pattern, duration and timing as shorthand', () => {
    expect(
      normaliseHindiMedicineLine(
        'टैबलेट सेफ़िक्सिम 200 mg एक शून्य एक, चौदह दिन, खाने के बाद।',
      ),
    ).toBe('Tab Cefixime 200 mg 1-0-1, x 14 days, after food।');
  });

  it('reads how often, and keeps a daily limit from looking like a frequency', () => {
    const line = parseMedicineLine(
      'सिरप पैरासिटामोल 250 mg per 5 ml, 5 ml, ज़रूरत पड़ने पर, दिन में चार बार से ज़्यादा नहीं।',
    );
    expect(line).toMatchObject({
      name: 'Paracetamol',
      strength: '250 mg/5 ml',
      frequency: 'SOS',
    });
  });

  it('leaves a medicine it does not know in Hindi for the doctor to correct', () => {
    const line = parseMedicineLine('टैबलेट नयादवा 10 mg एक शून्य एक, पांच दिन');
    expect(line).toMatchObject({
      form: 'Tablet',
      name: 'नयादवा',
      pattern: ['1', '0', '1'],
      duration: { count: 5, unit: 'day' },
    });
  });

  it('reads a month and weeks', () => {
    expect(
      parseMedicineLine('टैबलेट मेटफ़ॉर्मिन 500 mg एक शून्य एक, एक महीना')
        ?.duration,
    ).toEqual({ count: 1, unit: 'month' });
    expect(
      parseMedicineLine('टैबलेट जिंक 20 mg एक शून्य शून्य, दो हफ़्ते')
        ?.duration,
    ).toEqual({ count: 2, unit: 'week' });
  });
});
