/**
 * Rewrites a prescription line spoken or typed in Hindi (Devanagari) into the
 * shorthand the prescription reader understands: form, English medicine name,
 * dose pattern, how often, how long and when. Words it does not know are left as
 * they are, so the doctor sees them and corrects the line.
 */

const DEVANAGARI = /[ऀ-ॿ]/;

/** Spelling differences that do not change a word: nukta, and the candrabindu/anusvara pair. */
const fold = (text: string) =>
  text.normalize('NFC').replace(/़/g, '').replace(/ँ/g, 'ं');

const NUMBERS: Record<string, string> = {
  शून्य: '0',
  ज़ीरो: '0',
  आधा: '½',
  आधी: '½',
  एक: '1',
  दो: '2',
  तीन: '3',
  चार: '4',
  पांच: '5',
  पाँच: '5',
  छह: '6',
  छः: '6',
  सात: '7',
  आठ: '8',
  नौ: '9',
  दस: '10',
  ग्यारह: '11',
  बारह: '12',
  चौदह: '14',
  पंद्रह: '15',
  बीस: '20',
  इक्कीस: '21',
  तीस: '30',
  पैंतालीस: '45',
  साठ: '60',
  नब्बे: '90',
};
const NUMBER_WORD = Object.keys(NUMBERS)
  .map(fold)
  .sort((a, b) => b.length - a.length)
  .join('|');
const numberOf = (word: string) =>
  NUMBERS[word] ??
  Object.entries(NUMBERS).find(([key]) => fold(key) === fold(word))?.[1] ??
  word;

/** Form words, written the way the reader expects them. */
const FORMS: [string, string][] = [
  ['नेजल ड्रॉप', 'Drops'],
  ['नेजल ड्रॉप्स', 'Drops'],
  ['आई ड्रॉप', 'Drops'],
  ['ड्रॉप्स', 'Drops'],
  ['ड्रॉप', 'Drops'],
  ['टैबलेट', 'Tab'],
  ['टेबलेट', 'Tab'],
  ['टेबलट', 'Tab'],
  ['गोली', 'Tab'],
  ['कैप्सूल', 'Cap'],
  ['सिरप', 'Syrup'],
  ['इंजेक्शन', 'Inj'],
  ['मलहम', 'Ointment'],
  ['क्रीम', 'Cream'],
  ['पाउडर', 'Powder'],
  ['सैशे', 'Sachet'],
];

/**
 * Common medicines in Devanagari, longest first so "कैल्शियम विटामिन डी3" wins
 * over "कैल्शियम". Spelling is compared without nukta.
 */
const MEDICINES: [string, string][] = [
  ['आयरन फोलिक एसिड', 'Iron folic acid'],
  ['कैल्शियम विटामिन डी3', 'Calcium with vitamin D3'],
  ['कैल्शियम विटामिन डी', 'Calcium with vitamin D3'],
  ['बी कॉम्प्लेक्स', 'B complex'],
  ['विटामिन डी3', 'Vitamin D3'],
  ['फोलिक एसिड', 'Folic acid'],
  ['सलाइन', 'Saline nasal'],
  ['सेफिक्सिम', 'Cefixime'],
  ['सेफिक्साइम', 'Cefixime'],
  ['पैरासिटामोल', 'Paracetamol'],
  ['पेरासिटामोल', 'Paracetamol'],
  ['डोलो', 'Dolo'],
  ['क्रोसिन', 'Crocin'],
  ['मेटफॉर्मिन', 'Metformin'],
  ['मेटफार्मिन', 'Metformin'],
  ['ग्लिमेपिराइड', 'Glimepiride'],
  ['ग्लिमिपिराइड', 'Glimepiride'],
  ['एम्लोडिपिन', 'Amlodipine'],
  ['एम्लोडिपीन', 'Amlodipine'],
  ['टेल्मिसार्टन', 'Telmisartan'],
  ['लोसार्टन', 'Losartan'],
  ['मेटोप्रोलोल', 'Metoprolol'],
  ['एटोरवास्टेटिन', 'Atorvastatin'],
  ['रोसुवास्टेटिन', 'Rosuvastatin'],
  ['एस्पिरिन', 'Aspirin'],
  ['इकोस्प्रिन', 'Ecosprin'],
  ['क्लोपिडोग्रेल', 'Clopidogrel'],
  ['इंसुलिन', 'Insulin'],
  ['ओआरएस', 'ORS'],
  ['ओ आर एस', 'ORS'],
  ['जिंक', 'Zinc'],
  ['आयरन', 'Iron'],
  ['कैल्शियम', 'Calcium'],
  ['एसिक्लोफेनेक', 'Aceclofenac'],
  ['एसीक्लोफेनाक', 'Aceclofenac'],
  ['डाइक्लोफेनेक', 'Diclofenac'],
  ['आइबुप्रोफेन', 'Ibuprofen'],
  ['पैंटोप्राजोल', 'Pantoprazole'],
  ['पैन्टोप्राजोल', 'Pantoprazole'],
  ['ओमेप्राजोल', 'Omeprazole'],
  ['रैबेप्राजोल', 'Rabeprazole'],
  ['डोम्पेरिडोन', 'Domperidone'],
  ['ओंडानसेट्रॉन', 'Ondansetron'],
  ['सेट्रिजिन', 'Cetirizine'],
  ['सेटिरिजिन', 'Cetirizine'],
  ['लेवोसेट्रिजिन', 'Levocetirizine'],
  ['मोंटेलुकास्ट', 'Montelukast'],
  ['सालबुटामोल', 'Salbutamol'],
  ['बुडेसोनाइड', 'Budesonide'],
  ['प्रेडनिसोलोन', 'Prednisolone'],
  ['एमोक्सिसिलिन', 'Amoxicillin'],
  ['अमोक्सिसिलिन', 'Amoxicillin'],
  ['ऑगमेंटिन', 'Augmentin'],
  ['एजिथ्रोमाइसिन', 'Azithromycin'],
  ['डॉक्सीसाइक्लिन', 'Doxycycline'],
  ['मेट्रोनिडाजोल', 'Metronidazole'],
  ['सिप्रोफ्लॉक्सासिन', 'Ciprofloxacin'],
  ['ओफ्लॉक्सासिन', 'Ofloxacin'],
  ['सेफ्ट्रियाक्सोन', 'Ceftriaxone'],
  ['एल्बेंडाजोल', 'Albendazole'],
];

const FREQUENCIES: [RegExp, string][] = [
  [/(?:ज़रूरत|जरूरत) (?:पड़ने|पडने|होने) पर/u, 'SOS'],
  [/दर्द होने पर|बुखार होने पर/u, 'SOS'],
  [/दिन में एक बार|रोज़ एक बार|रोज एक बार/u, 'OD'],
  [/दिन में दो बार|सुबह शाम/u, 'BD'],
  [/दिन में तीन बार/u, 'TDS'],
  [/दिन में चार बार/u, 'QID'],
  [/रात को सोते समय|सोते समय|रात को/u, 'HS'],
  [/तुरंत|अभी एक/u, 'STAT'],
];

const UNITS: Record<string, string> = {
  दिन: 'days',
  हफ्ते: 'weeks',
  हफ्ता: 'weeks',
  सप्ताह: 'weeks',
  महीने: 'months',
  महीना: 'months',
  माह: 'months',
};

const END = '(?=$|[\\s,.;:)।])';

const replaceTerms = (text: string, terms: [string, string][]) => {
  let result = text;
  for (const [hindi, english] of [...terms].sort(
    (a, b) => b[0].length - a[0].length,
  )) {
    result = result.replace(
      new RegExp(`(^|\\s)${fold(hindi)}${END}`, 'gu'),
      `$1${english}`,
    );
  }
  return result;
};

/** True when a line has Devanagari in it. */
export const hasDevanagari = (line: string) => DEVANAGARI.test(line);

export const normaliseHindiMedicineLine = (line: string): string => {
  if (!hasDevanagari(line)) return line;
  let text = fold(line);

  // "Not more than four times a day" is a limit, not how often.
  text = text.replace(
    new RegExp(`दिन में (${NUMBER_WORD}) बार से (?:ज्यादा|अधिक) नहीं`, 'gu'),
    (_, n: string) => `max ${numberOf(n)} per day`,
  );
  for (const [pattern, code] of FREQUENCIES) {
    text = text.replace(new RegExp(fold(pattern.source), 'gu'), ` ${code} `);
  }
  // "Two drops" before the frequency is the dose, which the reader does not need.
  text = text.replace(
    new RegExp(`(${NUMBER_WORD})(?: \\1)? (?:बूंद|बूँद|चम्मच)`, 'gu'),
    '',
  );
  // Three numbers in a row are the morning, afternoon and night doses.
  text = text.replace(
    new RegExp(
      `(^|\\s)(${NUMBER_WORD}) (${NUMBER_WORD}) (${NUMBER_WORD})${END}`,
      'gu',
    ),
    (_, before: string, a: string, b: string, c: string) =>
      `${before}${numberOf(a)}-${numberOf(b)}-${numberOf(c)}`,
  );
  text = text.replace(
    new RegExp(
      `(^|\\s)(${NUMBER_WORD}|\\d+) (${Object.keys(UNITS).map(fold).join('|')})${END}`,
      'gu',
    ),
    (_, before: string, n: string, unit: string) =>
      `${before}x ${numberOf(n)} ${UNITS[unit] ?? 'days'}`,
  );
  text = text
    .replace(/खाने के बाद/gu, 'after food')
    .replace(/खाने से पहले|नाश्ते से पहले/gu, 'before food')
    .replace(/खाली पेट/gu, 'empty stomach');
  text = replaceTerms(text, FORMS);
  text = replaceTerms(text, MEDICINES);
  return text
    .replace(/\s+,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim();
};
