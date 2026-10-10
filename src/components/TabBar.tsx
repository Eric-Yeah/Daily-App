import type { Route } from '../router';

const ICON = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' } as const;

const TABS: { route: Route; label: string; icon: preact.JSX.Element }[] = [
  {
    route: 'heute',
    label: 'Heute',
    icon: (
      <svg {...ICON}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2V4M12 20V22M2 12H4M20 12H22" />
      </svg>
    ),
  },
  {
    route: 'depot',
    label: 'Depot',
    icon: (
      <svg {...ICON}>
        <path d="M3 18 L9 11 L13 15 L21 6" />
      </svg>
    ),
  },
  {
    route: 'news',
    label: 'News',
    icon: (
      <svg {...ICON}>
        <rect x="4" y="4" width="16" height="16" rx="3" />
        <path d="M8 9H16M8 13H16M8 17H12" />
      </svg>
    ),
  },
  {
    route: 'mehr',
    label: 'Mehr',
    icon: (
      <svg {...ICON}>
        <circle cx="5" cy="12" r="1.5" />
        <circle cx="12" cy="12" r="1.5" />
        <circle cx="19" cy="12" r="1.5" />
      </svg>
    ),
  },
];

export function TabBar({ current }: { current: Route }) {
  return (
    <nav class="tabbar" aria-label="Hauptnavigation">
      {TABS.map((t) => (
        <a key={t.route} href={`#/${t.route}`} aria-current={current === t.route ? 'page' : undefined}>
          {t.icon}
          {t.label}
        </a>
      ))}
    </nav>
  );
}
