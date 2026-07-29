import type { PermissionCode, PermissionMatrix } from '@/entities/access/model/permissions';
import type { Role } from '@/entities/access/model/roles';
import { api } from './http';

interface MatrixResponse {
  matrix: PermissionMatrix;
}

export const getMatrix = () => api.get<MatrixResponse>('/rollar').then((r) => r.matrix);

/** Возвращает матрицу целиком: сервер — единственный источник правды. */
export const setPermission = (role: Role, code: PermissionCode, granted: boolean) =>
  api.patch<MatrixResponse>(`/rollar/${role}`, { code, granted }).then((r) => r.matrix);

/**
 * Сколько учёток у каждой роли. Раньше эти числа были придуманы прямо на
 * экране (`super_admin: 2, admin: 5`) — теперь считает БД.
 */
export const getRoleCounts = () =>
  api
    .get<{ counts: Record<string, number> }>('/foydalanuvchilar/role-counts')
    .then((r) => r.counts);
