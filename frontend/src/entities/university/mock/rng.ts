import type { Person } from '../model/types';

/**
 * Детерминированный генератор из прототипа. Seed зафиксирован — данные должны
 * воспроизводиться от запуска к запуску, иначе на них нельзя писать тесты
 * и нельзя сверять скриншоты с эталоном.
 */
export const MOCK_SEED = 20220914;

const MALE_NAMES = [
  'Aziz', 'Bekzod', 'Sardor', 'Jasur', 'Diyorbek', 'Otabek', 'Sherzod', 'Farrux',
  'Ulugbek', 'Islom', 'Nodirbek', 'Shohruh', 'Akmal', 'Doston', 'Sanjar', 'Elyor',
  'Javohir', 'Mirjalol', 'Alisher', 'Kamron', 'Behruz', 'Asilbek', 'Muhammadali', 'Xurshid',
];

const FEMALE_NAMES = [
  'Nilufar', 'Gulnora', 'Sevara', 'Dilnoza', 'Madina', 'Zarina', 'Malika', 'Feruza',
  'Dildora', 'Kamola', 'Nozima', 'Shahnoza', 'Mohira', 'Ozoda', 'Gulbahor', 'Maftuna',
  'Sabina', 'Nargiza', 'Charos', 'Yulduz', 'Robiya', 'Sitora', 'Zilola', 'Munisa',
];

const SURNAMES = [
  'Karimov', 'Rahimov', 'Yusupov', 'Qodirov', 'Abdullayev', 'Mirzayev', 'Xolmatov',
  'Islomov', 'Tursunov', 'Jorayev', 'Rustamov', 'Umarov', 'Sultonov', 'Nazarov',
  'Saidov', 'Ismoilov', 'Ergashev', 'Toshev', 'Yoldoshev', 'Ochilov', 'Xamdamov', 'Bozorov',
];

/**
 * Линейный конгруэнтный генератор — тот же, что в прототипе.
 * Состояние держим в экземпляре, а не в модуле: два независимых вызова
 * buildUniversity() должны давать одинаковый результат.
 */
export class Rng {
  private seed: number;
  private uidCounter = 5000;

  constructor(seed: number = MOCK_SEED) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]!;
  }

  /**
   * Мок-идентификатор. С тех пор как id стали числами, префикс («g5026») уже
   * не нужен: тип общий с тем, что отдаёт API. В БД эти значения не едут —
   * там ключ выдаёт сама база, — но типы должны совпадать.
   */
  uid(): number {
    return this.uidCounter++;
  }

  person(gender?: 'm' | 'f'): Person {
    const g = gender ?? (this.next() < 0.52 ? 'm' : 'f');
    const first = g === 'm' ? this.pick(MALE_NAMES) : this.pick(FEMALE_NAMES);
    const base = this.pick(SURNAMES);
    const sur = g === 'f' ? `${base}a` : base;
    const father = this.pick(MALE_NAMES);
    const suffix = g === 'm' ? " o'g'li" : ' qizi';

    return {
      gender: g,
      first,
      sur,
      base,
      full: `${sur} ${first} ${father}${suffix}`,
      short: `${sur} ${first[0]}.`,
      display: `${first} ${sur}`,
    };
  }

  /** Разбивает total на n слагаемых с разбросом — чтобы группы не были одинаковыми. */
  splitVaried(total: number, n: number): number[] {
    const parts = splitEven(total, n);
    for (let i = 0; i + 1 < n; i += 2) {
      const d = Math.floor(this.next() * 4);
      if (parts[i + 1]! - d >= 15 && parts[i]! + d <= 34) {
        parts[i] = parts[i]! + d;
        parts[i + 1] = parts[i + 1]! - d;
      }
    }
    return parts;
  }
}

/** Разбивает total на n примерно равных слагаемых; остаток раздаётся первым. */
export function splitEven(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const rem = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

/**
 * FNV-1a. Нужен там, где значение должно зависеть от ключа, а не от порядка
 * вызовов — например паспортные данные сотрудника по его ФИО.
 */
export function hashStr(value: string): number {
  const s = String(value);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** «Karimov Aziz» → «KA». Берёт первые буквы двух первых значимых слов. */
export function initials(name: string): string {
  return (name || '')
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/** Транслит для логинов: «O'ktam» → «oktam». */
export function translit(value: string): string {
  return (value || '').toLowerCase().replace(/['`]/g, '').replace(/[^a-z]/g, '');
}

/** Префикс кода группы из названия специальности: «Dasturiy injiniring» → «DI». */
export function namePrefix(name: string): string {
  const words = name.split(/\s+/);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return name.slice(0, 3).toUpperCase();
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
