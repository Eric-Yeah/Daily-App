import { useEffect } from 'preact/hooks';
import { TabBar } from './components/TabBar';
import { useAuth } from './lib/auth';
import { useLock } from './lib/lock';
import { pullSettings } from './lib/settingsSync';
import { useRoute } from './router';
import { LockScreen, LoginPage, NoAccessPage } from './views/Access';
import { DepotPage, MorePage, NewsPage } from './views/Pages';
import { Today } from './views/today/Today';

export function App() {
  const auth = useAuth();
  const lock = useLock();
  const route = useRoute();

  useEffect(() => {
    if (auth.status === 'ready') void pullSettings();
  }, [auth.status === 'ready' ? auth.session.user.id : '']);

  if (auth.status === 'loading') return <div class="app" aria-busy="true" />;
  if (auth.status === 'signed-out') return <div class="app"><LoginPage /></div>;
  if (auth.status === 'no-access') return <div class="app"><NoAccessPage email={auth.email} reason={auth.reason} /></div>;
  if (auth.status === 'ready' && (lock.locked || lock.covered)) {
    return <div class="app"><LockScreen coverOnly={!lock.locked} /></div>;
  }

  return (
    <div class="app">
      {route === 'heute' && <Today />}
      {route === 'depot' && <DepotPage />}
      {route === 'news' && <NewsPage />}
      {route === 'mehr' && <MorePage />}
      <TabBar current={route} />
    </div>
  );
}
