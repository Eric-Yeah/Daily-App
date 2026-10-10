import { TabBar } from './components/TabBar';
import { useRoute } from './router';
import { DepotPage, MorePage, NewsPage } from './views/Pages';
import { Today } from './views/today/Today';

export function App() {
  const route = useRoute();
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
