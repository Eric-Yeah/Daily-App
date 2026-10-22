import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from './csp';
import { readSpeechAnswer } from './speech';

const directive = (csp: string, name: string): string[] =>
  csp
    .split(';')
    .map((d) => d.trim().split(/\s+/))
    .find(([n]) => n === name)
    ?.slice(1) ?? [];

describe('contentSecurityPolicy', () => {
  const csp = contentSecurityPolicy('https://example-project.supabase.co');

  it('lets the read-aloud player load its audio', () => {
    const media = directive(csp, 'media-src');
    // The player URL comes from readSpeechAnswer: its scheme must be allowed, or the installed app stays silent.
    const answer = readSpeechAnswer({ status: 'ok', audio: 'AAAA' });
    expect(answer.ok).toBe(true);
    const scheme = answer.ok ? `${new URL(answer.url).protocol}` : '';
    expect(media).toContain(scheme);
    expect(media).toContain('blob:');
  });

  it('lets the app call Supabase (also the Edge Functions) and nothing else', () => {
    expect(directive(csp, 'connect-src')).toEqual(["'self'", 'https://example-project.supabase.co']);
    expect(directive(contentSecurityPolicy(''), 'connect-src')).toEqual(["'self'"]);
  });

  it('stays strict for scripts', () => {
    expect(directive(csp, 'script-src')).toEqual(["'self'"]);
    expect(directive(csp, 'default-src')).toEqual(["'self'"]);
  });
});
