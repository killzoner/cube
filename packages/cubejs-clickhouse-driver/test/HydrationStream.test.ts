import { transformRow, transformStreamRow } from '../src/HydrationStream';

// These expected values are the exact output of the previous implementation,
//   moment.utc(value).format(moment.HTML5_FMT.DATETIME_LOCAL_MS)
// captured across DateTime64 precisions and edge cases. The string formatter
// must reproduce them byte-for-byte. moment truncates (does not round) the
// fractional part to 3 digits and zero-pads shorter fractions.
const DATETIME64_CASES: Array<[type: string, value: string, expected: string]> = [
  ['DateTime64(0)', '2020-01-02 03:04:05', '2020-01-02T03:04:05.000'],
  ['DateTime64(1)', '2020-01-02 03:04:05.1', '2020-01-02T03:04:05.100'],
  ['DateTime64(2)', '2020-01-02 03:04:05.12', '2020-01-02T03:04:05.120'],
  ['DateTime64(3)', '2020-01-02 03:04:05.123', '2020-01-02T03:04:05.123'],
  ['DateTime64(6)', '2020-01-02 03:04:05.123456', '2020-01-02T03:04:05.123'],
  ['DateTime64(9)', '2020-01-02 03:04:05.123456789', '2020-01-02T03:04:05.123'],
  ['DateTime64(3, \'UTC\')', '2020-01-02 03:04:05.789', '2020-01-02T03:04:05.789'],
  ['DateTime64(6, \'Asia/Istanbul\')', '2020-01-02 03:04:05.123456', '2020-01-02T03:04:05.123'],
  ['DateTime64(9, \'UTC\')', '2020-01-03 00:00:00.234567890', '2020-01-03T00:00:00.234'],
  ['DateTime64(3)', '2024-06-30 23:59:59.9', '2024-06-30T23:59:59.900'],
  ['DateTime64(3)', '2024-06-30 23:59:59.99', '2024-06-30T23:59:59.990'],
  ['DateTime64(3)', '2024-12-31 23:59:59.999999999', '2024-12-31T23:59:59.999'],
  ['DateTime64(3)', '2024-01-15 12:34:56.007', '2024-01-15T12:34:56.007'],
  ['DateTime64(3)', '2024-01-15 12:34:56.070', '2024-01-15T12:34:56.070'],
  ['DateTime64(3)', '1970-01-01 00:00:00.000', '1970-01-01T00:00:00.000'],
  ['DateTime64(3)', '1900-01-01 00:00:00.000', '1900-01-01T00:00:00.000'],
  ['DateTime64(3)', '2299-12-31 23:59:59.999', '2299-12-31T23:59:59.999'],
  ['Nullable(DateTime64(3))', '2020-01-02 03:04:05.123', '2020-01-02T03:04:05.123'],
];

describe('HydrationStream', () => {
  describe('transformRow', () => {
    it.each(DATETIME64_CASES)(
      'formats %s %s as %s (matching the previous moment output)',
      (type, value, expected) => {
        const row: Record<string, unknown> = { dt: value };
        transformRow(row, { dt: { name: 'dt', type } });
        expect(row.dt).toEqual(expected);
      }
    );

    it('formats the other ClickHouse types', () => {
      const row: Record<string, unknown> = {
        d: '2024-01-15',
        dt: '2024-01-15 12:34:56',
        dtz: '2024-01-15 12:34:56',
        i: 42,
        f: 3.14,
        dec: '1.01',
        s: 'hello',
        n: null,
      };
      transformRow(row, {
        d: { name: 'd', type: 'Date' },
        dt: { name: 'dt', type: 'DateTime' },
        dtz: { name: 'dtz', type: 'DateTime(\'UTC\')' },
        i: { name: 'i', type: 'Int32' },
        f: { name: 'f', type: 'Float64' },
        dec: { name: 'dec', type: 'Decimal32(2)' },
        s: { name: 's', type: 'String' },
        n: { name: 'n', type: 'Nullable(Int32)' },
      });
      expect(row).toEqual({
        d: '2024-01-15T00:00:00.000',
        dt: '2024-01-15T12:34:56.000',
        dtz: '2024-01-15T12:34:56.000',
        i: '42',
        f: '3.14',
        dec: '1.01',
        s: 'hello',
        n: null,
      });
    });
  });

  describe('transformStreamRow', () => {
    it.each(DATETIME64_CASES)(
      'formats %s %s as %s (matching the previous moment output)',
      (type, value, expected) => {
        const result = transformStreamRow([value], ['dt'], [type]);
        expect(result.dt).toEqual(expected);
      }
    );

    it('passes through null DateTime64 values', () => {
      const result = transformStreamRow([null], ['dt'], ['DateTime64(3)']);
      expect(result.dt).toBeNull();
    });

    it('throws on a row/names length mismatch', () => {
      expect(() => transformStreamRow([1, 2], ['a'], ['Int32'])).toThrow();
    });
  });
});
