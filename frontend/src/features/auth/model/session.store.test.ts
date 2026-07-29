import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeResponse } from '@/shared/api/auth';
import { ApiError } from '@/shared/api/http';
import { getToken } from '@/shared/lib/tokenStorage';
import { useSessionStore } from './session.store';

// Стор ходит в сеть — граница до бэкенда подменяется целиком.
vi.mock('@/shared/api/auth', () => ({
  login: vi.fn(),
  me: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
  changeCredentials: vi.fn(),
}));

const api = vi.mocked(await import('@/shared/api/auth'));

const store = () => useSessionStore.getState();

function meResponse(over: Partial<MeResponse> = {}): MeResponse {
  return {
    id: 1,
    username: 'j.bozorov',
    roles: [
      { id: 2, name: 'teacher', permissions: [{ id: 10, name: 'read:quiz' }] },
    ],
    employee: {
      id: 5,
      first_name: 'Jasur',
      last_name: 'Bozorov',
      third_name: '',
      full_name: 'Bozorov Jasur',
      phone_number: null,
      image_url: null,
      teacher: null,
    },
    student: null,
    created_at: '2026-01-01T00:00:00+05:00',
    updated_at: '2026-01-01T00:00:00+05:00',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useSessionStore.setState({
    status: 'anonymous',
    user: null,
    permissions: new Set(),
    roleNames: [],
    persona: 'staff',
    logoutReason: null,
  });
});

describe('session store', () => {
  it('вход — это два запроса: токен, затем профиль под ним', async () => {
    api.login.mockResolvedValueOnce({ type: 'Bearer', access_token: 'jwt-123' });
    api.me.mockResolvedValueOnce(meResponse());

    await store().signIn('j.bozorov', 'parol');

    expect(api.login).toHaveBeenCalledWith('j.bozorov', 'parol');
    expect(api.me).toHaveBeenCalledOnce();
    expect(store().status).toBe('authenticated');
    // Токен обязан лежать до вызова /user/me, иначе тот ответил бы 401.
    expect(getToken()).toBe('jwt-123');
  });

  it('права раскладываются в плоский набор из всех ролей', async () => {
    api.login.mockResolvedValueOnce({ type: 'Bearer', access_token: 'jwt-123' });
    api.me.mockResolvedValueOnce(
      meResponse({
        roles: [
          { id: 1, name: 'teacher', permissions: [{ id: 1, name: 'read:quiz' }] },
          { id: 2, name: 'tutor', permissions: [{ id: 2, name: 'read:group' }] },
        ],
      }),
    );

    await store().signIn('j.bozorov', 'parol');

    expect(store().roleNames).toEqual(['teacher', 'tutor']);
    expect([...store().permissions].sort()).toEqual(['read:group', 'read:quiz']);
  });

  it('персона определяется по анкете, а не по названию роли', async () => {
    api.login.mockResolvedValueOnce({ type: 'Bearer', access_token: 'jwt-s' });
    api.me.mockResolvedValueOnce(
      meResponse({
        employee: null,
        student: {
          id: 7,
          first_name: 'Islom',
          last_name: 'Abdullayev',
          third_name: '',
          full_name: 'Abdullayev Islom',
          image_path: null,
          group: { id: 3, name: 'DI-24-01' },
          university: null,
          specialty: null,
          education_form: null,
          education_type: null,
          payment_form: null,
          education_lang: null,
          faculty: null,
          level: null,
          semester: null,
          address: null,
          avg_gpa: null,
        },
      }),
    );

    await store().signIn('talaba', 'parol');

    expect(store().persona).toBe('student');
  });

  it('неверный пароль не создаёт сессию', async () => {
    api.login.mockRejectedValueOnce(new ApiError(401, "Login yoki parol noto'g'ri"));

    await expect(store().signIn('j.bozorov', 'xato')).rejects.toThrow("Login yoki parol noto'g'ri");
    expect(store().status).toBe('anonymous');
    expect(getToken()).toBeNull();
  });

  it('упавший /user/me не оставляет половину сессии', async () => {
    api.login.mockResolvedValueOnce({ type: 'Bearer', access_token: 'jwt-123' });
    api.me.mockRejectedValueOnce(new ApiError(500, 'Server xatosi'));

    await expect(store().signIn('j.bozorov', 'parol')).rejects.toThrow('Server xatosi');
    // Иначе интерфейс остался бы с токеном, но без прав — и без объяснения.
    expect(store().status).toBe('anonymous');
    expect(getToken()).toBeNull();
  });

  it('bootstrap без токена сразу отдаёт анонимную сессию', async () => {
    useSessionStore.setState({ status: 'unknown' });

    await store().bootstrap();

    expect(api.me).not.toHaveBeenCalled();
    expect(store().status).toBe('anonymous');
  });

  it('bootstrap с токеном восстанавливает сессию', async () => {
    localStorage.setItem('token', 'jwt-saved');
    useSessionStore.setState({ status: 'unknown' });
    api.me.mockResolvedValueOnce(meResponse());

    await store().bootstrap();

    expect(store().status).toBe('authenticated');
  });

  it('обрыв сети при обновлении профиля не разлогинивает', async () => {
    api.login.mockResolvedValueOnce({ type: 'Bearer', access_token: 'jwt-123' });
    api.me.mockResolvedValueOnce(meResponse());
    await store().signIn('j.bozorov', 'parol');

    api.me.mockRejectedValueOnce(new ApiError(0, 'Network error'));
    await store().refreshMe();

    // Сессия на сервере жива, пользователь ни в чём не виноват.
    expect(store().status).toBe('authenticated');
    expect(getToken()).toBe('jwt-123');
  });

  it('выход стирает токен и запоминает причину', async () => {
    api.login.mockResolvedValueOnce({ type: 'Bearer', access_token: 'jwt-123' });
    api.me.mockResolvedValueOnce(meResponse());
    await store().signIn('j.bozorov', 'parol');

    store().signOut('idle');

    expect(api.logout).toHaveBeenCalledOnce();
    expect(store().status).toBe('anonymous');
    expect(store().user).toBeNull();
    expect(store().permissions.size).toBe(0);
    expect(getToken()).toBeNull();
    expect(store().logoutReason).toBe('idle');
  });
});
