import { pauseSpeech, getPrefs, resumeSpeech, skipSpeech, speakingMinutes, speechSupported, startSpeech, stopSpeech, useSpeech, type Segment } from '../lib/speech';

const ICON = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' } as const;

const SpeakerIcon = () => (
  <svg {...ICON}>
    <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" />
    <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
  </svg>
);
const PauseIcon = () => (
  <svg {...ICON}>
    <path d="M8 5v14M16 5v14" />
  </svg>
);
const PlayIcon = () => (
  <svg {...ICON}>
    <path d="M7 4.5v15l12-7.5z" />
  </svg>
);
const StopIcon = () => (
  <svg {...ICON}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);
const NextIcon = () => (
  <svg {...ICON}>
    <path d="M6 5l9 7-9 7zM18 5v14" />
  </svg>
);
const PrevIcon = () => (
  <svg {...ICON}>
    <path d="M18 5l-9 7 9 7zM6 5v14" />
  </svg>
);

/**
 * "Briefing anhören": starts reading the script aloud, or pauses/continues it when this script is the one being read.
 * Hidden where the device cannot speak and when there is nothing to read; disabled while the data is still loading.
 */
export function ListenButton({ id, title, script, pending, secondary = false }: { id: string; title: string; script: Segment[]; pending: boolean; secondary?: boolean }) {
  const sp = useSpeech();
  if (!speechSupported()) return null;
  if (!pending && !script.length) return null;

  const mine = sp.id === id && sp.status !== 'idle';
  const minutes = speakingMinutes(script, getPrefs().rate);
  let label = `${title} anhören · ca. ${minutes} Min.`;
  let icon = <SpeakerIcon />;
  let onClick = () => startSpeech(id, title, script);
  if (pending) label = 'Wird geladen …';
  else if (mine && sp.status === 'playing') [label, icon, onClick] = ['Pause', <PauseIcon />, pauseSpeech];
  else if (mine) [label, icon, onClick] = ['Weiter anhören', <PlayIcon />, resumeSpeech];

  return (
    <div class="listen">
      <button class={`button listen__button${secondary || mine ? ' button--secondary' : ''}`} type="button" disabled={pending} onClick={onClick}>
        {icon}
        <span>{label}</span>
      </button>
      {sp.error && sp.status === 'idle' && (
        <p class="block-state block-state--error" role="alert">
          {sp.error}
        </p>
      )}
    </div>
  );
}

/** Player above the tab bar while something is read: it stays on screen when you switch tabs. */
export function SpeechBar() {
  const sp = useSpeech();
  if (sp.status === 'idle') return null;
  const playing = sp.status === 'playing';
  return (
    <div class="speechbar" role="region" aria-label="Vorlesen">
      <div class="speechbar__row">
        <div class="speechbar__text">
          <strong>{sp.title}</strong>
          <span>
            {sp.label}
            {sp.segmentCount > 1 ? ` · ${sp.segment + 1} von ${sp.segmentCount}` : ''}
            {playing ? '' : ' · pausiert'}
          </span>
        </div>
        <div class="speechbar__controls">
          <button type="button" class="icon-button" aria-label="Voriger Abschnitt" onClick={() => skipSpeech(-1)}>
            <PrevIcon />
          </button>
          <button type="button" class="icon-button icon-button--main" aria-label={playing ? 'Pause' : 'Weiter'} onClick={playing ? pauseSpeech : resumeSpeech}>
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button type="button" class="icon-button" aria-label="Nächster Abschnitt" onClick={() => skipSpeech(1)}>
            <NextIcon />
          </button>
          <button type="button" class="icon-button" aria-label="Vorlesen beenden" onClick={stopSpeech}>
            <StopIcon />
          </button>
        </div>
      </div>
      <div class="speechbar__progress" aria-hidden="true">
        <div style={{ width: `${Math.round(sp.progress * 100)}%` }} />
      </div>
    </div>
  );
}
