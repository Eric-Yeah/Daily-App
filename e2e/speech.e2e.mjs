// End-to-end test of "Briefing anhören" against the PRODUCTION build (with its Content-Security-Policy and the
// service worker), in Chromium at 390 px. The backend is faked: every request to the (made-up) Supabase project is
// answered here, and the Edge Function "daily-speech" answers like the real one ({ status: 'ok', audio: <base64 MP3> })
// with a real MP3 (24 kHz mono, like Google's MP3 output). iOS only lets a media element play after it was started
// inside a tap; a small shim enforces exactly that, so losing the tap (e.g. play() only after an await) fails here.
//
// Run: npm run test:e2e   (builds into dist-e2e, starts `vite preview`, needs a Playwright Chromium)
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { CORS } from '../supabase/functions/_shared/http.ts';
import { speechHandler } from '../supabase/functions/_shared/tts.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = 4319;
const APP = `http://localhost:${PORT}/Daily-App/`;
const SUPABASE = 'https://e2e-example.supabase.co'; // made up; never contacted, everything is answered by the routes below
const USER_ID = '00000000-0000-4000-8000-000000000001'; // example id
const MP3 = readFileSync(new URL('./fixtures/speech-sample.mp3', import.meta.url)).toString('base64');

const failures = [];
async function step(name, fn) {
  try {
    await fn();
    console.log(`  ok    ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`  FAIL  ${name}\n        ${String(e?.message ?? e).split('\n').join('\n        ')}`);
  }
}

// ---------- build + preview ----------

if (!process.argv.includes('--no-build')) {
  const build = spawnSync('npx', ['vite', 'build', '--outDir', 'dist-e2e', '--emptyOutDir', '--logLevel', 'warn'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, VITE_SUPABASE_URL: SUPABASE, VITE_SUPABASE_ANON_KEY: 'e2e-example-anon-key' },
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
}
const preview = spawn('npx', ['vite', 'preview', '--outDir', 'dist-e2e', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe', detached: true });
const stopPreview = () => {
  try {
    process.kill(-preview.pid);
  } catch {
    // already gone
  }
};
process.on('exit', stopPreview);
for (let i = 0; ; i++) {
  try {
    if ((await fetch(APP)).ok) break;
  } catch {
    // not up yet
  }
  if (i > 100) throw new Error('vite preview did not start');
  await new Promise((r) => setTimeout(r, 200));
}

// ---------- fake backend ----------

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
const wrapRow = {
  kind: 'morning',
  day: today,
  created_at: new Date().toISOString(),
  content: {
    important: [],
    marketNow: null,
    drivers: null,
    wrap: {
      headline: 'Beispiel: Die Märkte starten ruhig in den Tag.',
      points: [],
      sections: [
        { title: 'Über Nacht', text: 'Beispieltext: In Asien schlossen die Börsen leicht im Plus.', sources: [] },
        { title: 'Heute im Blick', text: 'Beispieltext: Am Nachmittag kommen Zahlen zum Arbeitsmarkt.', sources: [] },
      ],
    },
  },
};

// The real handler of the Edge Function (supabase/functions/_shared/tts.ts), with Google and the database faked:
// Google answers { audioContent: <base64 MP3> } like text:synthesize does for audioEncoding MP3.
const speechCalls = [];
const googleCalls = [];
let usedChars = 0;
const speechFunction = speechHandler({
  owner: async (req) => (req.headers.get('authorization') === `Bearer ${session.access_token}` ? USER_ID : null),
  apiKey: () => 'e2e-example-key',
  charsThisMonth: async () => usedChars,
  addUsage: async (chars) => void (usedChars += chars),
  fetch: async (_url, init) => {
    googleCalls.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ audioContent: MP3 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  },
});

function fakeJwt() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER_ID, role: 'authenticated', aud: 'authenticated', exp })}.e2e-example-signature`;
}
const session = (() => {
  const expires_at = Math.floor(Date.now() / 1000) + 3600 * 24;
  return {
    access_token: fakeJwt(),
    refresh_token: 'e2e-example-refresh',
    token_type: 'bearer',
    expires_in: 3600 * 24,
    expires_at,
    user: { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'beispiel@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  };
})();

const REST_CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

async function backend(route) {
  const req = route.request();
  const url = new URL(req.url());
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: REST_CORS, body: '' });
  const json = (body, status = 200) => route.fulfill({ status, headers: { ...REST_CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });

  if (url.pathname === '/functions/v1/daily-speech') {
    const headers = req.headers();
    speechCalls.push({ body: req.postDataJSON(), headers });
    const res = await speechFunction(new Request(req.url(), { method: req.method(), headers, body: req.postData() ?? undefined }));
    const out = Object.fromEntries(res.headers);
    // The function only allows the production origin; the test page runs on localhost, so answer for that origin.
    out['access-control-allow-origin'] = new URL(APP).origin;
    return route.fulfill({ status: res.status, headers: out, body: Buffer.from(await res.arrayBuffer()) });
  }
  if (url.pathname.startsWith('/functions/v1/')) return json({});
  if (url.pathname === '/rest/v1/owner') return json([{ user_id: USER_ID }]);
  if (url.pathname === '/rest/v1/briefings') {
    if (url.searchParams.get('kind') === 'eq.open') return json([]);
    return json([wrapRow]);
  }
  if (url.pathname.startsWith('/rest/v1/rpc/')) return json(null);
  if (url.pathname.startsWith('/rest/v1/')) return json([]);
  if (url.pathname.startsWith('/auth/v1/user')) return json(session.user);
  return json({});
}

// iOS rule, enforced in Chromium: a media element may only start playing if play() is called while a tap is being
// handled; once that happened, the element stays unlocked (like WebKit's per-element user-gesture restriction).
// Everything the page's audio does is logged for the assertions.
const IOS_SHIM = `(() => {
  let inTap = false;
  const tap = () => { inTap = true; setTimeout(() => { inTap = false; }, 0); };
  for (const t of ['click', 'touchend', 'pointerup', 'keydown']) window.addEventListener(t, tap, true);
  const unlocked = new WeakSet();
  const play = HTMLMediaElement.prototype.play;
  window.__audio = { elements: [], blocked: 0, csp: [] };
  HTMLMediaElement.prototype.play = function () {
    if (!window.__audio.elements.includes(this)) window.__audio.elements.push(this);
    if (inTap) unlocked.add(this);
    if (!unlocked.has(this)) {
      window.__audio.blocked++;
      return Promise.reject(new DOMException('play() outside of a tap', 'NotAllowedError'));
    }
    return play.call(this);
  };
  document.addEventListener('securitypolicyviolation', (e) => window.__audio.csp.push(e.violatedDirective + ' ' + e.blockedURI.slice(0, 40)));
})();`;

// ---------- browser ----------

const exe = process.env.CHROMIUM_PATH || undefined; // default: Playwright's own Chromium (PLAYWRIGHT_BROWSERS_PATH)
const browser = await chromium.launch({ executablePath: exe, args: ['--autoplay-policy=user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
await context.addInitScript(({ s, v }) => {
  try {
    localStorage.setItem('daily:auth', JSON.stringify(s));
    localStorage.setItem('daily:seen-version', v); // no "Neu in Version" sheet over the page
  } catch {
    // ignore
  }
}, { s: session, v: VERSION });
await context.addInitScript(IOS_SHIM);
await context.route(`${SUPABASE}/**`, backend);
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => m.type() === 'error' && pageErrors.push(m.text().slice(0, 200)));

const audioState = () =>
  page.evaluate(() => {
    const el = window.__audio.elements.at(-1);
    return {
      count: window.__audio.elements.length,
      blocked: window.__audio.blocked,
      csp: window.__audio.csp,
      src: el ? el.currentSrc.slice(0, 30) : '',
      paused: el ? el.paused : true,
      time: el ? el.currentTime : 0,
      error: el?.error ? el.error.code : null,
    };
  });
const waitFor = async (what, check, timeout = 8000) => {
  const until = Date.now() + timeout;
  let last;
  while (Date.now() < until) {
    last = await audioState();
    if (check(last)) return last;
    await page.waitForTimeout(100);
  }
  throw new Error(`timed out waiting for ${what}; last audio state ${JSON.stringify(last)}`);
};
const bar = page.getByRole('region', { name: 'Vorlesen' });

console.log('Vorlesen (Produktions-Build, CSP + Service Worker, 390 px, Tap-Regel wie iOS)');

const NOW = '?now=2026-10-12T07:30';
await page.goto(APP + NOW);
await step('service worker is installed and controls the page after a reload', async () => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 });
});

await step('the page carries the production CSP and it allows the player sources', async () => {
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  assert.ok(csp, 'no CSP meta tag');
  assert.match(csp, /media-src[^;]*data:/, `CSP has no media-src with data: (${csp})`);
});

const listen = page.getByRole('button', { name: /Morgenbriefing anhören/ });
await step('"Morgenbriefing anhören" is shown', async () => {
  await listen.waitFor({ state: 'visible', timeout: 15000 });
});

await step('tapping it plays the MP3 from daily-speech (playing, time advances, no error)', async () => {
  await listen.tap();
  await bar.waitFor({ state: 'visible', timeout: 3000 });
  const a = await waitFor('audio to play', (s) => !s.paused && s.time > 0.3 && s.src.startsWith('data:audio/mpeg'));
  const b = await waitFor('time to advance', (s) => s.time > a.time + 0.3);
  assert.equal(b.error, null);
  assert.equal(b.blocked, 0, 'a play() call was refused because it was not inside a tap');
  assert.deepEqual(b.csp, [], 'CSP violations');
  assert.ok(speechCalls.length >= 1, 'daily-speech was not called');
  const first = speechCalls[0];
  assert.match(first.headers['authorization'] ?? '', /^Bearer /, 'no user token sent');
  // Every non-simple header the app sends must be allowed by the function's CORS preflight answer.
  const allowed = CORS['Access-Control-Allow-Headers'].split(',').map((h) => h.trim().toLowerCase());
  const simple = ['accept', 'accept-language', 'content-language', 'origin', 'referer', 'user-agent'];
  const custom = Object.keys(first.headers).filter((h) => !simple.includes(h) && !h.startsWith('sec-'));
  assert.deepEqual(custom.filter((h) => !allowed.includes(h)), [], 'headers missing in Access-Control-Allow-Headers');
  assert.equal(googleCalls[0]?.audioConfig?.audioEncoding, 'MP3');
  assert.equal(typeof first.body.text, 'string');
  assert.ok(first.body.text.length > 0 && first.body.text.length <= 700, 'text missing or too long for the function');
  assert.equal(first.body.voice, 'de-DE-Neural2-F');
  assert.equal(first.body.rate, 1);
  assert.match(await bar.innerText(), /Morgenbriefing/);
});

await step('the player fits 390 px (no horizontal scroll, bar inside the viewport)', async () => {
  const box = await bar.boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= 390, `bar box ${JSON.stringify(box)}`);
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(scroll <= 390, `page is ${scroll} px wide`);
  await page.screenshot({ path: `${ROOT}dist-e2e/speech-playing.png` });
});

await step('pause stops the audio, "Weiter" continues it', async () => {
  await bar.getByRole('button', { name: 'Pause' }).tap();
  const p = await waitFor('pause', (s) => s.paused);
  await page.waitForTimeout(500);
  const still = await audioState();
  assert.ok(Math.abs(still.time - p.time) < 0.05, 'time moved while paused');
  assert.match(await bar.innerText(), /pausiert/);
  await bar.getByRole('button', { name: 'Weiter' }).tap();
  await waitFor('resume', (s) => !s.paused && s.time > still.time + 0.3);
});

await step('"Nächster Abschnitt" jumps to the next part and plays it', async () => {
  const before = await bar.innerText();
  const calls = speechCalls.length;
  await bar.getByRole('button', { name: 'Nächster Abschnitt' }).tap();
  await page.waitForFunction((b) => document.querySelector('.speechbar')?.textContent !== b, before.replace(/\n/g, ''), { timeout: 3000 }).catch(() => undefined);
  const s = await waitFor('next part to play', (x) => !x.paused && x.time > 0.3);
  assert.equal(s.blocked, 0);
  assert.notEqual(await bar.innerText(), before, 'the bar still shows the same part');
  assert.ok(speechCalls.length >= calls, 'no audio for the next part');
});

await step('"Voriger Abschnitt" goes back and plays', async () => {
  await bar.getByRole('button', { name: 'Voriger Abschnitt' }).tap();
  await waitFor('previous part to play', (x) => !x.paused && x.time > 0.3);
});

await step('a chunk that ends moves on to the next chunk without a tap', async () => {
  // 3 s per chunk: wait for one to end and the next part to start by itself
  const until = Date.now() + 9000;
  let moved = false;
  let last = '';
  const start = await bar.innerText();
  while (Date.now() < until && !moved) {
    await page.waitForTimeout(250);
    last = (await bar.count()) ? await bar.innerText() : '(closed)';
    moved = last !== start;
  }
  const s = await audioState();
  assert.ok(moved, `player did not move on (still "${start}")`);
  assert.equal(s.blocked, 0, 'continuing after "ended" was refused (outside a tap)');
  assert.equal(s.error, null);
});

await step('stop closes the player and leaves no error', async () => {
  if (await bar.count()) await bar.getByRole('button', { name: 'Vorlesen beenden' }).tap();
  await bar.waitFor({ state: 'detached', timeout: 3000 });
  assert.equal(await page.getByRole('alert').count(), 0, 'an error message is shown');
  const s = await audioState();
  assert.ok(s.paused);
});

await step('an error answer (budget) is shown in German', async () => {
  const before = usedChars;
  usedChars = 800_000;
  await listen.tap();
  await page.getByRole('alert').filter({ hasText: 'Limit' }).waitFor({ timeout: 4000 });
  usedChars = before;
});

await step('"Probe anhören" under Mehr plays too', async () => {
  await page.getByRole('link', { name: 'Mehr' }).or(page.getByRole('button', { name: 'Mehr' })).first().tap();
  const probe = page.getByRole('button', { name: /Probe anhören/ });
  await probe.waitFor({ timeout: 5000 });
  await probe.tap();
  await waitFor('sample to play', (s) => !s.paused && s.time > 0.3);
  const s = await audioState();
  assert.equal(s.blocked, 0);
  assert.deepEqual(s.csp, []);
});

await step('no page errors', async () => {
  const relevant = pageErrors.filter((e) => !/Failed to load resource/.test(e));
  assert.deepEqual(relevant, []);
});

await browser.close();
stopPreview();
if (failures.length) {
  console.log(`\n${failures.length} Schritt(e) fehlgeschlagen.`);
  process.exit(1);
}
console.log('\nAlles grün.');
process.exit(0);
