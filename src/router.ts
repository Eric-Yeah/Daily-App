import { useEffect, useState } from 'preact/hooks';

// Hash routing, because GitHub Pages has no SPA fallback for deep links.
export type Route = 'heute' | 'depot' | 'news' | 'mehr';
const ROUTES: Route[] = ['heute', 'depot', 'news', 'mehr'];

function parse(hash: string): Route {
  const name = hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  return (ROUTES as string[]).includes(name) ? (name as Route) : 'heute';
}

/** "#/depot/p/123" → ["depot", "p", "123"] */
export function pathParts(hash: string): string[] {
  return hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean).map(decodeURIComponent);
}

function useHash(): string {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const onChange = () => {
      setHash(location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

export function useRoute(): Route {
  return parse(useHash());
}

/** Sub path below the tab, e.g. ["p", "123"] for "#/depot/p/123". */
export function useSubPath(): string[] {
  return pathParts(useHash()).slice(1);
}

export function go(path: string): void {
  location.hash = path.startsWith('#') ? path : `#/${path.replace(/^\//, '')}`;
}
