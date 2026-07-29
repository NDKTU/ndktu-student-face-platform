import { useMemo } from 'react';
import { useSessionStore } from '@/features/auth/model/session.store';
import { useRollarStore } from '@/features/rollar/model/rollar.store';
import {
  EMPLOYEE_SENSITIVE_ROLES,
  NAV_BY_ROLE,
  ROLE_COLORS,
  SENSITIVE_DATA_ROLES,
  WRITE_ROLES,
  type NavKey,
  type Role,
} from '../model/roles';
import { buildPermissionMatrix, type PermissionCode } from '../model/permissions';

/**
 * Пока матрица с сервера не приехала (её читает только экран «Rollar»),
 * отвечаем по стартовой раскладке — она совпадает с сидом. Настоящая проверка
 * всё равно на бэкенде: здесь мы только решаем, что рисовать.
 */
const FALLBACK = buildPermissionMatrix();

export interface Permissions {
  role: Role;
  roleColor: string;
  /** Разделы меню, доступные текущей роли. */
  nav: readonly NavKey[];
  /** Может ли роль создавать, менять и удалять записи структуры. */
  canWrite: boolean;
  /** Видит ли роль персональные данные студента. */
  canViewSensitive: boolean;
  /** …и сотрудника: там правило строже, только super_admin. */
  canViewEmployeeSensitive: boolean;
  /** Есть ли у роли конкретное право из матрицы. */
  can: (code: PermissionCode) => boolean;
  /** Доступен ли раздел текущей роли — для гарда роутов. */
  canAccess: (nav: NavKey) => boolean;
}

/**
 * Единая точка ответа на вопрос «что можно текущей роли».
 * Проверки прав не должны появляться в компонентах в виде разрозненных if.
 */
export function usePermissions(): Permissions {
  const role = useSessionStore((s) => s.role);
  const matrix = useRollarStore((s) => s.matrix);

  return useMemo(() => {
    const nav = NAV_BY_ROLE[role];
    // «profil» и «bildirishnomalar» есть у всех, но в меню не выводятся.
    const alwaysAvailable: NavKey[] = ['profil', 'bildirishnomalar'];
    const grants = matrix?.[role] ?? FALLBACK[role];

    return {
      role,
      roleColor: ROLE_COLORS[role],
      nav,
      canWrite: WRITE_ROLES.includes(role),
      canViewSensitive: SENSITIVE_DATA_ROLES.includes(role),
      canViewEmployeeSensitive: EMPLOYEE_SENSITIVE_ROLES.includes(role),
      can: (code) => grants?.[code] ?? false,
      canAccess: (key) => nav.includes(key) || alwaysAvailable.includes(key),
    };
  }, [role, matrix]);
}
