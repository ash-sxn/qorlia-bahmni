import { checkAgainstDictation } from '../checkAgainstDictation';
import { parseDictation } from '../parseDictation';

const check = (tidied: string, said: string) =>
  checkAgainstDictation(parseDictation(tidied).medicines, said);

describe('checkAgainstDictation', () => {
  it('accepts lines that only rewrite what was said in Hinglish', () => {
    const said =
      'gale mein dard. medicines: tablet augmentin 625 1-0-1 paanch din khane ke baad, next medicine paracetamol 650 jab bukhar ho, next medicine gargle betadine din mein teen baar. advice garam paani';
    expect(
      check(
        'Rx\nTab Augmentin 625 mg 1-0-1 x 5 days after food\nParacetamol 650 mg SOS\nGargle Betadine TDS',
        said,
      ),
    ).toEqual([[], [], []]);
  });

  it('flags a duration copied from another medicine and a name never said', () => {
    const said =
      'metformin 500 subah shaam continue, glimepiride 1 mg naashte se pehle add kar do, ek mahine ke liye. telmisartan 40 raat ko. HbA1c ek mahine baad.';
    expect(
      check(
        'Rx\nMetformin 500 mg 1-0-1 x 1 month\nGlimepiride 1 mg before food x 1 month\nTelmisartan 40 mg HS x 1 month\nAtorvastatin 10 mg HS',
        said,
      ),
    ).toEqual([['how_long'], [], ['how_long'], ['name']]);
  });

  it('allows small speech-recognition slips in names but not other numbers', () => {
    expect(
      check(
        'Rx\nTab Pantoprazole 40 mg OD before food',
        'pantoprazol 20 subah khali pet',
      ),
    ).toEqual([['strength', 'when']]);
  });
});
