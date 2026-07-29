import { api, qs } from './http';

/**
 * Списочные ответы бэкенда всегда обёрнуты, но ключ с массивом называется по
 * сущности, а не единообразно: `{total, page, limit, faculties: [...]}`,
 * `{... , subjects: [...]}`, `{... , students: [...]}`. Ключа `items` нет
 * нигде. Разворачиваем обёртку здесь, чтобы каждый модуль API не повторял
 * одну и ту же распаковку — и чтобы имя ключа встречалось ровно один раз.
 */
export interface Paged<T> {
  total: number;
  page: number;
  limit: number;
  items: T[];
}

type Envelope<T> = {
  total?: number;
  page?: number;
  limit?: number;
} & Record<string, T[] | number | undefined>;

function unwrap<T>(raw: Envelope<T>, key: string, fallbackLimit: number): Paged<T> {
  const items = raw[key];
  if (!Array.isArray(items)) {
    // Опечатка в имени ключа иначе тихо дала бы пустой список, и экран
    // выглядел бы как «данных нет» вместо «запрос собран неверно».
    throw new Error(`Javobda "${key}" massivi topilmadi`);
  }
  return {
    total: raw.total ?? items.length,
    page: raw.page ?? 1,
    limit: raw.limit ?? fallbackLimit,
    items,
  };
}

/** Одна страница списка. */
export async function getList<T>(
  path: string,
  key: string,
  params: Record<string, unknown> = {},
): Promise<Paged<T>> {
  const raw = await api.get<Envelope<T>>(`${path}${qs(params)}`);
  return unwrap<T>(raw, key, Number(params.limit) || 0);
}

/**
 * Весь список целиком, страница за страницей.
 *
 * Только для экранов, где пагинации в интерфейсе нет и весь набор нужен сразу
 * (справочник фанов, роли, выпадающие списки факультетов). Для студентов
 * (больше тысячи строк) это осознанный компромисс, а не образец: экрану нужна
 * своя пагинация, и до неё здесь стоит крупный `pageSize`.
 */
export async function getAll<T>(
  path: string,
  key: string,
  params: Record<string, unknown> = {},
  pageSize = 200,
): Promise<T[]> {
  const all: T[] = [];

  for (let page = 1; ; page += 1) {
    const chunk = await getList<T>(path, key, { ...params, page, limit: pageSize });
    all.push(...chunk.items);

    // Пустая страница страхует от бесконечного цикла, если `total` соврёт.
    if (chunk.items.length === 0 || all.length >= chunk.total) break;
  }

  return all;
}
