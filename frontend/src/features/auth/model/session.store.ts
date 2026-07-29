import { create } from 'zustand';
import * as authApi from '@/shared/api/auth';
import type { MeResponse } from '@/shared/api/auth';
import { configureAuth } from '@/shared/api/http';
import { clearToken, getToken, setToken } from '@/shared/lib/tokenStorage';

/**
 * Почему сессию выкинуло. Показывается на экране входа один раз.
 *
 * У приложения нет маршрута `/login` — экран входа рендерится вместо всего
 * остального, — поэтому причина живёт здесь, а не в query-параметрах, как это
 * сделано в старом интерфейсе.
 */
export type LogoutReason = 'idle' | 'session' | null;

/** Кто владеет токеном. Определяется по данным `/user/me`, не по названию роли. */
export type Persona = 'student' | 'staff';

interface SessionState {
  /**
   * `unknown` — токен в хранилище есть, но `/user/me` ещё не ответил. Без этого
   * состояния перезагрузка страницы на мгновение показывала бы экран входа
   * уже вошедшему пользователю.
   */
  status: 'unknown' | 'anonymous' | 'authenticated';
  user: MeResponse | null;
  /** Плоский набор имён прав из всех ролей — то, на что смотрит интерфейс. */
  permissions: ReadonlySet<string>;
  roleNames: string[];
  persona: Persona;
  logoutReason: LogoutReason;

  /** Прочитать токен из хранилища и восстановить сессию. Вызывается один раз. */
  bootstrap: () => Promise<void>;
  signIn: (username: string, password: string) => Promise<void>;
  refreshMe: () => Promise<void>;
  signOut: (reason?: LogoutReason) => void;
  clearLogoutReason: () => void;
}

const ANONYMOUS = {
  status: 'anonymous' as const,
  user: null,
  permissions: new Set<string>() as ReadonlySet<string>,
  roleNames: [] as string[],
  persona: 'staff' as Persona,
};

function fromMe(user: MeResponse) {
  const permissions = new Set<string>();
  for (const role of user.roles ?? []) {
    for (const permission of role.permissions ?? []) permissions.add(permission.name);
  }

  return {
    status: 'authenticated' as const,
    user,
    permissions: permissions as ReadonlySet<string>,
    roleNames: (user.roles ?? []).map((r) => r.name),
    // Роль — изменяемая строка в базе, а `student` в ответе — факт: у
    // сотрудника его нет никогда. По нему и различаем.
    persona: (user.student ? 'student' : 'staff') as Persona,
  };
}

export const useSessionStore = create<SessionState>()((set, get) => ({
  ...ANONYMOUS,
  status: 'unknown',
  logoutReason: null,

  bootstrap: async () => {
    if (!getToken()) {
      set({ ...ANONYMOUS });
      return;
    }
    await get().refreshMe();
  },

  signIn: async (username, password) => {
    const { access_token } = await authApi.login(username, password);
    // Токен нужно положить до запроса профиля: `/user/me` уже требует его.
    setToken(access_token);

    try {
      set({ ...fromMe(await authApi.me()), logoutReason: null });
    } catch (error) {
      // Вход прошёл, а профиль не прочитался — держать «половину сессии»
      // нельзя, иначе интерфейс останется без прав и без объяснения.
      clearToken();
      set({ ...ANONYMOUS });
      throw error;
    }
  },

  refreshMe: async () => {
    try {
      set({ ...fromMe(await authApi.me()) });
    } catch {
      // 401 транспорт уже обработал сам: вызвал `unauthorized` ниже, и стор
      // перешёл в anonymous. Здесь остаются 429, 5xx и обрыв сети — это не
      // повод разлогинивать: пользователь ни в чём не виноват, а сессия на
      // сервере жива. Вход держим, экраны покажут свою ошибку сами.
      //
      // Исключение — самый первый запрос: пока профиль неизвестен, показывать
      // приложение не из чего, поэтому падаем на экран входа.
      if (get().status === 'unknown') set({ ...ANONYMOUS });
    }
  },

  signOut: (reason = null) => {
    // Отзыв сессии на сервере (удаляет jti из Redis) — best-effort: даже если
    // запрос не дойдёт, локально выйти мы обязаны.
    if (getToken()) void authApi.logout().catch(() => {});
    clearToken();
    set({ ...ANONYMOUS, logoutReason: reason });
  },

  clearLogoutReason: () => set({ logoutReason: null }),
}));

// Транспорт не знает про стор (иначе цикл импортов), поэтому связываем их здесь.
configureAuth({
  token: () => getToken(),
  unauthorized: (kickedBySession) =>
    useSessionStore.getState().signOut(kickedBySession ? 'session' : null),
});
