import type { Role } from '@/entities/access/model/roles';
import { api } from './http';

/** Владелец токена. Ключи совпадают с UserOut на бэкенде. */
export interface SessionUser {
  id: number;
  login: string;
  role: Role;
  displayName: string;
  /** Группа студента; у сотрудников её нет. */
  guruh: string | null;
}

export interface AuthResult {
  token: string;
  user: SessionUser;
}

export const login = (login: string, password: string) =>
  api.post<AuthResult>('/auth/login', { login, password });

/** Вход за демо-персону без пароля — переключатель ролей. В проде выключен. */
export const devLogin = (role: Role) => api.post<AuthResult>('/auth/dev-login', { role });

export const me = () => api.get<SessionUser>('/auth/me');
