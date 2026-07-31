import { describe, expect, it } from 'vitest';
import { displayName } from './displayName';

describe('displayName', () => {
  it('поднимает первую букву каждого слова', () => {
    expect(displayName('konchilik fakulteti')).toBe('Konchilik Fakulteti');
  });

  it('опускает регистр остальных букв — ALL CAPS тоже приводится к виду', () => {
    // В базу всё равно уйдёт нижний регистр, поэтому подсказка в форме должна
    // показывать итог, а не то, что набрали.
    expect(displayName('KONCHILIK FAKULTETI')).toBe('Konchilik Fakulteti');
  });

  it('служебное слово капсом тоже становится строчным', () => {
    expect(displayName('konchilik VA metallurgiya')).toBe('Konchilik va Metallurgiya');
  });

  it('служебные слова остаются строчными', () => {
    expect(displayName('konchilik va metallurgiya fakulteti')).toBe(
      'Konchilik va Metallurgiya Fakulteti',
    );
  });

  it('служебное слово в начале всё равно с заглавной', () => {
    expect(displayName('va boshqalar')).toBe('Va Boshqalar');
  });

  it('пропускает небуквенный префикс', () => {
    expect(displayName('(kechki) bo‘lim')).toBe('(Kechki) Bo‘lim');
  });

  it('схлопывает лишние пробелы', () => {
    expect(displayName('  kimyo   texnologiyasi ')).toBe('Kimyo Texnologiyasi');
  });

  it('пустая строка остаётся пустой', () => {
    expect(displayName('')).toBe('');
  });
});
