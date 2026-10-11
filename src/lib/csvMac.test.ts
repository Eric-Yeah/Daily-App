import { describe, expect, it } from 'vitest';
import { decodeBytes, detectDelimiter, parseCsv } from './csv';

const bytes = (...b: number[]) => new Uint8Array(b);

describe('CSV from the Mac', () => {
  it('reads "CSV (Macintosh)" (Mac Roman) with German umlauts', () => {
    // "Stückzahl;Größe" in Mac Roman: ü = 0x9F, ö = 0x9A, ß = 0xA7
    const data = bytes(0x53, 0x74, 0x9f, 0x63, 0x6b, 0x7a, 0x61, 0x68, 0x6c, 0x3b, 0x47, 0x72, 0x9a, 0xa7, 0x65);
    expect(decodeBytes(data)).toBe('Stückzahl;Größe');
  });

  it('still reads Windows-1252 exports as before', () => {
    // "Größe" in Windows-1252: ö = 0xF6, ß = 0xDF
    expect(decodeBytes(bytes(0x47, 0x72, 0xf6, 0xdf, 0x65))).toBe('Größe');
  });

  it('reads UTF-16 ("Unicode-Text" from Excel) with byte order mark', () => {
    const le = bytes(0xff, 0xfe, 0x53, 0, 0x74, 0, 0xfc, 0, 0x63, 0, 0x6b, 0);
    expect(decodeBytes(le)).toBe('Stück');
    const be = bytes(0xfe, 0xff, 0, 0x53, 0, 0x74, 0, 0xfc, 0, 0x63, 0, 0x6b);
    expect(decodeBytes(be)).toBe('Stück');
  });

  it('composes umlauts that macOS wrote as letter plus diaeresis', () => {
    const decomposed = new TextEncoder().encode('Stück');
    expect(decodeBytes(decomposed)).toBe('Stück');
  });

  it('splits files whose lines end with a lone carriage return (old Mac exports)', () => {
    const text = 'ISIN;Stück\rDE0005140008;10\rUS0378331005;5';
    expect(detectDelimiter(text)).toBe(';');
    expect(parseCsv(text, ';')).toEqual([
      ['ISIN', 'Stück'],
      ['DE0005140008', '10'],
      ['US0378331005', '5'],
    ]);
  });

  it('detects the tab of "Unicode-Text" files', () => {
    expect(detectDelimiter('ISIN\tStück\r\nDE0005140008\t10')).toBe('\t');
  });
});
