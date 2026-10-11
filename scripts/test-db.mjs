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
const migrations = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort();
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

await test('Migrationsstand wird festgehalten', async () => {
  const r = await db.query('select version from daily.schema_migrations order by version');
  assert.deepEqual(
    r.rows.map((x) => x.version),
    migrations.map((f) => f.replace(/\.sql$/, '')),
  );
});

await db.end();
console.log(`${passed} Tests bestanden`);
