import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

render(<App />, document.getElementById('app')!);

if (import.meta.env.PROD) {
  registerSW({ immediate: true });
}
