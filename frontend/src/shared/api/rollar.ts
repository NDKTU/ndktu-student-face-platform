import { getAll } from './envelope';
import { api } from './http';

/**
 * Граница до бэкенда для ролей и прав.
 *
 * И роли, и права — обычные строки в БД: роль заводит администратор, а права
 * бэкенд заводит сам, обходя маршруты при старте. Закрытых списков ни там,
 * ни там нет, поэтому матрица строится из того, что пришло с сервера.
 */

export interface RoleInfo {
  id: number;
  name: string;
}

export interface PermissionInfo {
  id: number;
  name: string;
}

export interface RoleWithPermissions extends RoleInfo {
  permissions: PermissionInfo[];
}

/** Роли вместе с их правами — список отдаёт их вложенными. */
export const getRoles = () => getAll<RoleWithPermissions>('/role/', 'roles');

/** Полный словарь прав: из него строятся строки матрицы. */
export const getPermissions = () => getAll<PermissionInfo>('/permission/', 'permissions');

export const createRole = (name: string) => api.post<RoleInfo>('/role/', { name });

export const deleteRole = (roleId: number) => api.delete(`/role/${roleId}`);

/**
 * Назначает роли ровно этот набор прав.
 *
 * Эндпоинт заменяет набор целиком, а не переключает одно право, — поэтому
 * экран присылает весь список после каждой галочки.
 */
export const assignPermissions = (roleId: number, permissionIds: number[]) =>
  api.post<{ message: string }>('/role/assign_permission', {
    role_id: roleId,
    permission_ids: permissionIds,
  });

/** Сколько учёток у каждой роли. Ключ — имя роли, как она заведена в БД. */
export const getRoleCounts = () =>
  api.get<{ counts: Record<string, number> }>('/user/role-counts').then((r) => r.counts);
