import { api } from './http';

/**
 * Ответ `GET /user/me` — единственный источник правды о владельце токена:
 * кто он, какие у него роли и, главное, какие права. Поля повторяют
 * `UserMeResponse` бэкенда; лишнего здесь быть не должно, иначе появится
 * соблазн прочитать то, чего сервер не отдаёт.
 */
export interface PermissionInfo {
  id: number;
  name: string;
}

export interface RoleInfo {
  id: number;
  name: string;
  permissions: PermissionInfo[];
}

export interface KafedraInfo {
  id: number;
  name: string;
}

export interface EmployeeInfo {
  id: number;
  first_name: string;
  last_name: string;
  third_name: string;
  full_name: string;
  phone_number: string | null;
  image_url: string | null;
  teacher: { id: number; kafedra: KafedraInfo | null } | null;
}

export interface StudentInfo {
  id: number;
  first_name: string;
  last_name: string;
  third_name: string;
  full_name: string;
  image_path: string | null;
  group: { id: number; name: string } | null;
  university: string | null;
  specialty: string | null;
  education_form: string | null;
  education_type: string | null;
  payment_form: string | null;
  education_lang: string | null;
  faculty: string | null;
  level: string | null;
  semester: string | null;
  address: string | null;
  avg_gpa: number | null;
}

export interface MeResponse {
  id: number;
  username: string;
  roles: RoleInfo[];
  /** Заполнено у сотрудников. У студента — null. */
  employee: EmployeeInfo | null;
  /** Заполнено у студентов. У сотрудника — null. */
  student: StudentInfo | null;
  created_at: string;
  updated_at: string;
}

interface LoginResponse {
  type: string;
  access_token: string;
}

/**
 * Вход — два запроса, и иначе не получится: `/user/login` отдаёт только токен,
 * без единого поля о пользователе. Кто вошёл и что ему можно, выясняет уже
 * `/user/me` — и делает это с новым токеном, поэтому порядок обязателен.
 */
export const login = (username: string, password: string) =>
  api.post<LoginResponse>('/user/login', { username, password });

export const me = () => api.get<MeResponse>('/user/me');

/** Отзывает сессию на сервере: удаляет `jti` из Redis. */
export const logout = () => api.post<void>('/user/logout');

/** Смена собственных логина/пароля. Требует текущий пароль. */
export const changeCredentials = (body: {
  current_password: string;
  username?: string;
  password?: string;
}) => api.put<void>('/user/me/credentials', body);
