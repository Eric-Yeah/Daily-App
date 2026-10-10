import { useEffect, useState } from 'preact/hooks';

// Hash routing, because GitHub Pages has no SPA fallback for deep links.
export type Route = 'heute' | 'depot' | 'news' | 'mehr';
const ROUTES: Route[] = ['heute', 'depot', 'news', 'mehr'];

function parse(hash: string): Route {
  const name = hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  return (ROUTES as string[]).includes(name) ? (name as Route) : 'heute';
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parse(location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
