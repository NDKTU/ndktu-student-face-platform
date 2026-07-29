import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Role } from '@/entities/access/model/roles';
import * as authApi from '@/shared/api/auth';
import type { SessionUser } from '@/shared/api/auth';
import { configureAuth } from '@/shared/api/http';

/** Как пользователь вошёл — влияет только на текст приветствия. */
export type LoginMethod = 'hemis' | 'staff' | 'dev';

interface SessionState {
  loggedIn: boolean;
  token: string | null;
  user: SessionUser | null;
  method: LoginMethod | null;

  /** Роль владельца токена. До входа — заглушка, экраны её не увидят. */
  role: Role;
  /** Логин сотрудника; нужен шапке профиля. */
  login: string | null;

  signIn: (login: string, password: string) => Promise<void>;
  /** Вход одним кликом за демо-персону: пароль не спрашивается. */
  signInAs: (role: Role, method?: LoginMethod) => Promise<void>;
  signOut: () => void;
}

function session(token: string, user: SessionUser, method: LoginMethod) {
  return { loggedIn: true, token, user, method, role: user.role, login: user.login };
}

const EMPTY = {
  loggedIn: false,
  token: null,
  user: null,
  method: null,
  role: 'talaba' as Role,
  login: null,
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      ...EMPTY,

      signIn: async (login, password) => {
        const { token, user } = await authApi.login(login, password);
        set(session(token, user, 'staff'));
      },

      signInAs: async (role, method = 'dev') => {
        const { token, user } = await authApi.devLogin(role);
        set(session(token, user, method));
      },

      signOut: () => set(EMPTY),
    }),
    {
      name: 'ndktu-lms-session',
      // id стали числами: сохранённая сессия хранит старый uuid-строкой.
      // Миграции нет — просто выбрасываем её, пользователь войдёт заново.
      version: 1,
      // sessionStorage, а не localStorage: сессия не должна переживать закрытие вкладки.
      storage: {
        getItem: (name) => {
          const value = sessionStorage.getItem(name);
          return value ? JSON.parse(value) : null;
        },
        setItem: (name, value) => sessionStorage.setItem(name, JSON.stringify(value)),
        removeItem: (name) => sessionStorage.removeItem(name),
      },
    },
  ),
);

// Транспорт не знает про стор (иначе цикл импортов), поэтому связываем их здесь.
configureAuth({
  token: () => useSessionStore.getState().token,
  unauthorized: () => useSessionStore.getState().signOut(),
});
