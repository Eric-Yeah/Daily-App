import type { ViewKey } from '../lib/time';

const VIEWS: { key: ViewKey; label: string }[] = [
  { key: 'morning', label: 'Morgen' },
  { key: 'afternoon', label: 'Nachmittag' },
  { key: 'evening', label: 'Abend' },
];

export function ViewSwitcher({ value, onChange }: { value: ViewKey; onChange: (v: ViewKey) => void }) {
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
  return (
    <div class="segmented" role="tablist" aria-label="Tagesansicht" onKeyDown={onKeyDown}>
      {VIEWS.map((v) => (
        <button
          key={v.key}
          type="button"
          role="tab"
          id={`tab-${v.key}`}
          aria-selected={value === v.key}
          tabIndex={value === v.key ? 0 : -1}
          aria-controls="today-panel"
          onClick={() => onChange(v.key)}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
