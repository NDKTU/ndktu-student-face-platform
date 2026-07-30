import { describe, expect, it } from 'vitest';
import { toCsv } from './downloadCsv';

describe('toCsv', () => {
  it('разделяет точкой с запятой — Excel с запятой в дробях иначе рвёт «4,70»', () => {
    expect(toCsv([['a', 'b'], ['1', '2']])).toBe('a;b\r\n1;2');
  });

  it('берёт в кавычки поле с разделителем внутри', () => {
    expect(toCsv([['Konchilik; texnologiya', 'x']])).toBe('"Konchilik; texnologiya";x');
  });

  it('удваивает кавычки внутри поля', () => {
    expect(toCsv([['«a» "b"']])).toBe('"«a» ""b"""');
  });

  it('поле с переводом строки не ломает строку файла', () => {
    expect(toCsv([['bir\nikki', 'x']])).toBe('"bir\nikki";x');
  });
});
