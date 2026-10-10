import { useSettings } from '../lib/settings';

export function Header({ dateLine, title, pill }: { dateLine: string; title: string; pill?: string }) {
  return (
    <header class="header">
      <div>
        <div class="header__date">{dateLine}</div>
        <h1>{title}</h1>
      </div>
      {pill && <div class="pill">{pill}</div>}
    </header>
  );
}

export function useGreeting(base: string, withName = true): string {
  const { displayName } = useSettings();
  return withName && displayName ? `${base}, ${displayName}` : base;
}

export function MockBanner() {
  return (
    <div class="mock-banner" role="note">
      Beispieldaten · keine echten Kurse
    </div>
  );
}
