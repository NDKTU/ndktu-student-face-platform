/** Роли системы. Порядок — от самой широкой к самой узкой. */
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
  'foydalanuvchilar',
  'rollar',
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
 * Какие разделы видит каждая роль и в каком порядке.
 * «profil» и «bildirishnomalar» доступны всем и в меню не показываются.
 */
export const NAV_BY_ROLE: Record<Role, readonly NavKey[]> = {
  super_admin: [
    'bosh', 'tuzilma', 'fanlar', 'reja', 'savollar', 'testlar',
    'kurslar', 'avazlar', 'foydalanuvchilar', 'rollar', 'sozlamalar',
  ],
  admin: ['bosh', 'tuzilma', 'fanlar', 'reja', 'foydalanuvchilar', 'sozlamalar'],
  dekan: ['bosh', 'tuzilma', 'fanlar', 'reja'],
  kafedra_mudiri: ['bosh', 'tuzilma', 'fanlar', 'reja'],
  oqituvchi: ['bosh', 'tfanlarim', 'savollar', 'testlar', 'tvazlar'],
  talaba: ['bosh', 'guruhim', 'fanlarim', 'stestlar', 'svazlar'],
};

/** Роли, которым разрешено создавать/менять/удалять записи структуры. */
export const WRITE_ROLES: readonly Role[] = ['super_admin', 'admin', 'dekan', 'kafedra_mudiri'];

/**
 * Роли, которым видна вкладка «Maxfiy ma'lumot» в карточке студента
 * (ЖШШИР, адрес, соцкатегория). Ограничение по персональным данным —
 * расширять этот список без явного требования нельзя.
 */
export const SENSITIVE_DATA_ROLES: readonly Role[] = ['super_admin', 'admin'];

/**
 * У сотрудников правило строже: паспорт и ЖШШИР видит только super_admin.
 * Два правила намеренно разные — см. sensitiveAccess.test.ts. Решение всё
 * равно принимает сервер, здесь мы лишь не шлём заведомо запрещённый запрос.
 */
export const EMPLOYEE_SENSITIVE_ROLES: readonly Role[] = ['super_admin'];

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

/**
 * Демо-персоны переключателя ролей. Логин каждой совпадает с названием роли
 * (см. tools/export-users.ts) — по нему бэкенд и выдаёт токен.
 */
export interface Persona {
  role: Role;
  user: string;
  title: string;
  /** Группа демо-студента: сервер по ней урезает его тесты и задания. */
  guruh?: string;
}

export const PERSONAS: Record<Role, Persona> = {
  super_admin: { role: 'super_admin', user: 'Sardor Aliyev', title: 'Super Admin' },
  admin: { role: 'admin', user: 'Nodira Karimova', title: 'Administrator' },
  dekan: { role: 'dekan', user: 'Rustam Qodirov', title: 'Dekan' },
  kafedra_mudiri: { role: 'kafedra_mudiri', user: 'Malika Yusupova', title: 'Kafedra mudiri' },
  oqituvchi: { role: 'oqituvchi', user: 'Jasur Bozorov', title: "O'qituvchi" },
  talaba: { role: 'talaba', user: 'Islom Abdullayev', title: 'Talaba', guruh: 'DI-24-01' },
};
