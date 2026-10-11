import { useEffect } from 'preact/hooks';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TabBar } from './components/TabBar';
import { UpdateBanner, WhatsNew } from './components/Updates';
import { useAuth } from './lib/auth';
import { useLock } from './lib/lock';
import { pullSettings } from './lib/settingsSync';
import { useRoute } from './router';
import { LockScreen, LoginPage, NoAccessPage } from './views/Access';
import { MorePage } from './views/Pages';
import { NewsTab } from './views/NewsTab';
import { DepotTab } from './views/depot/Depot';
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
      <ErrorBoundary resetKey={route}>
        {route === 'heute' && <Today />}
        {route === 'depot' && <DepotTab />}
        {route === 'news' && <NewsTab />}
        {route === 'mehr' && <MorePage />}
      </ErrorBoundary>
      <TabBar current={route} />
      <UpdateBanner />
      <WhatsNew />
    </div>
  );
}
