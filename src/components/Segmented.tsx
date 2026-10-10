import type { ViewKey } from '../lib/time';

const VIEWS: { key: ViewKey; label: string }[] = [
  { key: 'morning', label: 'Morgen' },
  { key: 'afternoon', label: 'Nachmittag' },
  { key: 'evening', label: 'Abend' },
];

export function ViewSwitcher({ value, onChange }: { value: ViewKey; onChange: (v: ViewKey) => void }) {
  return (
    <div class="segmented" role="tablist" aria-label="Tagesansicht">
      {VIEWS.map((v) => (
        <button
          key={v.key}
          type="button"
          role="tab"
          id={`tab-${v.key}`}
          aria-selected={value === v.key}
          aria-controls="today-panel"
          onClick={() => onChange(v.key)}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
