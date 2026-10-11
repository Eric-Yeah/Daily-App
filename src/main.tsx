import { render } from 'preact';
import { App } from './app';
import { initUpdates } from './lib/update';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

render(<App />, document.getElementById('app')!);

if (import.meta.env.PROD) {
  initUpdates();
}
