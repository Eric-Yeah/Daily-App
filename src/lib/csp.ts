// Content-Security-Policy of the production build (injected as a meta tag by vite.config.ts; the dev server has none).
// Kept here so a test can check it: a missing directive blocks a feature only in the installed app, silently.

/** The CSP for the given Supabase origin (empty: no backend configured). */
export function contentSecurityPolicy(supabaseOrigin: string): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self' data:",
    // Read-aloud: the player gets the MP3 from the Edge Function as a data: URL (blob: kept as a fallback format).
    // Without this line media falls back to default-src 'self' and Safari refuses the audio ("NotSupportedError").
    "media-src 'self' data: blob:",
    `connect-src 'self'${supabaseOrigin ? ' ' + supabaseOrigin : ''}`,
    "manifest-src 'self'",
    "worker-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}
