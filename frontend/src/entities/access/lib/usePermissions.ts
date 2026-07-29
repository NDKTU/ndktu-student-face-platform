import { useMemo } from 'react';
import { useSessionStore } from '@/features/auth/model/session.store';
import type { Persona } from '@/features/auth/model/session.store';
import { NAV_ITEMS, navItem, type NavItem } from '../model/nav';
import type { NavKey } from '../model/roles';

/**
 * Роль с таким именем бэкенд пропускает мимо всех проверок
 * (`core/dependencies/role_checker.py`). Клиент обязан это повторять: иначе
 * меню администратора зависело бы от того, какие строки успели попасть в
 * `role_permissions`, а сервер при этом разрешал бы ему всё.
 */
const SUPERUSER_ROLE = 'Admin';

export interface Permissions {
  permissions: ReadonlySet<string>;
  roleNames: readonly string[];
  isAdmin: boolean;
  persona: Persona;
  /** Есть ли конкретное право. */
  has: (name: string) => boolean;
  /** Есть ли хотя бы одно из перечисленных. */
  hasAny: (...names: string[]) => boolean;
  /** Разделы меню, доступные текущему пользователю (скрытые исключены). */
  nav: readonly NavItem[];
  /** Доступен ли раздел — для гарда маршрутов. */
  canAccess: (nav: NavKey) => boolean;
  /** Персональные данные студента: ЖШШИР, адрес, соцкатегория. */
  canViewStudentSensitive: boolean;
  /** …и сотрудника. Это отдельное право: выдаётся независимо от студенческого. */
  canViewEmployeeSensitive: boolean;
}

/**
 * Единая точка ответа на вопрос «что можно текущему пользователю».
 * Проверки прав не должны появляться в компонентах в виде разрозненных if.
 */
export function usePermissions(): Permissions {
  const permissions = useSessionStore((s) => s.permissions);
  const roleNames = useSessionStore((s) => s.roleNames);
  const persona = useSessionStore((s) => s.persona);

  return useMemo(() => {
    const isAdmin = roleNames.includes(SUPERUSER_ROLE);
    const has = (name: string) => isAdmin || permissions.has(name);
    const hasAny = (...names: string[]) => names.some(has);

    const allowed = (item: NavItem) => {
      // Персона — свойство самого пользователя, её админский обход не отменяет:
      // студенческий раздел сотруднику всё равно нечем наполнить.
      if (item.persona && item.persona !== persona) return false;
      if (!item.permission) return true;
      const needed = Array.isArray(item.permission) ? item.permission : [item.permission];
      return hasAny(...needed);
    };

    return {
      permissions,
      roleNames,
      isAdmin,
      persona,
      has,
      hasAny,
      nav: NAV_ITEMS.filter((item) => !item.hidden && allowed(item)),
      canAccess: (key) => {
        const item = navItem(key);
        // Раздела нет в списке — значит, это заглушка под будущий экран;
        // закрывать её незачем, содержимого там всё равно нет.
        return item ? allowed(item) : true;
      },
      canViewStudentSensitive: has('read:student_sensitive'),
      canViewEmployeeSensitive: has('read:employee_sensitive'),
    };
  }, [permissions, roleNames, persona]);
}
