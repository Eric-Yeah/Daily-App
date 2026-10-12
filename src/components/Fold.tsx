/** Header line of a card that can be folded: the label plus a chevron; the whole line is the button. */
export function FoldHead({ label, collapsed, onToggle }: { label: string; collapsed: boolean; onToggle: () => void }) {
  return (
    <button class="fold" type="button" aria-expanded={!collapsed} onClick={onToggle}>
      <span class="card-label">{label}</span>
      <svg class={`fold__chevron${collapsed ? ' fold__chevron--closed' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M6 15 L12 9 L18 15" />
      </svg>
    </button>
  );
}
