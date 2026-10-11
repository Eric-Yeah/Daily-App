import { useSubPath } from '../../router';
import { DepotHome } from './DepotHome';
import { GroupsPage } from './GroupsPage';
import { ImportPage } from './ImportPage';
import { PositionFormPage } from './PositionForm';

/** Depot tab: #/depot, #/depot/neu, #/depot/p/<id>, #/depot/gruppen, #/depot/import */
export function DepotTab() {
  const [first, second] = useSubPath();
  if (first === 'neu') return <PositionFormPage />;
  if (first === 'p' && second) return <PositionFormPage id={second} />;
  if (first === 'gruppen') return <GroupsPage />;
  if (first === 'import') return <ImportPage />;
  return <DepotHome />;
}
