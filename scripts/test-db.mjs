// Database tests: applies all migrations to an empty in-memory Postgres (PGlite, with a
// Supabase stub) and checks Row Level Security. Never touches the real database.
// Run: npm run test:db
import { readdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

const OWNER = '00000000-0000-4000-8000-00000000000a';
const OTHER = '00000000-0000-4000-8000-00000000000b';

const pglite = new PGlite();
// Small adapter so the tests read like node-postgres: query() returns rowCount.
const db = {
  async query(sql, params) {
    const r = params ? await pglite.query(sql, params) : await pglite.exec(sql).then((rs) => rs.at(-1));
    return { rows: r?.rows ?? [], rowCount: r?.affectedRows || r?.rows?.length || 0 };
  },
  end: () => pglite.close(),
};

const run = (file) => pglite.exec(readFileSync(file, 'utf8'));
await run('supabase/tests/supabase-stub.sql');
// Migrations marked "-- supabase-only" need Supabase extensions (pg_cron, pg_net) and are skipped here.
const migrations = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql') && !readFileSync(`supabase/migrations/${f}`, 'utf8').startsWith('-- supabase-only'))
  .sort();
for (const f of migrations) await run(`supabase/migrations/${f}`);
// Every migration must be safe to run twice.
for (const f of migrations) await run(`supabase/migrations/${f}`);

await db.query('insert into auth.users (id, email) values ($1, $2), ($3, $4) on conflict do nothing', [
  OWNER,
  'owner@example.com',
  OTHER,
  'other@example.com',
]);
await db.query('insert into daily.owner (user_id) values ($1) on conflict do nothing', [OWNER]);

/** Runs `fn` inside a transaction as the given Supabase role (and user), then rolls back. */
async function as(role, userId, fn) {
  await db.query('begin');
  try {
    await db.query(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? '']);
    return await fn();
  } finally {
    await db.query('rollback');
  }
}

/** Same as `as`, but keeps the changes. */
async function asCommit(role, userId, fn) {
  await db.query('begin');
  await db.query(`set local role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? '']);
  const r = await fn();
  await db.query('commit');
  return r;
}

const rejects = async (p, re, label) => {
  await assert.rejects(p, re, label);
  // A failed statement aborts the transaction; `as` rolls it back.
};

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}\n    ${e.message}`);
    process.exitCode = 1;
  }
}

console.log('RLS-Tests (Schema daily)');

await asCommit('authenticated', OWNER, () => db.query("insert into daily.tasks (title) values ('Beispielaufgabe')"));
await asCommit('authenticated', OWNER, () => db.query("insert into daily.settings (display_name) values ('Beispiel')"));
await asCommit('authenticated', OWNER, () =>
  db.query("insert into daily.day_notes (day, note) values ('2026-10-12', 'Beispielzeile')"),
);

await test('Besitzer sieht seine Aufgaben, Einstellungen und Notizen', () =>
  as('authenticated', OWNER, async () => {
    assert.equal((await db.query('select * from daily.tasks')).rowCount, 1);
    assert.equal((await db.query('select * from daily.settings')).rowCount, 1);
    assert.equal((await db.query('select * from daily.day_notes')).rowCount, 1);
    assert.equal((await db.query('select * from daily.owner')).rowCount, 1);
  }),
);

await test('Fremdes Konto sieht nichts', () =>
  as('authenticated', OTHER, async () => {
    assert.equal((await db.query('select * from daily.tasks')).rowCount, 0);
    assert.equal((await db.query('select * from daily.settings')).rowCount, 0);
    assert.equal((await db.query('select * from daily.day_notes')).rowCount, 0);
    assert.equal((await db.query('select * from daily.owner')).rowCount, 0);
  }),
);

await test('Fremdes Konto kann nichts anlegen', () =>
  as('authenticated', OTHER, () =>
    rejects(db.query("insert into daily.tasks (title) values ('x')"), /row-level security/),
  ),
);

await test('Fremdes Konto kann Daten des Besitzers nicht ändern oder löschen', () =>
  as('authenticated', OTHER, async () => {
    assert.equal((await db.query("update daily.tasks set title = 'gehackt'")).rowCount, 0);
    assert.equal((await db.query('delete from daily.tasks')).rowCount, 0);
  }),
);

await test('Besitzer kann keine Zeilen für andere anlegen', () =>
  as('authenticated', OWNER, () =>
    rejects(db.query('insert into daily.tasks (user_id, title) values ($1, $2)', [OTHER, 'x']), /row-level security/),
  ),
);

await test('Niemand kann sich selbst zum Besitzer machen', () =>
  as('authenticated', OTHER, () =>
    rejects(db.query('insert into daily.owner (user_id) values ($1)', [OTHER]), /permission denied/),
  ),
);

await test('Ohne Anmeldung (anon) kein Zugriff', () =>
  as('anon', null, () => rejects(db.query('select * from daily.tasks'), /permission denied/)),
);

await test('Eingaben werden begrenzt (Titellänge)', () =>
  as('authenticated', OWNER, () =>
    rejects(db.query('insert into daily.tasks (title) values ($1)', ['x'.repeat(201)]), /check constraint/),
  ),
);

await test('Server (service_role) sieht alles', () =>
  as('service_role', null, async () => {
    assert.equal((await db.query('select * from daily.tasks')).rowCount, 1);
  }),
);

// --- Depot (0002) ---
const ISIN = 'IE00B4L5Y983';
const ownGroup = await asCommit('authenticated', OWNER, async () =>
  (await db.query("insert into daily.groups (name) values ('Welt breit') returning id")).rows[0].id,
);
await asCommit('authenticated', OWNER, () =>
  db.query(
    "insert into daily.positions (name, isin, quantity, cost_per_unit, group_id, topics) values ('Beispiel-ETF', $1, 10, 80.5, $2, '{Welt,USA}')",
    [ISIN, ownGroup],
  ),
);

await test('Depot: Besitzer sieht Gruppen und Positionen', () =>
  as('authenticated', OWNER, async () => {
    assert.equal((await db.query('select * from daily.groups')).rowCount, 1);
    const r = await db.query('select quantity, cost_per_unit, topics from daily.positions');
    assert.equal(r.rowCount, 1);
  }),
);

await test('Depot: fremdes Konto sieht und ändert nichts', () =>
  as('authenticated', OTHER, async () => {
    assert.equal((await db.query('select * from daily.positions')).rowCount, 0);
    assert.equal((await db.query('select * from daily.groups')).rowCount, 0);
    assert.equal((await db.query('update daily.positions set quantity = 0')).rowCount, 0);
    assert.equal((await db.query('delete from daily.groups')).rowCount, 0);
  }),
);

await test('Depot: keine Position mit der Gruppe eines anderen Kontos', async () => {
  // A second owner-like user with own data, pointing at the first owner's group, must fail.
  await db.query('insert into daily.owner (user_id) values ($1) on conflict do nothing', [OTHER]);
  try {
    await as('authenticated', OTHER, () =>
      rejects(
        db.query("insert into daily.positions (name, isin, quantity, cost_per_unit, group_id) values ('x', 'DE0005140008', 1, 1, $1)", [ownGroup]),
        /foreign key/,
      ),
    );
  } finally {
    await db.query('delete from daily.owner where user_id = $1', [OTHER]);
  }
});

await test('Depot: ISIN und Mengen werden geprüft', () =>
  as('authenticated', OWNER, async () => {
    await rejects(db.query("insert into daily.positions (name, isin, quantity, cost_per_unit) values ('x', 'kein-isin', 1, 1)"), /check constraint/);
  }).then(() =>
    as('authenticated', OWNER, () =>
      rejects(db.query("insert into daily.positions (name, isin, quantity, cost_per_unit) values ('x', 'DE0005140008', -1, 1)"), /check constraint/),
    ),
  ),
);

await test('Depot: gleiche ISIN nur einmal je Konto', () =>
  as('authenticated', OWNER, () =>
    rejects(db.query("insert into daily.positions (name, isin, quantity, cost_per_unit) values ('x', $1, 1, 1)", [ISIN]), /duplicate key/),
  ),
);

// A failed statement aborts the transaction, so every rejection gets its own `as` block.
await test('Depot: WKN statt ISIN ist erlaubt, gleiche WKN nur einmal je Konto', () =>
  as('authenticated', OWNER, async () => {
    await db.query("insert into daily.positions (name, wkn, quantity, cost_per_unit) values ('Nur WKN', 'A0RPWH', 1, 1)");
    await rejects(db.query("insert into daily.positions (name, wkn, quantity, cost_per_unit) values ('x', 'A0RPWH', 1, 1)"), /duplicate key/);
  }),
);

await test('Depot: ISIN oder WKN ist Pflicht', () =>
  as('authenticated', OWNER, () =>
    rejects(db.query("insert into daily.positions (name, quantity, cost_per_unit) values ('x', 1, 1)"), /check constraint/),
  ),
);

await test('Depot: WKN wird auf 6 Zeichen geprüft', () =>
  as('authenticated', OWNER, () =>
    rejects(db.query("insert into daily.positions (name, wkn, quantity, cost_per_unit) values ('x', 'zu-kurz', 1, 1)"), /check constraint/),
  ),
);

await test('Depot: Sparplan mit Betrag und Tag', () =>
  as('authenticated', OWNER, async () => {
    await db.query("insert into daily.positions (name, wkn, quantity, cost_per_unit, savings_amount, savings_day) values ('Sparplan', 'A0RPWH', 1, 1, 50, 15)");
    const r = await db.query("select savings_amount, savings_day from daily.positions where wkn = 'A0RPWH'");
    assert.equal(Number(r.rows[0].savings_amount), 50);
    assert.equal(Number(r.rows[0].savings_day), 15);
  }),
);

await test('Depot: Sparplan-Betrag muss positiv sein', () =>
  as('authenticated', OWNER, () =>
    rejects(db.query("insert into daily.positions (name, wkn, quantity, cost_per_unit, savings_amount) values ('x', 'A0RPWH', 1, 1, 0)"), /check constraint/),
  ),
);

await test('Depot: Sparplan-Tag nur 1 bis 28 und nur mit Betrag', () =>
  as('authenticated', OWNER, () =>
    rejects(db.query("insert into daily.positions (name, wkn, quantity, cost_per_unit, savings_amount, savings_day) values ('x', 'A0RPWH', 1, 1, 10, 31)"), /check constraint/),
  ).then(() =>
    as('authenticated', OWNER, () =>
      rejects(db.query("insert into daily.positions (name, wkn, quantity, cost_per_unit, savings_day) values ('x', 'A0RPWH', 1, 1, 5)"), /check constraint/),
    ),
  ),
);

await test('Depot: Gruppe löschen lässt die Position ohne Gruppe stehen', () =>
  as('authenticated', OWNER, async () => {
    await db.query('delete from daily.groups');
    const r = await db.query('select group_id from daily.positions');
    assert.equal(r.rows[0].group_id, null);
  }),
);

await test('Depot: ohne Anmeldung kein Zugriff', () =>
  as('anon', null, () => rejects(db.query('select * from daily.positions'), /permission denied/)),
);

// --- News, Briefings, Push (0003, 0004) ---
await db.query(
  "insert into daily.news_items (url, title, source, published_at, feed) values ('https://example.com/a', 'Beispielmeldung', 'Beispiel', now(), 'test')",
);
await db.query("insert into daily.briefings (kind, day, content) values ('morning', current_date, '{}')");
await db.query("insert into daily.push_keys (public_key, private_jwk) values ('PUB', '{\"d\":\"geheim\"}') on conflict do nothing");

await test('News: Besitzer liest Meldungen, Briefings und Termine', () =>
  as('authenticated', OWNER, async () => {
    assert.equal((await db.query('select * from daily.news_items')).rowCount, 1);
    assert.equal((await db.query('select * from daily.briefings')).rowCount, 1);
    assert.ok((await db.query('select * from daily.market_events')).rowCount >= 40);
  }),
);

await test('News: fremdes Konto sieht keine Meldungen, Briefings oder Kosten', () =>
  as('authenticated', OTHER, async () => {
    assert.equal((await db.query('select * from daily.news_items')).rowCount, 0);
    assert.equal((await db.query('select * from daily.briefings')).rowCount, 0);
    assert.equal((await db.query('select * from daily.ai_usage')).rowCount, 0);
    assert.equal((await db.query('select * from daily.market_events')).rowCount, 0);
  }),
);

await test('News: nur der Server schreibt Meldungen und Kosten', () =>
  as('authenticated', OWNER, () =>
    rejects(db.query("insert into daily.news_items (url, title, source, published_at, feed) values ('https://x.y', 't', 's', now(), 'f')"), /permission denied/),
  ).then(() =>
    as('authenticated', OWNER, () => rejects(db.query("select daily.ai_usage_add('m', 1, 1, 1)"), /permission denied/)),
  ),
);

await test('Push: nur der öffentliche Schlüssel ist lesbar, der private nie', () =>
  as('authenticated', OWNER, async () => {
    assert.equal((await db.query('select public_key from daily.push_keys')).rows[0].public_key, 'PUB');
  }).then(() =>
    as('authenticated', OWNER, () => rejects(db.query('select private_jwk from daily.push_keys'), /permission denied/)),
  ),
);

await test('Push: Abos nur für das eigene Konto', () =>
  as('authenticated', OWNER, async () => {
    await db.query("insert into daily.push_subscriptions (endpoint, p256dh, auth) values ('https://push.example.com/1', 'k', 'a')");
    assert.equal((await db.query('select * from daily.push_subscriptions')).rowCount, 1);
  }).then(() =>
    as('authenticated', OTHER, () =>
      rejects(db.query("insert into daily.push_subscriptions (endpoint, p256dh, auth) values ('https://push.example.com/2', 'k', 'a')"), /row-level security/),
    ),
  ),
);

await test('Cron-Kennung: im Tresor erzeugt, nur für den Server', async () => {
  const r = await as('service_role', null, () => db.query('select daily.cron_secret() as s'));
  assert.ok(r.rows[0].s && r.rows[0].s.length >= 60);
  await as('authenticated', OWNER, () => rejects(db.query('select daily.cron_secret()'), /permission denied/));
  await as('anon', null, () => rejects(db.query('select daily.cron_secret()'), /permission denied/));
});

await test('Server zählt KI-Kosten zusammen', () =>
  as('service_role', null, async () => {
    await db.query("select daily.ai_usage_add('claude-haiku-5-5', 1000, 200, 0.0002)");
    await db.query("select daily.ai_usage_add('claude-haiku-5-5', 1000, 200, 0.0002)");
    const r = await db.query('select requests, input_tokens, cost_usd from daily.ai_usage');
    assert.equal(r.rows[0].requests, 2);
    assert.equal(Number(r.rows[0].input_tokens), 2000);
  }),
);

await test('KI-Kosten werden nach Zweck getrennt (0015)', () =>
  as('service_role', null, async () => {
    await db.query('delete from daily.ai_usage');
    await db.query("select daily.ai_usage_add('claude-haiku-5-5', 1000, 200, 0.0002, 'live')");
    await db.query("select daily.ai_usage_add('claude-haiku-5-5', 1000, 200, 0.0002, 'live')");
    await db.query("select daily.ai_usage_add('claude-haiku-5-5', 500, 1500, 0.0008, 'live!')");
    await db.query("select daily.ai_usage_add('claude-haiku-5-5', 1000, 200, 0.0002)");
    const r = await db.query('select purpose, requests, cost_usd from daily.ai_usage order by purpose');
    assert.deepEqual(r.rows.map((x) => [x.purpose, x.requests]), [['live', 2], ['live!', 1], ['unknown', 1]]);
    await as('authenticated', OWNER, () => rejects(db.query("select daily.ai_usage_add('m', 1, 1, 1, 'x')"), /permission denied/));
  }),
);

// --- Kurse (0006) ---
await asCommit('service_role', null, async () => {
  await db.query("insert into daily.price_snapshots (symbol, ts, price) values ('TEST.X', '2026-10-12T08:00:00Z', 101.5)");
  await db.query("insert into daily.price_daily (symbol, day, close) values ('TEST.X', '2026-10-09', 100)");
});

await test('Kurse: Besitzer liest, fremdes Konto und anon nicht', async () => {
  await as('authenticated', OWNER, async () => {
    assert.equal((await db.query('select * from daily.price_snapshots')).rowCount, 1);
    assert.equal((await db.query('select * from daily.price_daily')).rowCount, 1);
  });
  await as('authenticated', OTHER, async () => {
    assert.equal((await db.query('select * from daily.price_snapshots')).rowCount, 0);
    assert.equal((await db.query('select * from daily.price_daily')).rowCount, 0);
  });
  await as('anon', null, () => rejects(db.query('select * from daily.price_snapshots'), /permission denied/));
});

await test('Kurse: nur der Server schreibt', () =>
  as('authenticated', OWNER, () =>
    rejects(db.query("insert into daily.price_snapshots (symbol, ts, price) values ('X', now(), 1)"), /permission denied/),
  ).then(() =>
    as('authenticated', OWNER, () => rejects(db.query("update daily.price_daily set close = 1"), /permission denied/)),
  ),
);

await test('Kurse: Preis muss positiv sein, Symbol begrenzt', () =>
  as('service_role', null, () =>
    rejects(db.query("insert into daily.price_snapshots (symbol, ts, price) values ('X', now(), 0)"), /check constraint/),
  ).then(() =>
    as('service_role', null, () =>
      rejects(db.query('insert into daily.price_daily (symbol, day, close) values ($1, current_date, 1)', ['x'.repeat(41)]), /check constraint/),
    ),
  ),
);

// --- Live-Blog (0008) ---
await asCommit('service_role', null, () =>
  db.query("insert into daily.liveblog_entries (day, headline, body, sources) values (current_date, 'Test', 'Text', '[]')"),
);

await test('Live-Blog: Besitzer liest, fremdes Konto und anon nicht, nur der Server schreibt', async () => {
  await as('authenticated', OWNER, async () => assert.equal((await db.query('select * from daily.liveblog_entries')).rowCount, 1));
  await as('authenticated', OTHER, async () => assert.equal((await db.query('select * from daily.liveblog_entries')).rowCount, 0));
  await as('anon', null, () => rejects(db.query('select * from daily.liveblog_entries'), /permission denied/));
  await as('authenticated', OWNER, () =>
    rejects(db.query("insert into daily.liveblog_entries (day, headline, body) values (current_date, 'x', 'y')"), /permission denied/),
  );
});

await test('Live-Blog: Wichtigkeit und Länge begrenzt', () =>
  as('service_role', null, () =>
    rejects(db.query("insert into daily.liveblog_entries (day, headline, body, importance) values (current_date, 'x', 'y', 9)"), /check constraint/),
  ).then(() =>
    as('service_role', null, () =>
      rejects(db.query('insert into daily.liveblog_entries (day, headline, body) values (current_date, $1, $2)', ['x', 'y'.repeat(801)]), /check constraint/),
    ),
  ),
);

// --- Ausführliche Zusammenfassung (0011) ---
const detailItem = (await asCommit('service_role', null, () => db.query("select id from daily.news_items limit 1"))).rows[0].id;
await asCommit('service_role', null, () =>
  db.query("insert into daily.news_details (item_id, status, summary, model) values ($1, 'ok', 'Eigene Zusammenfassung', 'test')", [detailItem]),
);

await test('Ausführlich: Besitzer liest, fremdes Konto und anon nicht, nur der Server schreibt', async () => {
  await as('authenticated', OWNER, async () => assert.equal((await db.query('select * from daily.news_details')).rowCount, 1));
  await as('authenticated', OTHER, async () => assert.equal((await db.query('select * from daily.news_details')).rowCount, 0));
  await as('anon', null, () => rejects(db.query('select * from daily.news_details'), /permission denied/));
  await as('authenticated', OWNER, () => rejects(db.query("insert into daily.news_details (item_id, status) values (1, 'no_text')"), /permission denied/));
});

await test('Ausführlich: Status und Text passen zusammen, Länge begrenzt', async () => {
  const bad = (sql, params = []) => as('service_role', null, () => rejects(db.query(sql, params), /check constraint/));
  await bad("insert into daily.news_details (item_id, status) values ($1, 'ok')", [detailItem]);
  await bad("insert into daily.news_details (item_id, status, summary) values ($1, 'no_text', 'Text')", [detailItem]);
  await bad("insert into daily.news_details (item_id, status) values ($1, 'paywall')", [detailItem]);
  await bad("insert into daily.news_details (item_id, status, summary) values ($1, 'ok', $2)", [detailItem, 'x'.repeat(3001)]);
});

await test('Ausführlich: Fazit ist begrenzt', () =>
  as('service_role', null, () => rejects(db.query('update daily.news_details set conclusion = $1', ['x'.repeat(601)]), /check constraint/)),
);

// --- Systematic attack checks over EVERY table and function in "daily" (also catches tables added later) ---
// Tables the owner may write from the app; everything else is written by the server (service_role) only.
const APP_WRITABLE = new Set(['settings', 'tasks', 'day_notes', 'groups', 'positions', 'push_subscriptions']);
// Functions a signed-in user may call; all others are for the server only.
const APP_CALLABLE = new Set(['is_owner']);
const tables = (await db.query("select tablename from pg_tables where schemaname = 'daily' order by tablename")).rows.map((r) => r.tablename);

await test('Angriff: jede Tabelle hat Row Level Security', async () => {
  const r = await db.query("select relname from pg_class where relnamespace = 'daily'::regnamespace and relkind in ('r', 'p') and not relrowsecurity");
  assert.deepEqual(r.rows.map((x) => x.relname), []);
  // No views or materialized views: they would bypass RLS of the tables underneath.
  const v = await db.query("select relname from pg_class where relnamespace = 'daily'::regnamespace and relkind in ('v', 'm')");
  assert.deepEqual(v.rows.map((x) => x.relname), []);
});

await test('Angriff: ohne Anmeldung (anon) kein Zugriff auf das Schema und keine Rechte auf irgendeiner Tabelle', async () => {
  assert.equal((await db.query("select has_schema_privilege('anon', 'daily', 'USAGE') as u")).rows[0].u, false);
  for (const t of tables) {
    for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
      const r = await db.query('select has_table_privilege($1, $2, $3) as ok', ['anon', `daily.${t}`, priv]);
      assert.equal(r.rows[0].ok, false, `anon hat ${priv} auf daily.${t}`);
    }
    await as('anon', null, () => rejects(db.query(`select * from daily.${t}`), /permission denied/, `anon liest daily.${t}`));
  }
});

await test('Angriff: angemeldete Konten schreiben nur in die erlaubten Tabellen, nie TRUNCATE', async () => {
  for (const t of tables) {
    for (const priv of ['INSERT', 'UPDATE', 'DELETE']) {
      const r = await db.query('select has_table_privilege($1, $2, $3) as ok', ['authenticated', `daily.${t}`, priv]);
      // push_subscriptions has no UPDATE on purpose (delete and insert instead).
      const allowed = APP_WRITABLE.has(t) && !(t === 'push_subscriptions' && priv === 'UPDATE');
      assert.equal(r.rows[0].ok, allowed, `authenticated ${priv} auf daily.${t}`);
    }
    for (const priv of ['TRUNCATE', 'REFERENCES', 'TRIGGER']) {
      const r = await db.query('select has_table_privilege($1, $2, $3) as ok', ['authenticated', `daily.${t}`, priv]);
      assert.equal(r.rows[0].ok, false, `authenticated ${priv} auf daily.${t}`);
    }
  }
});

await test('Angriff: selbst registriertes fremdes Konto liest, ändert und löscht in keiner Tabelle etwas', async () => {
  for (const t of tables) {
    const cols = (await db.query("select column_name from information_schema.columns where table_schema = 'daily' and table_name = $1 and is_identity = 'NO' and is_generated = 'NEVER' order by ordinal_position", [t])).rows;
    // Reading: no rows, or no permission at all (columns like push_keys.private_jwk).
    await as('authenticated', OTHER, async () => {
      try {
        assert.equal((await db.query(`select * from daily.${t}`)).rowCount, 0, `fremdes Konto liest daily.${t}`);
      } catch (e) {
        assert.match(e.message, /permission denied/, `daily.${t}`);
      }
    });
    for (const sql of [`update daily.${t} set ${cols[0].column_name} = ${cols[0].column_name}`, `delete from daily.${t}`]) {
      await as('authenticated', OTHER, async () => {
        try {
          assert.equal((await db.query(sql)).rowCount, 0, `fremdes Konto: ${sql}`);
        } catch (e) {
          assert.match(e.message, /permission denied|row-level security/, sql);
        }
      });
    }
  }
});

await test('Angriff: Funktionen nur für den Server, mit festem search_path', async () => {
  const fns = (
    await db.query(
      "select p.oid, p.proname, p.prosecdef, p.proconfig from pg_proc p where p.pronamespace = 'daily'::regnamespace order by p.proname",
    )
  ).rows;
  assert.ok(fns.length >= 3);
  for (const f of fns) {
    for (const role of ['anon', 'public']) {
      const r = await db.query(
        role === 'public'
          ? "select exists (select 1 from pg_proc, aclexplode(coalesce(proacl, acldefault('f', proowner))) a where oid = $1 and a.grantee = 0 and a.privilege_type = 'EXECUTE') as ok"
          : "select has_function_privilege('anon', $1::oid, 'EXECUTE') as ok",
        [f.oid],
      );
      assert.equal(r.rows[0].ok, false, `${role} darf daily.${f.proname}() aufrufen`);
    }
    const auth = (await db.query("select has_function_privilege('authenticated', $1::oid, 'EXECUTE') as ok", [f.oid])).rows[0].ok;
    assert.equal(auth, APP_CALLABLE.has(f.proname), `authenticated darf daily.${f.proname}() aufrufen`);
    // SECURITY DEFINER runs with the owner's rights: an unset search_path would let a caller swap in own objects.
    if (f.prosecdef) assert.ok((f.proconfig ?? []).some((c) => c.startsWith('search_path=')), `daily.${f.proname}() ohne search_path`);
  }
});

await test('Angriff: fremdes Konto ist kein Besitzer, auch nicht über is_owner()', () =>
  as('authenticated', OTHER, async () => {
    assert.equal((await db.query('select daily.is_owner() as ok')).rows[0].ok, false);
  }),
);

await test('Migrationsstand wird festgehalten', async () => {
  const r = await db.query('select version from daily.schema_migrations order by version');
  assert.deepEqual(
    r.rows.map((x) => x.version),
    migrations.map((f) => f.replace(/\.sql$/, '')),
  );
});

await db.end();
console.log(`${passed} Tests bestanden`);
