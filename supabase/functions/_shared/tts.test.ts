import { describe, expect, it } from 'vitest';
import { googleBody, MAX_CHARS_PER_CALL, parseSpeechRequest, voiceFamily } from './tts.ts';

describe('parseSpeechRequest', () => {
  it('accepts a normal request and tidies the text', () => {
    expect(parseSpeechRequest({ text: '  Hallo   Welt. ', voice: 'de-DE-Neural2-F', rate: 1.1 })).toEqual({ text: 'Hallo Welt.', voice: 'de-DE-Neural2-F', rate: 1.1 });
  });
  it('rejects empty, too long and unknown voices', () => {
    expect(parseSpeechRequest({ text: ' ', voice: 'de-DE-Neural2-F' })).toBeNull();
    expect(parseSpeechRequest({ text: 'a'.repeat(MAX_CHARS_PER_CALL + 1), voice: 'de-DE-Neural2-F' })).toBeNull();
    expect(parseSpeechRequest({ text: 'Hallo', voice: 'de-DE-Studio-B' })).toBeNull();
    expect(parseSpeechRequest(null)).toBeNull();
  });
  it('clamps the rate and defaults to 1', () => {
    expect(parseSpeechRequest({ text: 'Hi', voice: 'de-DE-Neural2-B', rate: 9 })?.rate).toBe(2);
    expect(parseSpeechRequest({ text: 'Hi', voice: 'de-DE-Neural2-B', rate: 0 })?.rate).toBe(0.5);
    expect(parseSpeechRequest({ text: 'Hi', voice: 'de-DE-Neural2-B' })?.rate).toBe(1);
  });
});

describe('googleBody', () => {
  it('asks for German MP3', () => {
    expect(googleBody({ text: 'Hi', voice: 'de-DE-Chirp3-HD-Aoede', rate: 1 })).toEqual({
      input: { text: 'Hi' },
      voice: { languageCode: 'de-DE', name: 'de-DE-Chirp3-HD-Aoede' },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 1 },
    });
  });
  it('names the usage family', () => {
    expect(voiceFamily('de-DE-Chirp3-HD-Charon')).toBe('chirp3-hd');
    expect(voiceFamily('de-DE-Neural2-F')).toBe('neural2');
  });
});
