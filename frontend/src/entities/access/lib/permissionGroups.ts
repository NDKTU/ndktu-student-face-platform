import type { PermissionInfo } from '@/shared/api/rollar';

/**
 * Права на бэкенде — плоский список из полутора сотен строк: их заводит сам
 * сервер, обходя маршруты при старте. Показывать такой список одной простынёй
 * нельзя, поэтому группируем по ресурсу.
 *
 * Имена почти всегда выглядят как `<действие>:<ресурс>` (`read:faculty`), но
 * не все: у `user:me`, `quiz_process:start_quiz` и `hemis_admin_sync` слева
 * стоит не действие. Такие собираем в отдельную группу — придумывать им
 * ресурс значило бы врать о структуре.
 */

/** Действия, по которым право раскладывается на «ресурс + операция». */
const CRUD_ACTIONS = ['create', 'read', 'update', 'delete'] as const;

export interface PermissionGroup {
  /** Ресурс или служебное имя группы. */
  key: string;
  permissions: PermissionInfo[];
}

/** «read:faculty» → действие «read»; для нестандартных имён — null. */
export function permissionAction(name: string): string | null {
  const [action, ...rest] = name.split(':');
  if (rest.length === 0) return null;
  return (CRUD_ACTIONS as readonly string[]).includes(action!) ? action! : null;
}

/** «read:faculty» → «faculty»; для нестандартных имён — служебная группа. */
export function permissionResource(name: string): string {
  const [action, ...rest] = name.split(':');
  if (rest.length === 0) return 'maxsus';
  return (CRUD_ACTIONS as readonly string[]).includes(action!)
    ? rest.join(':').toLowerCase()
    : 'maxsus';
}

/**
 * Раскладывает права по ресурсам. Внутри группы порядок фиксированный
 * (create/read/update/delete), чтобы колонки не прыгали между ресурсами.
 */
export function groupPermissions(permissions: PermissionInfo[]): PermissionGroup[] {
  const groups = new Map<string, PermissionInfo[]>();

  for (const permission of permissions) {
    const key = permissionResource(permission.name);
    const list = groups.get(key);
    if (list) list.push(permission);
    else groups.set(key, [permission]);
  }

  const order = (name: string) => {
    const action = permissionAction(name);
    const index = action ? CRUD_ACTIONS.indexOf(action as (typeof CRUD_ACTIONS)[number]) : -1;
    return index === -1 ? CRUD_ACTIONS.length : index;
  };

  return [...groups.entries()]
    .map(([key, list]) => ({
      key,
      permissions: [...list].sort(
        (a, b) => order(a.name) - order(b.name) || a.name.localeCompare(b.name),
      ),
    }))
    // «Прочие» — всегда последними: это не ресурс, а всё остальное.
    .sort((a, b) => {
      if (a.key === 'maxsus') return 1;
      if (b.key === 'maxsus') return -1;
      return a.key.localeCompare(b.key);
    });
}
