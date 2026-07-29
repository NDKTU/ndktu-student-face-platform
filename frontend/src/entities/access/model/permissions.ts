import type { Role } from './roles';
import { ROLES } from './roles';

/** Модули, по которым раздаются права. */
export const PERMISSION_MODULES = ['LMS', 'CMMS', 'USERS', 'SETTINGS'] as const;
export type PermissionModule = (typeof PERMISSION_MODULES)[number];

export const PERMISSION_CODES = [
  'lms:read', 'lms:write', 'lms:delete',
  'cmms:read', 'cmms:write', 'cmms:delete',
  'users:read', 'users:write', 'users:invite',
  'settings:read', 'settings:write',
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

export interface ModuleDef {
  key: PermissionModule;
  perms: readonly PermissionCode[];
}

/** Раскладка прав по модулям — задаёт порядок в матрице на экране «Rollar». */
export const MODULE_DEFS: readonly ModuleDef[] = [
  { key: 'LMS', perms: ['lms:read', 'lms:write', 'lms:delete'] },
  { key: 'CMMS', perms: ['cmms:read', 'cmms:write', 'cmms:delete'] },
  { key: 'USERS', perms: ['users:read', 'users:write', 'users:invite'] },
  { key: 'SETTINGS', perms: ['settings:read', 'settings:write'] },
];

export type PermissionMatrix = Record<string, Record<PermissionCode, boolean>>;

function grant(codes: readonly PermissionCode[]): Record<PermissionCode, boolean> {
  const result = {} as Record<PermissionCode, boolean>;
  PERMISSION_CODES.forEach((code) => {
    result[code] = false;
  });
  codes.forEach((code) => {
    result[code] = true;
  });
  return result;
}

/** Стартовая матрица прав. На экране «Rollar» её можно менять, кроме super_admin. */
export function buildPermissionMatrix(): PermissionMatrix {
  return {
    super_admin: grant(PERMISSION_CODES),
    admin: grant([
      'lms:read', 'lms:write', 'lms:delete',
      'cmms:read', 'cmms:write',
      'users:read', 'users:write', 'users:invite',
      'settings:read', 'settings:write',
    ]),
    dekan: grant(['lms:read', 'lms:write', 'cmms:read', 'users:read', 'settings:read']),
    kafedra_mudiri: grant(['lms:read', 'lms:write', 'users:read']),
    oqituvchi: grant(['lms:read', 'lms:write']),
    talaba: grant(['lms:read']),
  };
}

/** Системные роли нельзя удалить, а у super_admin — ещё и снять права. */
export const SYSTEM_ROLES: readonly Role[] = ROLES;
