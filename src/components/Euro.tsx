import { useEffect, useState } from 'preact/hooks';
import { formatEuro, type EuroOptions } from '../lib/format';
import { useSettings } from '../lib/settings';

/** How long a tapped amount stays visible before it is covered again. */
export const REVEAL_MS = 5000;

/**
 * A euro amount. With "Beträge ausblenden" on it shows "•••• €"; one tap reveals that single amount
 * for a few seconds (another tap covers it again). Works inside links without following them.
 */
export function Euro({ value, ...options }: { value: number } & Omit<EuroOptions, 'hidden'>) {
  const { hideAmounts } = useSettings();
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!revealed) return;
    const t = setTimeout(() => setRevealed(false), REVEAL_MS);
    return () => clearTimeout(t);
  }, [revealed]);

  if (!hideAmounts) return <>{formatEuro(value, options)}</>;
  if (revealed) {
    return (
      <span class="euro-toggle" role="button" tabIndex={0} aria-label="Betrag wieder ausblenden" {...handlers(() => setRevealed(false))}>
        {formatEuro(value, options)}
      </span>
    );
  }
  return (
    <span class="euro-toggle" role="button" tabIndex={0} aria-label="Betrag anzeigen" {...handlers(() => setRevealed(true))}>
      {formatEuro(value, { ...options, hidden: true })}
    </span>
  );
}

function handlers(toggle: () => void) {
  return {
    onClick: (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      toggle();
    },
  };
}
