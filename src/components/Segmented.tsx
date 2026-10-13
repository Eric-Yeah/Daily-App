import type { JSX } from 'preact';
import type { ViewKey } from '../lib/time';

const ICON = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' } as const;

const VIEWS: { key: ViewKey; label: string; icon: JSX.Element }[] = [
  {
    key: 'morning',
    label: 'Morgen',
    icon: (
      <svg {...ICON}>
        <path d="M7 17a5 5 0 0 1 10 0M12 4v3M4.9 9.9l1.8 1.8M19.1 9.9l-1.8 1.8M2 17h20M6 21h12" />
      </svg>
    ),
  },
  {
    key: 'afternoon',
    label: 'Mittag/Nachmittag',
    icon: (
      <svg {...ICON}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    ),
  },
  {
    key: 'evening',
    label: 'Abend',
    icon: (
      <svg {...ICON}>
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
      </svg>
    ),
  },
];

interface Props {
  value: ViewKey; // the view being shown
  current: ViewKey; // the view that matches the clock right now
  onChange: (v: ViewKey) => void;
  onNow: () => void; // back to the clock-driven view
}

export function ViewSwitcher({ value, current, onChange, onNow }: Props) {
  // Tabs pattern: only the selected tab is in the tab order, the arrow keys (and Home/End) move between tabs.
  const onKeyDown = (e: KeyboardEvent) => {
    const i = VIEWS.findIndex((v) => v.key === value);
    const next =
      e.key === 'ArrowRight' ? (i + 1) % VIEWS.length : e.key === 'ArrowLeft' ? (i + VIEWS.length - 1) % VIEWS.length : e.key === 'Home' ? 0 : e.key === 'End' ? VIEWS.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(VIEWS[next].key);
    document.getElementById(`tab-${VIEWS[next].key}`)?.focus();
  };
  const currentLabel = VIEWS.find((v) => v.key === current)?.label ?? '';
  return (
    <div class="view-switcher">
      <div class="segmented segmented--views" role="tablist" aria-label="Tagesansicht" onKeyDown={onKeyDown}>
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            role="tab"
            id={`tab-${v.key}`}
            data-view={v.key}
            data-now={current === v.key ? 'true' : undefined}
            aria-selected={value === v.key}
            tabIndex={value === v.key ? 0 : -1}
            aria-controls="today-panel"
            onClick={() => onChange(v.key)}
          >
            {v.icon}
            <span>{v.label}</span>
            {current === v.key && <span class="segmented__now" title="Das ist jetzt" role="img" aria-label="aktuell" />}
          </button>
        ))}
      </div>
      {value !== current && (
        <button class="view-switcher__now" type="button" onClick={onNow}>
          <span class="segmented__now" aria-hidden="true" />
          Jetzt ist {currentLabel} · zurück zu jetzt
        </button>
      )}
    </div>
  );
}
