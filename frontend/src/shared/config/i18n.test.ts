import { describe, expect, it } from 'vitest';
import i18n, { resources } from './i18n';
import { PERMISSION_CODES } from '@/entities/access/model/permissions';
import { NAV_KEYS, ROLES } from '@/entities/access/model/roles';

describe('i18n', () => {
  it('переводит коды прав, несмотря на двоеточие в ключе', () => {
    // i18next по умолчанию режет «perm.lms:read» на неймспейс и ключ,
    // из-за чего на экране оставался голый «read».
    PERMISSION_CODES.forEach((code) => {
      const value = i18n.t(`perm.${code}`, { ns: 'rollar' });
      expect(value, code).not.toBe(code);
      expect(value, code).not.toMatch(/^(read|write|delete|invite)$/);
    });
  });

  it('у каждого раздела навигации есть подпись', () => {
    NAV_KEYS.forEach((key) => {
      expect(i18n.t(key, { ns: 'nav' }), key).not.toBe(key);
    });
  });

  it('у каждой роли есть название и описание', () => {
    ROLES.forEach((role) => {
      expect(i18n.t(`role.${role}.name`, { ns: 'rollar' })).not.toContain('role.');
      expect(i18n.t(`role.${role}.desc`, { ns: 'rollar' })).not.toContain('role.');
    });
  });

  it('не осталось незаполненных строк-заглушек', () => {
    const flat = JSON.stringify(resources.uz);
    expect(flat).not.toMatch(/TODO|TBD|FIXME/i);
  });
});
