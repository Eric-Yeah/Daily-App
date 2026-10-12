// Links that come from data (news feeds, briefings, live blog) are only rendered if they are plain web
// addresses. A "javascript:" or "data:" link would run code or show content inside the app's origin.
// In-app routes ("#/news") stay allowed.

export function safeHref(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  if (/^#\/[\w/-]*$/.test(value)) return value;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : undefined;
  } catch {
    return undefined;
  }
}
