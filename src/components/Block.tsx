import type { ComponentChildren } from 'preact';
import type { Block } from '../data/types';
import { formatTime } from '../lib/format';
import { getSettings } from '../lib/settings';

/** Renders a data block: skeleton while loading, honest empty/error card, or the content. */
export function BlockView<T>({
  block,
  title,
  skeletonHeight = 120,
  hideWhenEmpty = false,
  children,
}: {
  block: Block<T> | undefined;
  title?: string;
  skeletonHeight?: number;
  hideWhenEmpty?: boolean;
  children: (data: T) => ComponentChildren;
}) {
  if (!block) return <SkeletonCard height={skeletonHeight} />;
  if (block.status === 'ok') {
    return (
      <>
        {children(block.data)}
        {block.stale && block.asOf && <StaleNote asOf={block.asOf} />}
      </>
    );
  }
  if (block.status === 'empty' && hideWhenEmpty) return null;
  return <StateCard title={title} message={block.message} error={block.status === 'error'} />;
}

/** Shown under data that could not be refreshed: when it was last up to date. */
export function StaleNote({ asOf }: { asOf: string }) {
  return (
    <p class="stale-note" role="status">
      Stand: {formatTime(new Date(asOf), getSettings().timeZone)} · gerade nicht aktuell
    </p>
  );
}

export function StateCard({ title, message, error }: { title?: string; message: string; error?: boolean }) {
  return (
    <section class={`card gap-8 block-state${error ? ' block-state--error' : ''}`} role={error ? 'alert' : undefined}>
      {title && <h2 class="block-state__title">{title}</h2>}
      <p>{message}</p>
    </section>
  );
}

export function SkeletonCard({ height = 120 }: { height?: number }) {
  return (
    <div class="card gap-12" aria-hidden="true">
      <div class="skeleton" style={{ height: '14px', width: '45%' }} />
      <div class="skeleton" style={{ height: `${Math.max(20, height - 60)}px` }} />
      <div class="skeleton" style={{ height: '14px', width: '70%' }} />
    </div>
  );
}

export function InlineState({ block }: { block: Block<unknown> }) {
  if (block.status === 'ok') return null;
  return <p class={`block-state${block.status === 'error' ? ' block-state--error' : ''}`}>{block.message}</p>;
}
