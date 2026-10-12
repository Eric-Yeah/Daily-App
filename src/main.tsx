import { render } from 'preact';
import { App } from './app';
import { initUpdates } from './lib/update';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

// Clickjacking: GitHub Pages cannot send X-Frame-Options or a frame-ancestors header (a meta CSP ignores it),
// so the app refuses to start inside a frame of another page.
let framed = true;
try {
  framed = window.top !== window.self;
} catch {
  // Cross-origin parent: reading window.top throws, which also means "framed".
}

if (framed) {
  document.getElementById('app')!.textContent = 'Daily kann nur direkt geöffnet werden.';
} else {
  render(<App />, document.getElementById('app')!);
  if (import.meta.env.PROD) {
    initUpdates();
  }
}
