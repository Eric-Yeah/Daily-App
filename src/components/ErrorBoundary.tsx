import { Component, type ComponentChildren } from 'preact';

/** Catches rendering errors of a page, so one broken screen never leaves a blank app (the tab bar stays usable). */
export class ErrorBoundary extends Component<{ children: ComponentChildren; resetKey?: string }, { failed: boolean; key?: string }> {
  state = { failed: false, key: this.props.resetKey };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate() {
    // Navigating to another tab gives the page a fresh start.
    if (this.state.key !== this.props.resetKey) this.setState({ failed: false, key: this.props.resetKey });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main class="page">
        <section class="card gap-12 block-state block-state--error" role="alert">
          <h2 class="block-state__title">Hier ist etwas schiefgelaufen</h2>
          <p>Diese Seite konnte nicht angezeigt werden. Du kannst sie neu laden oder einen anderen Tab öffnen.</p>
          <button class="button button--secondary" type="button" onClick={() => location.reload()}>
            Neu laden
          </button>
        </section>
      </main>
    );
  }
}
