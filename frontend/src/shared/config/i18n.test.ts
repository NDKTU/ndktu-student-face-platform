import { describe, expect, it } from 'vitest';
import i18n, { resources } from './i18n';
import { NAV_KEYS } from '@/entities/access/model/roles';

describe('i18n', () => {
  it('у каждого раздела навигации есть подпись', () => {
    NAV_KEYS.forEach((key) => {
      expect(i18n.t(key, { ns: 'nav' }), key).not.toBe(key);
    });
  });

  it('ключи с двоеточием не режутся на неймспейс и ключ', () => {
    // nsSeparator у нас выключен намеренно: имена прав вида «read:faculty»
    // содержат двоеточие, и i18next по умолчанию принял бы «read» за неймспейс.
    expect(i18n.t('resource.psychology_results', { ns: 'rollar' })).not.toContain('resource.');
  });

  it('у ресурсов прав есть узбекские подписи', () => {
    // Полный список ресурсов приходит с сервера — проверяем те, что точно
    // существуют: их имена зашиты в маршрутах бэкенда.
    ['faculty', 'kafedra', 'curriculum', 'quiz', 'student', 'maxsus'].forEach((key) => {
      expect(i18n.t(`resource.${key}`, { ns: 'rollar' }), key).not.toBe(`resource.${key}`);
    });
  });

  it('не осталось незаполненных строк-заглушек', () => {
    const flat = JSON.stringify(resources.uz);
    expect(flat).not.toMatch(/TODO|TBD|FIXME/i);
  });
});
