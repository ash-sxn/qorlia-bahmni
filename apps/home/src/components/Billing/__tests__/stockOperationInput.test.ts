import { stockOperationInputValue } from '../StockOperationFields';

describe('Native operation input conversion', () => {
  it.each([
    ['2027-02-02T03:04', '2027-02-02 03:04:00'],
    ['2027-02-02T03:04:05', '2027-02-02 03:04:05'],
    ['2027-02-02T03:04:05.000', '2027-02-02 03:04:05'],
    ['', false],
  ])(
    'preserves UTC wall-clock seconds for %s without device-zone conversion',
    (raw, value) => {
      expect(stockOperationInputValue('expiration_date', raw as string)).toBe(
        value,
      );
    },
  );
  it.each(['2027-02-02T03:04:05.123', '2027-02-02T03:04:05Z', 'not a date'])(
    'does not silently truncate or reinterpret %s',
    (raw) => {
      expect(() => stockOperationInputValue('expiration_date', raw)).toThrow(
        /whole seconds/,
      );
    },
  );
  it.each(['', ' ', 'Infinity', 'NaN'])(
    'rejects an invalid number %s',
    (raw) => {
      expect(() => stockOperationInputValue('qty_done', raw)).toThrow(
        /finite number/,
      );
    },
  );
  it('preserves finite numeric values and explicit clearing of text', () => {
    expect(stockOperationInputValue('qty_done', '0.125')).toBe(0.125);
    expect(stockOperationInputValue('lot_name', '')).toBe(false);
    expect(stockOperationInputValue('lot_name', 'QA Batch')).toBe('QA Batch');
  });
});
