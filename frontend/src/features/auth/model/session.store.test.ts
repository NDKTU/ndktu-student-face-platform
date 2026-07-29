import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/shared/api/auth';
import { useSessionStore } from './session.store';

// Стор ходит в сеть — граница до бэкенда подменяется целиком.
vi.mock('@/shared/api/auth', () => ({
  login: vi.fn(),
  devLogin: vi.fn(),
  me: vi.fn(),
}));

const api = vi.mocked(await import('@/shared/api/auth'));

const store = () => useSessionStore.getState();

const TEACHER: SessionUser = {
  id: 1,
  login: 'oqituvchi',
  role: 'oqituvchi',
  displayName: 'Jasur Bozorov',
  guruh: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  store().signOut();
});

describe('session store', () => {
  it('вход кладёт токен и владельца, роль берётся с сервера', async () => {
    api.login.mockResolvedValueOnce({ token: 'jwt-123', user: TEACHER });

    await store().signIn('oqituvchi', 'parol');

    expect(api.login).toHaveBeenCalledWith('oqituvchi', 'parol');
    expect(store().loggedIn).toBe(true);
    expect(store().token).toBe('jwt-123');
    // Роль приходит с сервера, а не выбирается на клиенте, как было раньше.
    expect(store().role).toBe('oqituvchi');
    expect(store().user?.displayName).toBe('Jasur Bozorov');
  });

  it('неверный пароль не создаёт сессию', async () => {
    api.login.mockRejectedValueOnce(new Error("Login yoki parol noto'g'ri"));

    await expect(store().signIn('oqituvchi', 'xato')).rejects.toThrow("Login yoki parol noto'g'ri");
    expect(store().loggedIn).toBe(false);
    expect(store().token).toBeNull();
  });

  it('переключение персоны — это настоящий перевход с новым токеном', async () => {
    api.devLogin.mockResolvedValueOnce({
      token: 'jwt-student',
      user: { ...TEACHER, login: 'talaba', role: 'talaba', guruh: 'DI-24-01' },
    });

    await store().signInAs('talaba');

    expect(api.devLogin).toHaveBeenCalledWith('talaba');
    expect(store().token).toBe('jwt-student');
    expect(store().role).toBe('talaba');
    expect(store().user?.guruh).toBe('DI-24-01');
  });

  it('выход стирает токен', async () => {
    api.login.mockResolvedValueOnce({ token: 'jwt-123', user: TEACHER });
    await store().signIn('oqituvchi', 'parol');

    store().signOut();

    expect(store().loggedIn).toBe(false);
    expect(store().token).toBeNull();
    expect(store().user).toBeNull();
  });
});
