import type { Student } from '../model/types';

/**
 * Цвет бейджа статуса студента.
 *
 * Здесь же лежал генератор анкеты для сида: он выводил ЖШШИР, адрес и прочее
 * из хэша студенческого ID. Экспортёров сида больше нет — анкета приходит из
 * БД, — поэтому от файла осталось только оформление.
 */
export function statusTone(tone: Student['tone']) {
  if (tone === 'ok') return { bg: '#EDF7EE', fg: '#157A43', dot: '#22A560' };
  if (tone === 'warn') return { bg: '#FBF3E2', fg: '#B45309', dot: '#D08700' };
  return { bg: '#F1F2F7', fg: '#6B6E82', dot: '#9498AD' };
}
