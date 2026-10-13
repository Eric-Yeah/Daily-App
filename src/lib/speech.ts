import { useEffect, useState } from 'preact/hooks';
import { storage } from './storage';

// Read-aloud for the briefings. It uses the speech output built into the device (Web Speech API): free, no server,
// nothing leaves the device. The text is cut into short chunks that are spoken one after the other, because long
// utterances get cut off on some systems and because pause/skip then only need to restart a chunk.

/** One part of a script, e.g. "Marktüberblick"; the player skips from part to part. */
export interface Segment {
  label: string;
  text: string;
}

// ---------- Text preparation (pure) ----------

const WORD_ABBREVIATIONS: [RegExp, string][] = [
  [/\bMrd\.?(?=\s|$|[,;)])/g, 'Milliarden'],
  [/\bMio\.?(?=\s|$|[,;)])/g, 'Millionen'],
  [/\bca\./g, 'circa'],
  [/\bz\. ?B\./g, 'zum Beispiel'],
  [/\bbzw\./g, 'beziehungsweise'],
  [/\bggf\./g, 'gegebenenfalls'],
  [/\bu\. ?a\./g, 'unter anderem'],
  [/\bvs\.?(?=\s)/g, 'gegen'],
];

/** Turns display text into text a voice reads well: symbols become words, times become "14 Uhr 30", links disappear. */
export function cleanForSpeech(input: string): string {
  let t = input
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[↗▲▼]/g, ' ')
    .replace(/\s*[·•]\s*/g, ', ')
    .replace(/[*_#`]+/g, '')
    .replace(/&/g, ' und ');
  t = t.replace(/\b(\d{1,2}):(\d{2})(?:\s*Uhr\b)?/g, (_m, h: string, m: string) => `${Number(h)} Uhr${m === '00' ? '' : ` ${Number(m)}`}`);
  t = t
    .replace(/(^|[\s(„"])\+(?=\d)/g, '$1plus ')
    .replace(/(^|[\s(„"])[−–-](?=\d)/g, '$1minus ')
    .replace(/\s*%/g, ' Prozent')
    .replace(/\s*€/g, ' Euro');
  for (const [re, word] of WORD_ABBREVIATIONS) t = t.replace(re, word);
  return t.replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
}

/** Cuts a text that is too long at a comma, else at a space, so no piece is longer than `max`. */
function splitLong(sentence: string, max: number): string[] {
  const out: string[] = [];
  let rest = sentence;
  while (rest.length > max) {
    const comma = rest.lastIndexOf(', ', max - 1);
    const space = rest.lastIndexOf(' ', max);
    let cut: number;
    if (comma >= max * 0.4) cut = comma + 1;
    else if (space > 0) cut = space;
    else cut = max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** Cuts a text into sentences packed into chunks of at most `maxLen` characters (a single sentence may be split). */
export function chunkText(text: string, maxLen = 200): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences: string[] = [];
  let cur = '';
  for (const word of clean.split(' ')) {
    cur = cur ? `${cur} ${word}` : word;
    // "1." in "1. Oktober" is a date, not the end of a sentence
    if (/[.!?…]["“”)]?$/.test(word) && !/^\d{1,2}\.$/.test(word)) {
      sentences.push(cur);
      cur = '';
    }
  }
  if (cur) sentences.push(cur);

  const chunks: string[] = [];
  let pack = '';
  for (const s of sentences.flatMap((x) => (x.length > maxLen ? splitLong(x, maxLen) : [x]))) {
    if (pack && pack.length + 1 + s.length > maxLen) {
      chunks.push(pack);
      pack = s;
    } else {
      pack = pack ? `${pack} ${s}` : s;
    }
  }
  if (pack) chunks.push(pack);
  return chunks;
}

export interface Chunk {
  segment: number;
  text: string;
}

/** All chunks of a script in order, each knowing which segment it belongs to. Empty segments are skipped. */
export function scriptChunks(segments: Segment[]): Chunk[] {
  return segments.flatMap((s, segment) => chunkText(cleanForSpeech(s.text)).map((text) => ({ segment, text })));
}

const WORDS_PER_MINUTE = 150; // German speech at normal speed

/** Rounded minutes (at least 1) a script takes at the given speed. */
export function speakingMinutes(segments: Segment[], rate = 1): number {
  const words = segments.map((s) => cleanForSpeech(s.text)).join(' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / (WORDS_PER_MINUTE * rate)));
}

// ---------- Preferences (this device only: voice names differ per device) ----------

export interface SpeechPrefs {
  voiceURI: string | null;
  rate: number;
}

export const RATES = [0.8, 0.9, 1, 1.1, 1.25, 1.5] as const;

const PREFS_KEY = 'speech';
const clampRate = (r: unknown): number => (typeof r === 'number' && r >= 0.5 && r <= 2 ? r : 1);

export function getPrefs(): SpeechPrefs {
  const raw = storage.getJSON<Partial<SpeechPrefs>>(PREFS_KEY);
  return { voiceURI: typeof raw?.voiceURI === 'string' ? raw.voiceURI : null, rate: clampRate(raw?.rate) };
}

export function setPrefs(patch: Partial<SpeechPrefs>): void {
  storage.setJSON(PREFS_KEY, { ...getPrefs(), ...patch });
  // A running read picks up a new speed right away (restarting the current chunk).
  if (state.status === 'playing') playFrom(pos);
  emit();
}

// ---------- Voices ----------

/** Master switch: reading aloud is off until the cloud voice is set up. Set to true to bring the feature back. */
export const SPEECH_ENABLED = false;

export const speechSupported = (): boolean => SPEECH_ENABLED && typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

/** German voices, the better ones (enhanced/premium) first. */
export function germanVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported()) return [];
  const quality = (v: SpeechSynthesisVoice) => (/premium|enhanced|erweitert|verbessert/i.test(v.name) ? 0 : v.localService ? 1 : 2);
  return speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith('de'))
    .sort((a, b) => quality(a) - quality(b) || a.name.localeCompare(b.name, 'de'));
}

function chosenVoice(): SpeechSynthesisVoice | null {
  const voices = germanVoices();
  const { voiceURI } = getPrefs();
  return voices.find((v) => v.voiceURI === voiceURI) ?? voices.find((v) => v.lang.replace('_', '-') === 'de-DE') ?? voices[0] ?? null;
}

/** The German voices; the list loads late on some browsers, so it updates itself. */
export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState(germanVoices);
  useEffect(() => {
    if (!speechSupported()) return;
    const update = () => setVoices(germanVoices());
    speechSynthesis.addEventListener('voiceschanged', update);
    update();
    return () => speechSynthesis.removeEventListener('voiceschanged', update);
  }, []);
  return voices;
}

// ---------- Player ----------

export interface SpeechState {
  status: 'idle' | 'playing' | 'paused';
  id: string | null; // which script (e.g. "morning")
  title: string;
  label: string; // the current segment
  segment: number;
  segmentCount: number;
  progress: number; // 0..1 over the whole script
  error: string | null;
}

const IDLE: SpeechState = { status: 'idle', id: null, title: '', label: '', segment: 0, segmentCount: 0, progress: 0, error: null };

let state: SpeechState = IDLE;
let segments: Segment[] = [];
let chunks: Chunk[] = [];
let pos = 0;
let generation = 0; // bumped on every restart so events of a cancelled utterance are ignored
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function publish(patch: Partial<SpeechState>): void {
  state = { ...state, ...patch };
  emit();
}

function position(): Pick<SpeechState, 'segment' | 'label' | 'progress'> {
  const segment = chunks[Math.min(pos, chunks.length - 1)]?.segment ?? 0;
  return { segment, label: segments[segment]?.label ?? '', progress: chunks.length ? Math.min(1, pos / chunks.length) : 0 };
}

export function getSpeechState(): SpeechState {
  return state;
}

export function useSpeech(): SpeechState {
  const [value, setValue] = useState(state);
  useEffect(() => {
    const l = () => setValue(state);
    listeners.add(l);
    l();
    return () => {
      listeners.delete(l);
    };
  }, []);
  return value;
}

// Keep the screen on while reading: if iOS locks the screen it stops the speech.
let wakeLock: WakeLockSentinel | null = null;
async function holdScreen(on: boolean): Promise<void> {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    } else if (!on && wakeLock) {
      const l = wakeLock;
      wakeLock = null;
      await l.release();
    }
  } catch {
    // not available or refused (e.g. low battery mode): reading still works
  }
}

function speakChunk(gen: number): void {
  if (gen !== generation) return;
  if (pos >= chunks.length) {
    finish();
    return;
  }
  const { rate } = getPrefs();
  const u = new SpeechSynthesisUtterance(chunks[pos].text);
  u.lang = 'de-DE';
  u.rate = rate;
  const voice = chosenVoice();
  if (voice) u.voice = voice;
  u.onstart = () => gen === generation && publish(position());
  u.onend = () => {
    if (gen !== generation) return;
    pos++;
    speakChunk(gen);
  };
  u.onerror = (e) => {
    if (gen !== generation || e.error === 'interrupted' || e.error === 'canceled') return;
    finish('Vorlesen ist gerade nicht möglich.');
  };
  speechSynthesis.speak(u);
}

function playFrom(from: number): void {
  generation++;
  pos = Math.max(0, Math.min(from, chunks.length));
  speechSynthesis.cancel();
  publish({ status: 'playing', error: null, ...position() });
  void holdScreen(true);
  speakChunk(generation);
}

function finish(error: string | null = null): void {
  generation++;
  speechSynthesis.cancel();
  chunks = [];
  segments = [];
  pos = 0;
  state = { ...IDLE, error };
  void holdScreen(false);
  emit();
}

/**
 * Starts reading. Must be called straight from a tap (iOS only speaks after a user action), so the script has to
 * be ready when it is called. Replaces whatever is being read.
 */
export function startSpeech(id: string, title: string, script: Segment[]): void {
  if (!speechSupported()) return;
  generation++;
  speechSynthesis.cancel();
  segments = script;
  chunks = scriptChunks(script);
  if (!chunks.length) {
    finish('Es gibt noch nichts zum Vorlesen.');
    return;
  }
  state = { ...IDLE, status: 'playing', id, title, segmentCount: script.length };
  playFrom(0);
}

export function pauseSpeech(): void {
  if (state.status !== 'playing') return;
  generation++;
  speechSynthesis.cancel(); // resuming restarts the current chunk, which is more reliable than pause()/resume()
  publish({ status: 'paused' });
  void holdScreen(false);
}

export function resumeSpeech(): void {
  if (state.status === 'paused') playFrom(pos);
}

export function stopSpeech(): void {
  if (state.status !== 'idle') finish();
}

/** One segment forward (+1) or back (-1); back first returns to the start of the current segment. */
export function skipSpeech(delta: 1 | -1): void {
  if (state.status === 'idle' || !chunks.length) return;
  const current = chunks[Math.min(pos, chunks.length - 1)].segment;
  const startOf = (seg: number) => chunks.findIndex((c) => c.segment === seg);
  let target: number;
  if (delta === -1) {
    const atStart = pos <= startOf(current);
    const prev = [...new Set(chunks.map((c) => c.segment))].filter((s) => s < current).pop();
    target = atStart && prev !== undefined ? startOf(prev) : startOf(current);
  } else {
    const next = chunks.find((c) => c.segment > current);
    if (!next) {
      finish();
      return;
    }
    target = startOf(next.segment);
  }
  if (state.status === 'playing') playFrom(target);
  else {
    pos = target;
    publish(position());
  }
}

/** Reads a short test sentence with the chosen voice and speed (settings). */
export function speakSample(): void {
  startSpeech('sample', 'Probe', [{ label: 'Probe', text: 'Guten Morgen. So klingt dein Briefing mit dieser Stimme und diesem Tempo.' }]);
}

// Coming back to the app: if the system silenced the speech in the background, carry on where it was.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || state.status !== 'playing') return;
    void holdScreen(true);
    if (!speechSynthesis.speaking || speechSynthesis.paused) playFrom(pos);
  });
}
