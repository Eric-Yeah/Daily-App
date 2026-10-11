import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = {
  signInWithPasskey: vi.fn(),
  registerPasskey: vi.fn(),
  passkey: { list: vi.fn(), delete: vi.fn() },
};
vi.mock('./supabase', () => ({
  supabase: () => ({ auth }),
  daily: () => ({}),
  isSchemaNotExposed: () => false,
  supabaseConfigured: false,
}));

const { deletePasskey, listPasskeys, passkeyErrorText, registerPasskey, signInWithPasskey } = await import('./auth');

beforeEach(() => vi.clearAllMocks());

describe('passkeyErrorText', () => {
  it('explains a cancelled Face ID prompt', () => {
    expect(passkeyErrorText({ name: 'NotAllowedError', message: 'The operation either timed out or was not allowed.' })).toMatch(/Abgebrochen/);
  });
  it('explains that passkeys are switched off in the project', () => {
    expect(passkeyErrorText({ message: 'Passkeys not enabled', status: 404 })).toMatch(/noch nicht eingeschaltet/);
  });
  it('explains a missing passkey for this device', () => {
    expect(passkeyErrorText({ message: 'unknown credential' })).toMatch(/noch kein Passkey/);
  });
  it('falls back to the password hint', () => {
    expect(passkeyErrorText({ message: 'weird' })).toMatch(/Passwort/);
    expect(passkeyErrorText(null)).toMatch(/Passwort/);
  });
});

describe('passkey calls', () => {
  it('signs in and returns no error on success', async () => {
    auth.signInWithPasskey.mockResolvedValue({ data: { session: {}, user: {} }, error: null });
    expect(await signInWithPasskey()).toBeNull();
  });

  it('turns a thrown WebAuthn error into text instead of throwing', async () => {
    auth.signInWithPasskey.mockRejectedValue(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
    expect(await signInWithPasskey()).toMatch(/Abgebrochen/);
    auth.registerPasskey.mockRejectedValue(new Error('boom'));
    expect(await registerPasskey()).toMatch(/Passwort/);
  });

  it('returns the service error as text', async () => {
    auth.registerPasskey.mockResolvedValue({ data: null, error: { message: 'Passkeys not enabled' } });
    expect(await registerPasskey()).toMatch(/noch nicht eingeschaltet/);
  });

  it('lists passkeys with a default name', async () => {
    auth.passkey.list.mockResolvedValue({
      data: [{ id: 'a', friendly_name: 'iPhone', created_at: '2026-10-12T08:00:00Z' }, { id: 'b', created_at: '2026-10-13T08:00:00Z' }],
      error: null,
    });
    const list = await listPasskeys();
    expect(list?.map((p) => p.name)).toEqual(['iPhone', 'Passkey']);
    auth.passkey.list.mockResolvedValue({ data: null, error: { message: 'x' } });
    expect(await listPasskeys()).toBeNull();
  });

  it('deletes by id', async () => {
    auth.passkey.delete.mockResolvedValue({ data: null, error: null });
    expect(await deletePasskey('a')).toBeNull();
    expect(auth.passkey.delete).toHaveBeenCalledWith({ passkeyId: 'a' });
  });
});
