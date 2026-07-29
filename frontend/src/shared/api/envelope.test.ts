import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAll, getList } from './envelope';

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

const urls = () => fetchMock.mock.calls.map((call) => (call as [string])[0]);

describe('getList', () => {
  it('достаёт массив по имени сущности — ключа «items» на бэкенде нет', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ total: 2, page: 1, limit: 10, faculties: [{ id: 1 }, { id: 2 }] }),
    );

    const page = await getList<{ id: number }>('/faculty/', 'faculties', { page: 1, limit: 10 });

    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(2);
    expect(urls()[0]).toBe('/api/faculty/?page=1&limit=10');
  });

  it('опечатка в имени ключа падает, а не выдаёт пустой список', async () => {
    // Молчаливый [] выглядел бы как «данных нет» — и искали бы не там.
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 1, page: 1, limit: 10, groups: [{}] }));

    await expect(getList('/group/', 'guruhlar', {})).rejects.toThrow(/guruhlar/);
  });
});

describe('getAll', () => {
  it('идёт по страницам, пока не наберёт total', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ total: 3, page: 1, limit: 2, subjects: [1, 2] }))
      .mockResolvedValueOnce(jsonResponse({ total: 3, page: 2, limit: 2, subjects: [3] }));

    const all = await getAll<number>('/subject/', 'subjects', {}, 2);

    expect(all).toEqual([1, 2, 3]);
    expect(urls()).toEqual(['/api/subject/?page=1&limit=2', '/api/subject/?page=2&limit=2']);
  });

  it('одной страницы хватает — второго запроса не делает', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ total: 2, page: 1, limit: 200, subjects: [1, 2] }),
    );

    await getAll('/subject/', 'subjects');

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('совравший total не уводит в бесконечный цикл', async () => {
    // Пустая страница — сигнал остановиться, даже если сервер обещал больше.
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ total: 99, page: 1, limit: 2, subjects: [1, 2] }))
      .mockResolvedValueOnce(jsonResponse({ total: 99, page: 2, limit: 2, subjects: [] }));

    const all = await getAll<number>('/subject/', 'subjects', {}, 2);

    expect(all).toEqual([1, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('фильтры едут на каждой странице', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ total: 1, page: 1, limit: 200, students: [{ id: 1 }] }),
    );

    await getAll('/students/', 'students', { group_id: 7 });

    expect(urls()[0]).toContain('group_id=7');
  });
});
