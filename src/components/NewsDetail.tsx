import { useState } from 'preact/hooks';
import { loadNewsDetail, type NewsDetail } from '../data/live';
import { detailIsFinal, detailMessage } from '../lib/newsDetail';

// Final results of this session, so a list that is rebuilt (tab change, reload) shows them at once.
// The lasting copy is on the server and comes back with the news.
const seen = new Map<string, NewsDetail>();

/** "Ausführlich": the longer AI summary (1 to 2 minutes) of one news item, created on tap and then cached. */
export function NewsDetailBox({ id, initial }: { id: string; initial?: NewsDetail }) {
  const known = initial ?? seen.get(id);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'done'>(known ? 'done' : 'idle');
  const [detail, setDetail] = useState<NewsDetail | undefined>(known);
  // Fresh result: open. One that was made earlier: collapsed, a tap opens it.
  const [open, setOpen] = useState(false);

  const start = async () => {
    setPhase('loading');
    const d = await loadNewsDetail(id);
    if (d.status === 'ok' || detailIsFinal(d.status)) seen.set(id, d);
    setDetail(d);
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
            {detail.conclusion && (
              <div class="news__conclusion">
                <span class="news__conclusion-label">Fazit</span>
                <p class="news__summary">{detail.conclusion}</p>
              </div>
            )}
            <span class="note">KI-Zusammenfassung, ca. {detail.minutes} Min. Lesezeit. Das Fazit ist keine Anlageberatung. Bitte das Original prüfen.</span>
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
