import { useEffect, useState } from 'react';

export type RouteName = 'chat' | 'models' | 'settings';

const VALID_ROUTES: readonly RouteName[] = ['chat', 'models', 'settings'];
const DEFAULT_ROUTE: RouteName = 'chat';

function parseHash(hash: string): RouteName {
  const name = hash.replace(/^#\/?/, '').split('/')[0] ?? '';
  return (VALID_ROUTES as readonly string[]).includes(name) ? (name as RouteName) : DEFAULT_ROUTE;
}

// Client-side hash router with no routing library, per the engineering rule.
// Deep links and hard refreshes resolve because the hash is present in the
// URL itself - no server-side rewrite is required on GitHub Pages.
export function useHashRoute(): [RouteName, (route: RouteName) => void] {
  const [route, setRoute] = useState<RouteName>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onHashChange = (): void => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = (next: RouteName): void => {
    window.location.hash = `/${next}`;
  };

  return [route, navigate];
}
