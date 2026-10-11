/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

const BASE = '/Daily-App/';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const supabaseOrigin = env.VITE_SUPABASE_URL ? new URL(env.VITE_SUPABASE_URL).origin : '';

  // Strict CSP, injected only into the production build (Vite's dev server needs inline styles).
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self' data:",
    `connect-src 'self'${supabaseOrigin ? ' ' + supabaseOrigin : ''}`,
    "manifest-src 'self'",
    "worker-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');

  return {
    base: BASE,
    build: {
      // Never inline assets as data: URIs; the CSP only allows files from 'self'.
      assetsInlineLimit: 0,
    },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [
      preact(),
      {
        name: 'daily-csp',
        apply: 'build',
        transformIndexHtml(html: string) {
          return html.replace(
            '<!-- CSP -->',
            `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
          );
        },
      },
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        manifest: {
          id: BASE,
          name: 'Daily',
          short_name: 'Daily',
          description: 'Dein Tagesüberblick: Depot, Markt, Training und Termine.',
          lang: 'de',
          start_url: BASE,
          scope: BASE,
          display: 'standalone',
          categories: ['finance', 'productivity'],
          background_color: '#1E2835',
          theme_color: '#1E2835',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          cacheId: 'daily',
          importScripts: ['push-handler.js'],
          cleanupOutdatedCaches: true,
          // Only precache the latin font subsets; the others are never needed for German/English text.
          globPatterns: ['**/*.{js,css,html,svg,png}', '**/*latin*.woff2'],
        },
      }),
    ],
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'supabase/functions/_shared/**/*.test.ts'],
    },
  };
});
