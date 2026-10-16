import { describe, expect, it } from 'vitest';
import { chunkText, cleanForSpeech, readSpeechAnswer, scriptChunks, speakingMinutes } from './speech';

describe('cleanForSpeech', () => {
  it('turns symbols into words', () => {
    expect(cleanForSpeech('DAX +0,3 % und Dow −1,2 %')).toBe('DAX plus 0,3 Prozent und Dow minus 1,2 Prozent');
    expect(cleanForSpeech('Depot 48.215 €, +201 €')).toBe('Depot 48.215 Euro, plus 201 Euro');
    expect(cleanForSpeech('Zinsen bei 3,5% statt 4%')).toBe('Zinsen bei 3,5 Prozent statt 4 Prozent');
  });
  it('does not read a dash between numbers as minus', () => {
    expect(cleanForSpeech('Spanne 5-7 Prozent')).toBe('Spanne 5-7 Prozent');
  });
  it('reads times as hours and minutes, without doubling "Uhr"', () => {
    expect(cleanForSpeech('Um 14:30 Uhr und um 09:00')).toBe('Um 14 Uhr 30 und um 9 Uhr');
  });
  it('drops links and arrows and spells out abbreviations', () => {
    expect(cleanForSpeech('Mehr unter https://example.com/x ↗ bei SAP & Co., ca. 2 Mrd. Euro')).toBe('Mehr unter bei SAP und Co., circa 2 Milliarden Euro');
    expect(cleanForSpeech('Quelle ↗')).toBe('Quelle');
  });
});

describe('chunkText', () => {
  it('returns nothing for empty text', () => {
    expect(chunkText('  ')).toEqual([]);
  });
  it('packs short sentences into one chunk', () => {
    expect(chunkText('Eins. Zwei. Drei.')).toEqual(['Eins. Zwei. Drei.']);
  });
  it('starts a new chunk before the limit is exceeded', () => {
    const s = 'Dies ist ein Satz mit etwas Länge.';
    const chunks = chunkText(`${s} ${s} ${s}`, 80);
    expect(chunks.length).toBe(2);
    expect(chunks.every((c) => c.length <= 80)).toBe(true);
    expect(chunks.join(' ')).toBe(`${s} ${s} ${s}`);
  });
  it('splits one very long sentence at commas or spaces', () => {
    const long = `${Array.from({ length: 40 }, (_, i) => `wort${i}`).join(', ')}.`;
    const chunks = chunkText(long, 60);
    expect(chunks.every((c) => c.length <= 60)).toBe(true);
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(long);
  });
  it('does not end a sentence after a date like "1. Oktober"', () => {
    expect(chunkText('Am 1. Oktober beginnt es. Danach nicht.', 30)).toEqual(['Am 1. Oktober beginnt es.', 'Danach nicht.']);
  });
});

describe('scriptChunks', () => {
  it('keeps track of the segment and skips empty ones', () => {
    const chunks = scriptChunks([
      { label: 'A', text: 'Hallo.' },
      { label: 'B', text: '   ' },
      { label: 'C', text: 'DAX +1 %.' },
    ]);
    expect(chunks).toEqual([
      { segment: 0, text: 'Hallo.' },
      { segment: 2, text: 'DAX plus 1 Prozent.' },
    ]);
  });
});

describe('speakingMinutes', () => {
  const words = (n: number) => Array.from({ length: n }, () => 'wort').join(' ');
  it('is at least one minute and scales with speed', () => {
    expect(speakingMinutes([{ label: 'A', text: 'Kurz.' }])).toBe(1);
    expect(speakingMinutes([{ label: 'A', text: words(600) }], 1)).toBe(4);
    expect(speakingMinutes([{ label: 'A', text: words(600) }], 1.5)).toBe(3);
  });
});

describe('readSpeechAnswer', () => {
  it('turns an error status into a German message', () => {
    expect(readSpeechAnswer({ status: 'budget' })).toEqual({ ok: false, error: 'Das Limit für das Vorlesen in diesem Monat ist erreicht.' });
    expect(readSpeechAnswer({ status: 'no_key' })).toEqual({ ok: false, error: 'Die Stimme ist noch nicht eingerichtet.' });
    expect(readSpeechAnswer({ status: 'error' })).toEqual({ ok: false, error: 'Vorlesen ist gerade nicht möglich.' });
    expect(readSpeechAnswer(null)).toEqual({ ok: false, error: 'Vorlesen ist gerade nicht möglich.' });
  });
  it('treats an ok answer without audio as an error', () => {
    expect(readSpeechAnswer({ status: 'ok' }).ok).toBe(false);
  });
});
