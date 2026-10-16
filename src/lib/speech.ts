import { useEffect, useState } from 'preact/hooks';
import { currentSession } from './auth';
import { storage } from './storage';
import { supabase, supabaseConfigured } from './supabase';

// Read-aloud for the briefings. The voice comes from Google Cloud Text-to-Speech via the Edge Function
// "daily-speech" (only the text of the briefing is sent, nothing else). The text is cut into chunks; each chunk is
// fetched as MP3 and played one after the other, the next one is fetched while the current one plays. Pause and skip
// then only need to restart a chunk.

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
export function scriptChunks(segments: Segment[], maxLen = 200): Chunk[] {
  return segments.flatMap((s, segment) => chunkText(cleanForSpeech(s.text), maxLen).map((text) => ({ segment, text })));
}

const WORDS_PER_MINUTE = 150; // German speech at normal speed

/** Rounded minutes (at least 1) a script takes at the given speed. */
export function speakingMinutes(segments: Segment[], rate = 1): number {
  const words = segments.map((s) => cleanForSpeech(s.text)).join(' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / (WORDS_PER_MINUTE * rate)));
}

// ---------- Preferences (this device only) ----------

/** Voices of the Edge Function (keep in sync with VOICES in supabase/functions/_shared/tts.ts). */
export const VOICES = [
  { id: 'de-DE-Neural2-F', label: 'Frau, klar' },
  { id: 'de-DE-Neural2-B', label: 'Mann, klar' },
  { id: 'de-DE-Chirp3-HD-Aoede', label: 'Frau, natürlich' },
  { id: 'de-DE-Chirp3-HD-Charon', label: 'Mann, natürlich' },
] as const;
export const DEFAULT_VOICE: string = VOICES[0].id;

export interface SpeechPrefs {
  voice: string;
  rate: number;
}

export const RATES = [0.8, 0.9, 1, 1.1, 1.25, 1.5] as const;

const PREFS_KEY = 'speech';
const clampRate = (r: unknown): number => (typeof r === 'number' && r >= 0.5 && r <= 2 ? r : 1);

export function getPrefs(): SpeechPrefs {
  const raw = storage.getJSON<Partial<SpeechPrefs>>(PREFS_KEY);
  const voice = VOICES.find((v) => v.id === raw?.voice)?.id ?? DEFAULT_VOICE;
  return { voice, rate: clampRate(raw?.rate) };
}

export function setPrefs(patch: Partial<SpeechPrefs>): void {
  storage.setJSON(PREFS_KEY, { ...getPrefs(), ...patch });
  // A running read picks up a new voice or speed right away (restarting the current chunk).
  if (state.status === 'playing') playFrom(pos);
  emit();
}

/** Reading aloud needs a signed-in owner of a configured backend (not demo mode) and an audio player. */
export const speechSupported = (): boolean => typeof Audio !== 'undefined' && supabaseConfigured && !!currentSession();

// ---------- Audio from the Edge Function ----------

const MAX_CHUNK = 500; // characters per request (the Edge Function accepts 700)

type FetchResult = { ok: true; url: string } | { ok: false; error: string };

const ERRORS: Record<string, string> = {
  budget: 'Das Limit für das Vorlesen in diesem Monat ist erreicht.',
  no_key: 'Die Stimme ist noch nicht eingerichtet.',
};
const GENERIC_ERROR = 'Vorlesen ist gerade nicht möglich.';

/** The Edge Function's answer as a playable Blob URL, or the German error text. */
export function readSpeechAnswer(data: unknown): FetchResult {
  const d = data as { status?: unknown; audio?: unknown } | null;
  if (d?.status === 'ok' && typeof d.audio === 'string' && d.audio) {
    const bin = atob(d.audio);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { ok: true, url: URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' })) };
  }
  return { ok: false, error: (typeof d?.status === 'string' && ERRORS[d.status]) || GENERIC_ERROR };
}

// Audio already fetched or being fetched, per text+voice+rate, so skipping back and the prefetch cost no characters twice.
const audioCache = new Map<string, Promise<FetchResult>>();
const cacheKey = (text: string, voice: string, rate: number) => `${voice}|${rate}|${text}`;

function fetchAudio(text: string, voice: string, rate: number): Promise<FetchResult> {
  const k = cacheKey(text, voice, rate);
  let p = audioCache.get(k);
  if (!p) {
    p = (async (): Promise<FetchResult> => {
      try {
        const { data, error } = await supabase().functions.invoke('daily-speech', { body: { text, voice, rate } });
        return error ? { ok: false, error: GENERIC_ERROR } : readSpeechAnswer(data);
      } catch {
        return { ok: false, error: GENERIC_ERROR };
      }
    })();
    audioCache.set(k, p);
    void p.then((r) => {
      if (!r.ok) audioCache.delete(k); // try again next time
    });
  }
  return p;
}

function clearAudioCache(): void {
  for (const p of audioCache.values()) void p.then((r) => r.ok && URL.revokeObjectURL(r.url));
  audioCache.clear();
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
  loading: boolean; // waiting for the audio of the current chunk
  error: string | null;
}

const IDLE: SpeechState = { status: 'idle', id: null, title: '', label: '', segment: 0, segmentCount: 0, progress: 0, loading: false, error: null };

let state: SpeechState = IDLE;
let segments: Segment[] = [];
let chunks: Chunk[] = [];
let pos = 0;
let generation = 0; // bumped on every restart so answers and events of an abandoned chunk are ignored
let player: HTMLAudioElement | null = null;
let loadedPos = -1; // chunk currently loaded into the player (so "continue" does not fetch again)
const listeners = new Set<() => void>();

// A tiny silent WAV: playing it inside the tap unlocks the player on iOS, which only plays after a user action.
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

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

// Keep the screen on while reading, as a safety net: some systems stop audio when the screen locks.
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

function audioPlayer(): HTMLAudioElement {
  if (!player) {
    player = new Audio();
    player.preload = 'auto';
  }
  return player;
}

/** Lock-screen / headset controls, where the system offers them. */
function setMediaSession(): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;
  ms.metadata = new MediaMetadata({ title: state.title || 'Daily', artist: 'Daily' });
  ms.setActionHandler('play', resumeSpeech);
  ms.setActionHandler('pause', pauseSpeech);
  ms.setActionHandler('nexttrack', () => skipSpeech(1));
  ms.setActionHandler('previoustrack', () => skipSpeech(-1));
}

function prefetch(gen: number, index: number): void {
  if (gen !== generation || index >= chunks.length) return;
  const { voice, rate } = getPrefs();
  void fetchAudio(chunks[index].text, voice, rate);
}

async function playChunk(gen: number): Promise<void> {
  if (gen !== generation) return;
  if (pos >= chunks.length) {
    finish();
    return;
  }
  const { voice, rate } = getPrefs();
  publish({ loading: true, ...position() });
  const result = await fetchAudio(chunks[pos].text, voice, rate);
  if (gen !== generation) return;
  if (!result.ok) {
    finish(result.error);
    return;
  }
  const el = audioPlayer();
  el.onended = () => {
    if (gen !== generation) return;
    pos++;
    void playChunk(gen);
  };
  el.onerror = () => gen === generation && finish(GENERIC_ERROR);
  el.src = result.url;
  loadedPos = pos;
  try {
    await el.play();
  } catch {
    if (gen === generation) finish(GENERIC_ERROR);
    return;
  }
  if (gen !== generation) return;
  publish({ loading: false, ...position() });
  prefetch(gen, pos + 1);
}

function playFrom(from: number): void {
  generation++;
  pos = Math.max(0, Math.min(from, chunks.length));
  player?.pause();
  loadedPos = -1;
  publish({ status: 'playing', error: null, ...position() });
  void holdScreen(true);
  void playChunk(generation);
}

function finish(error: string | null = null): void {
  generation++;
  if (player) {
    player.pause();
    player.removeAttribute('src');
    player.onended = null;
    player.onerror = null;
  }
  clearAudioCache();
  chunks = [];
  segments = [];
  pos = 0;
  loadedPos = -1;
  state = { ...IDLE, error };
  void holdScreen(false);
  emit();
}

/**
 * Starts reading. Must be called straight from a tap (iOS only plays audio after a user action), so the script has
 * to be ready when it is called. Replaces whatever is being read.
 */
export function startSpeech(id: string, title: string, script: Segment[]): void {
  if (!speechSupported()) return;
  generation++;
  clearAudioCache();
  segments = script;
  chunks = scriptChunks(script, MAX_CHUNK);
  if (!chunks.length) {
    finish('Es gibt noch nichts zum Vorlesen.');
    return;
  }
  const el = audioPlayer();
  el.src = SILENCE;
  void el.play().catch(() => undefined); // unlocks the player inside the tap
  state = { ...IDLE, status: 'playing', id, title, segmentCount: script.length };
  setMediaSession();
  playFrom(0);
}

export function pauseSpeech(): void {
  if (state.status !== 'playing') return;
  player?.pause();
  // A fetch still running is abandoned; continuing fetches it again (it stays in the cache).
  if (state.loading) generation++;
  publish({ status: 'paused', loading: false });
  void holdScreen(false);
}

export function resumeSpeech(): void {
  if (state.status !== 'paused') return;
  if (player && loadedPos === pos && player.src && !player.ended) {
    publish({ status: 'playing' });
    void holdScreen(true);
    void player.play().catch(() => playFrom(pos));
  } else {
    playFrom(pos);
  }
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
    loadedPos = -1;
    publish(position());
  }
}

/** Reads a short test sentence with the chosen voice and speed (settings). */
export function speakSample(): void {
  startSpeech('sample', 'Probe', [{ label: 'Probe', text: 'Guten Morgen. So klingt dein Briefing mit dieser Stimme und diesem Tempo.' }]);
}

// Coming back to the app: if the system paused the audio in the background, carry on where it was.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || state.status !== 'playing' || state.loading) return;
    void holdScreen(true);
    if (player?.paused) void player.play().catch(() => playFrom(pos));
  });
}
