import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The player in speech.ts with a fake Edge Function and a fake <audio> that follows the iOS rule: an element may
// only start playing when play() is called during a tap, and once that happened it stays unlocked.

const invoke = vi.fn();
vi.mock('./supabase', () => ({ supabaseConfigured: true, supabase: () => ({ functions: { invoke } }) }));
vi.mock('./auth', () => ({ currentSession: () => ({ access_token: 'example' }) }));

let inTap = false;
const elements: FakeAudio[] = [];

class FakeAudio {
  src = '';
  preload = '';
  paused = true;
  ended = false;
  unlocked = false;
  plays: { src: string; inTap: boolean }[] = [];
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  error: { code: number } | null = null;
  playResult: (() => Promise<void>) | null = null;
  constructor() {
    elements.push(this);
  }
  play(): Promise<void> {
    this.plays.push({ src: this.src, inTap });
    if (inTap) this.unlocked = true;
    if (!this.unlocked) return Promise.reject(new DOMException('not in a tap', 'NotAllowedError'));
    if (this.playResult) return this.playResult();
    this.paused = false;
    this.ended = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  removeAttribute(name: string) {
    if (name === 'src') this.src = '';
  }
  /** The clip played to its end. */
  end() {
    this.paused = true;
    this.ended = true;
    this.onended?.();
  }
}

const tap = (fn: () => void) => {
  inTap = true;
  try {
    fn();
  } finally {
    inTap = false;
  }
};
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
};

const SCRIPT = [
  { label: 'Einstieg', text: 'Guten Morgen. Hier ist dein Beispiel-Briefing.' },
  { label: 'Depot', text: 'Dein Depot steht bei plus 1 Prozent.' },
  { label: 'Training', text: 'Training: heute frei.' },
];

let speech: typeof import('./speech');

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('navigator', {});
  elements.length = 0;
  invoke.mockReset();
  const clips = new Map<string, number>();
  invoke.mockImplementation(async (_name: string, { body }: { body: { text: string } }) => {
    if (!clips.has(body.text)) clips.set(body.text, clips.size);
    return { data: { status: 'ok', audio: btoa(`example-clip-${clips.get(body.text)}`) }, error: null };
  });
  vi.spyOn(Date, 'now').mockImplementation(() => 1_000_000 + performance.now() * 1000); // clips "last" long enough
  speech = await import('./speech');
});

afterEach(() => {
  speech.stopSpeech();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('speech player', () => {
  it('unlocks the element inside the tap and plays the fetched MP3 on the same element afterwards', async () => {
    tap(() => speech.startSpeech('morning', 'Morgenbriefing', SCRIPT));
    expect(elements).toHaveLength(1);
    const el = elements[0];
    expect(el.plays[0]).toMatchObject({ inTap: true });
    expect(el.plays[0].src).toMatch(/^data:audio\/wav;base64,/);
    await flush();
    expect(invoke).toHaveBeenCalledWith('daily-speech', { body: { text: expect.any(String), voice: 'de-DE-Neural2-F', rate: 1 } });
    const mp3 = el.plays.at(-1)!;
    expect(mp3.inTap).toBe(false);
    expect(mp3.src).toMatch(/^data:audio\/mpeg;base64,/);
    expect(el.paused).toBe(false);
    expect(speech.getSpeechState()).toMatchObject({ status: 'playing', loading: false, error: null, label: 'Einstieg' });
  });

  it('goes on to the next chunk when one ends, without a tap', async () => {
    tap(() => speech.startSpeech('morning', 'Morgenbriefing', [{ label: 'Lang', text: `${'Ein Satz mit etwas Text. '.repeat(30)}` }, SCRIPT[1]]));
    await flush();
    const el = elements[0];
    const first = el.src;
    el.end();
    await flush();
    expect(el.src).not.toBe(first);
    expect(el.paused).toBe(false);
    expect(speech.getSpeechState().status).toBe('playing');
  });

  it('pauses, continues and skips', async () => {
    tap(() => speech.startSpeech('morning', 'Morgenbriefing', SCRIPT));
    await flush();
    const el = elements[0];
    tap(() => speech.pauseSpeech());
    expect(el.paused).toBe(true);
    expect(speech.getSpeechState().status).toBe('paused');
    tap(() => speech.resumeSpeech());
    await flush();
    expect(el.paused).toBe(false);
    tap(() => speech.skipSpeech(1));
    await flush();
    expect(speech.getSpeechState()).toMatchObject({ status: 'playing', label: 'Depot', segment: 1 });
    expect(el.paused).toBe(false);
    tap(() => speech.skipSpeech(-1));
    await flush();
    expect(speech.getSpeechState()).toMatchObject({ status: 'playing', label: 'Einstieg' });
  });

  it('closes the player and says why when the Edge Function answers with an error', async () => {
    invoke.mockResolvedValue({ data: { status: 'no_key' }, error: null });
    tap(() => speech.startSpeech('morning', 'Morgenbriefing', SCRIPT));
    await flush();
    expect(speech.getSpeechState()).toMatchObject({ status: 'idle', error: 'Die Stimme ist noch nicht eingerichtet.' });
  });

  it('names the playback step when the player refuses the audio', async () => {
    tap(() => speech.startSpeech('morning', 'Morgenbriefing', SCRIPT));
    elements[0].playResult = () => Promise.reject(new DOMException('no', 'NotSupportedError'));
    await flush();
    expect(speech.getSpeechState()).toMatchObject({ status: 'idle', error: 'Vorlesen ist gerade nicht möglich. (Wiedergabe: NotSupportedError)' });
  });

  it('would fail on iOS if the element had not been unlocked inside the tap', async () => {
    // Same flow, but started outside a tap: the fake refuses like iOS does, and the app reports it.
    speech.startSpeech('morning', 'Morgenbriefing', SCRIPT);
    await flush();
    expect(speech.getSpeechState()).toMatchObject({ status: 'idle', error: 'Vorlesen ist gerade nicht möglich. (Wiedergabe: NotAllowedError)' });
  });
});
