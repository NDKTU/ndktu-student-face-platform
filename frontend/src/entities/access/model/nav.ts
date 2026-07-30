import type { NavKey } from './roles';

export interface NavItem {
  key: NavKey;
  path: string;
  section: 'asosiy' | 'boshqaruv';
  /**
   * Достаточно любого из перечисленных прав. Отсутствие поля означает, что
   * раздел открыт всякому, кто вошёл, — как «профиль» или «настройки».
   */
  permission?: string | string[];
  /**
   * Один и тот же предмет с разных сторон: студент тесты сдаёт, преподаватель
   * их составляет. Правами это не различить — у обоих есть `read:quiz`.
   */
  persona?: 'student' | 'staff';
  /** Доступен по адресу, но в меню не выводится. */
  hidden?: true;
}

/**
 * Единый список разделов: и меню, и гард маршрутов читают его.
 *
 * Права здесь — настоящие имена с бэкенда: их выдаёт `/user/me`, и по ним же
 * сервер решает, пускать ли запрос. Раскладки «роль → разделы» больше нет:
 * роли в базе заводит администратор, и зашитый список ролей неизбежно бы с
 * ней разошёлся.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'bosh', path: '/bosh', section: 'asosiy' },

  { key: 'tuzilma', path: '/tuzilma', section: 'asosiy', permission: 'read:faculty' },
  { key: 'fanlar', path: '/fanlar', section: 'asosiy', permission: 'read:subject' },
  // Модуль учебного плана появляется на бэкенде отдельной миграцией: пока
  // права `read:curriculum` не существует, раздел просто не показывается.
  { key: 'reja', path: '/reja', section: 'asosiy', permission: 'read:curriculum' },
  { key: 'savollar', path: '/savollar', section: 'asosiy', permission: 'read:question', persona: 'staff' },
  { key: 'testlar', path: '/testlar', section: 'asosiy', permission: 'read:quiz', persona: 'staff' },
  { key: 'kurslar', path: '/kurslar', section: 'asosiy', permission: 'read:course' },
  // Преподаватель проверяет работы, администратор распоряжается заданиями
  // целиком — это разные права, а не разные роли.
  { key: 'tvazlar', path: '/tvazlar', section: 'asosiy', permission: 'update:submission', persona: 'staff' },
  { key: 'avazlar', path: '/avazlar', section: 'asosiy', permission: 'delete:assignment', persona: 'staff' },
  { key: 'tfanlarim', path: '/tfanlarim', section: 'asosiy', permission: 'read:subject', persona: 'staff' },
  // Рейтинг считает сервер по оценкам студентов; право то же, что на список
  // преподавателей, — отдельного имени бэкенд не вводит.
  { key: 'reyting', path: '/reyting', section: 'asosiy', permission: 'read:teacher', persona: 'staff' },

  { key: 'stestlar', path: '/stestlar', section: 'asosiy', permission: 'quiz_process:start_quiz', persona: 'student' },
  { key: 'svazlar', path: '/svazlar', section: 'asosiy', permission: 'create:submission', persona: 'student' },
  { key: 'fanlarim', path: '/fanlarim', section: 'asosiy', persona: 'student' },
  { key: 'guruhim', path: '/guruhim', section: 'asosiy', persona: 'student' },

  {
    key: 'foydalanuvchilar',
    path: '/foydalanuvchilar',
    section: 'boshqaruv',
    permission: ['read:user', 'read:student', 'read:employee'],
  },
  { key: 'rollar', path: '/rollar', section: 'boshqaruv', permission: 'read:role' },
  { key: 'sozlamalar', path: '/sozlamalar', section: 'boshqaruv' },

  { key: 'profil', path: '/profil', section: 'boshqaruv', hidden: true },
  { key: 'bildirishnomalar', path: '/bildirishnomalar', section: 'boshqaruv', hidden: true },
];

const BY_KEY = new Map(NAV_ITEMS.map((item) => [item.key, item]));

export function navItem(key: NavKey): NavItem | undefined {
  return BY_KEY.get(key);
}
