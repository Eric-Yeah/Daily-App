import { useState } from 'preact/hooks';
import { loadNewsDetail, type NewsDetail } from '../data/live';
import { detailIsFinal, detailMessage } from '../lib/newsDetail';

/** "Ausführlich": the longer AI summary (1 to 2 minutes) of one news item, created on tap and then cached. */
export function NewsDetailBox({ id }: { id: string }) {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'done'>('idle');
  const [detail, setDetail] = useState<NewsDetail>();
  const [open, setOpen] = useState(true);

  const start = async () => {
    setPhase('loading');
    setDetail(await loadNewsDetail(id));
    setOpen(true);
    setPhase('done');
  };

  if (phase === 'done' && detail?.status === 'ok') {
    return (
      <div class="news__detail">
        <button class="link-button news__more" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Ausführlich einklappen ▴' : 'Ausführlich anzeigen ▾'}
        </button>
        {open && (
          <>
            {detail.paragraphs.map((p, i) => (
              <p key={i} class="news__summary">
                {p}
              </p>
            ))}
            <span class="note">KI-Zusammenfassung, ca. {detail.minutes} Min. Lesezeit. Bitte das Original prüfen.</span>
          </>
        )}
      </div>
    );
  }

  const failed = phase === 'done' && detail && detail.status !== 'ok' ? detail.status : null;
  return (
    <div class="news__detail">
      {failed && (
        <p class="note" role="status">
          {detailMessage(failed)}
        </p>
      )}
      {!(failed && detailIsFinal(failed)) && (
        <button class="link-button news__more" type="button" disabled={phase === 'loading'} aria-busy={phase === 'loading'} onClick={start}>
          {phase === 'loading' ? 'Wird gelesen und zusammengefasst …' : failed ? 'Nochmal versuchen' : 'Ausführlich (1 bis 2 Min.)'}
        </button>
      )}
    </div>
  );
}
