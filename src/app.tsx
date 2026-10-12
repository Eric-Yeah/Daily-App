import { useEffect, useRef, useState } from 'preact/hooks';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SpeechBar } from './components/Listen';
import { TabBar } from './components/TabBar';
import { UpdateBanner, WhatsNew } from './components/Updates';
import { useAuth } from './lib/auth';
import { useLock } from './lib/lock';
import { useResync } from './lib/resync';
import { pullSettings } from './lib/settingsSync';
import { stopSpeech, useSpeech } from './lib/speech';
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
  const speech = useSpeech();

  // Never keep reading depot figures aloud behind the lock or the privacy cover.
  useEffect(() => {
    if (lock.locked || lock.covered || auth.status !== 'ready') stopSpeech();
  }, [lock.locked, lock.covered, auth.status]);

  useEffect(() => {
    if (auth.status === 'ready') void pullSettings();
  }, [auth.status === 'ready' ? auth.session.user.id : '']);
  // Settings changed on another device (the phone) arrive when this window gets focus again.
  useResync(() => {
    if (auth.status === 'ready') void pullSettings();
  });

  // Play the reveal animation when the lock (not just the privacy cover) has been lifted.
  const [reveal, setReveal] = useState(false);
  const wasLocked = useRef(lock.locked);
  useEffect(() => {
    if (wasLocked.current && !lock.locked) {
      setReveal(true);
      const t = setTimeout(() => setReveal(false), 900);
      wasLocked.current = lock.locked;
      return () => clearTimeout(t);
    }
    wasLocked.current = lock.locked;
  }, [lock.locked]);

  if (auth.status === 'loading') return <div class="app" aria-busy="true" />;
  if (auth.status === 'signed-out') return <div class="app"><LoginPage /></div>;
  if (auth.status === 'no-access') return <div class="app"><NoAccessPage email={auth.email} reason={auth.reason} /></div>;
  if (auth.status === 'ready' && (lock.locked || lock.covered)) {
    return <div class="app"><LockScreen coverOnly={!lock.locked} /></div>;
  }

  return (
    <div class={`app${reveal ? ' app--reveal' : ''}${speech.status !== 'idle' ? ' app--speaking' : ''}`}>
      <ErrorBoundary resetKey={route}>
        {route === 'heute' && <Today />}
        {route === 'depot' && <DepotTab />}
        {route === 'news' && <NewsTab />}
        {route === 'mehr' && <MorePage />}
      </ErrorBoundary>
      <SpeechBar />
      <TabBar current={route} />
      <UpdateBanner />
      <WhatsNew />
    </div>
  );
}
