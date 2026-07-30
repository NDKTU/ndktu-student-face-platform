/**
 * Роли системы.
 *
 * ВНИМАНИЕ: на бэкенде роль — обычная строка в таблице `roles`, которую заводит
 * администратор. Закрытого списка там нет и быть не может. Этот перечень
 * остался только у экранов «Rollar» и «Xodimlar», ещё не переведённых на
 * настоящий справочник ролей, и уезжает вместе с ними. Ничего нового на нём
 * строить нельзя — доступом заведуют права (см. `nav.ts` и `usePermissions`).
 */
export const ROLES = [
  'super_admin',
  'admin',
  'dekan',
  'kafedra_mudiri',
  'oqituvchi',
  'talaba',
] as const;

export type Role = (typeof ROLES)[number];

/** Разделы навигации. Ключи совпадают с сегментами роутов. */
export const NAV_KEYS = [
  'bosh',
  'tuzilma',
  'fanlar',
  'reja',
  'savollar',
  'testlar',
  'kurslar',
  'avazlar',
  'reyting',
  'psixologiya',
  'foydalanuvchilar',
  'rollar',
  'hemis',
  'sozlamalar',
  'tfanlarim',
  'tvazlar',
  'guruhim',
  'fanlarim',
  'stestlar',
  'svazlar',
  'profil',
  'bildirishnomalar',
] as const;

export type NavKey = (typeof NAV_KEYS)[number];

/**
 * Человекочитаемое название роли. Живёт здесь, а не на бэкенде: это UI-текст,
 * и дублировать его в Python значило бы держать перевод в двух местах — сервер
 * отдаёт только `roleId`.
 */
export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Admin',
  admin: 'Administrator',
  dekan: 'Dekan',
  kafedra_mudiri: 'Kafedra mudiri',
  oqituvchi: "O'qituvchi",
  talaba: 'Talaba',
};

/** Роли, которые можно назначить сотруднику — студента здесь нет. */
export const ASSIGNABLE_ROLES: readonly Role[] = [
  'super_admin',
  'admin',
  'dekan',
  'kafedra_mudiri',
  'oqituvchi',
];

/** Фирменный цвет роли: аватары, бейджи, персона-свитчер. */
export const ROLE_COLORS: Record<Role, string> = {
  super_admin: '#2836C7',
  admin: '#0E7C86',
  dekan: '#B45309',
  kafedra_mudiri: '#6D28D9',
  oqituvchi: '#157A43',
  talaba: '#A33254',
};

/** Запасная палитра для ролей, которых нет в `ROLE_COLORS`. */
const FALLBACK_COLORS = ['#2836C7', '#0E7C86', '#B45309', '#6D28D9', '#157A43', '#A33254'];

/**
 * Подпись роли по её имени с бэкенда.
 *
 * Роли заводит администратор, поэтому имя может быть любым: `Admin`,
 * `psixologik`, `tutor`. Для известных берём готовый перевод, для остальных
 * показываем как есть — это честнее, чем прятать роль за «Noma'lum».
 */
export function roleLabel(name: string): string {
  return ROLE_LABELS[name as Role] ?? name;
}

/**
 * Цвет роли. Для незнакомых имён считается по строке, а не выдаётся по кругу:
 * иначе у одного и того же пользователя цвет менялся бы от загрузки к загрузке.
 */
export function roleColor(name: string): string {
  const known = ROLE_COLORS[name as Role];
  if (known) return known;

  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length]!;
}
